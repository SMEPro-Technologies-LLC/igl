/* Governed intelligence: query, research, crosswalk, investigate.

   The model never sees the raw tenant database. The service assembles a
   context of records the caller is allowed to see (identities in scope,
   certified and proposed facts above the confidence floor, evidence,
   relationships within maxHops), hands the model that context with record
   ids, and requires every claim in the answer to cite a record id. Citations
   that do not resolve to a record in the context are dropped; if
   requireCitations is set and nothing citable remains, the request fails
   with 422 rather than returning an uncited answer. The whole exchange is
   hashed into the governance receipt. */

import { E, uuid, nowIso } from "./http.js";
import { rowToIdentity, rowToRelationship } from "./projection.js";

const DEFAULT_MODEL = "claude-sonnet-4-5";

function rowToFact(r) { return { id: r.id, subjectId: r.subject_id, predicate: r.predicate, object: JSON.parse(r.object), qualifiers: JSON.parse(r.qualifiers || "{}"), status: r.status, confidence: r.confidence, validFrom: r.valid_from, validTo: r.valid_to, provenance: r.provenance ? JSON.parse(r.provenance) : undefined }; }
function rowToEvidence(r) { return { id: r.id, kind: r.kind, claim: r.claim, sources: JSON.parse(r.sources || "[]"), confidence: r.confidence ?? undefined, status: r.status, corroborationCount: r.corroboration_count, contradictionCount: r.contradiction_count, attributes: JSON.parse(r.attributes || "{}"), provenance: r.provenance ? JSON.parse(r.provenance) : undefined }; }
export { rowToFact, rowToEvidence };

function applyFilter(record, f) {
  const v = f.field.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), record);
  switch (f.operator) {
    case "eq": return v === f.value; case "ne": return v !== f.value;
    case "in": return Array.isArray(f.value) && f.value.includes(v);
    case "not_in": return Array.isArray(f.value) && !f.value.includes(v);
    case "gt": return v > f.value; case "gte": return v >= f.value; case "lt": return v < f.value; case "lte": return v <= f.value;
    case "contains": return Array.isArray(v) ? v.includes(f.value) : typeof v === "string" && v.toLowerCase().includes(String(f.value).toLowerCase());
    case "exists": return (v !== undefined && v !== null) === (f.value !== false);
    case "between": return Array.isArray(f.value) && v >= f.value[0] && v <= f.value[1];
    default: return true;
  }
}

/* Collect the governed context. Scope keys the service understands:
   identityIds[], assetId, subjectId, organizationId, q (text), domains[] (matched
   against attributes.domains / evidence.attributes.domains), matterIndependent. */
export async function assembleContext(db, tenantId, req) {
  const scope = req.scope || {};
  const minConf = typeof req.minimumConfidence === "number" ? req.minimumConfidence : 0;
  const maxHops = Math.min(Math.max(Number(req.maxHops || 2), 0), 12);
  const asOf = req.asOf ? Date.parse(req.asOf) : null;
  let seedIds = [...(scope.identityIds || [])];
  for (const k of ["assetId", "subjectId", "organizationId", "identityId"]) if (scope[k]) seedIds.push(scope[k]);
  if (scope.q) {
    const { results } = await db.prepare("SELECT id FROM identities WHERE tenant_id = ?1 AND status = 'active' AND (display_name LIKE ?2 OR aliases LIKE ?2) LIMIT 25").bind(tenantId, `%${scope.q}%`).all();
    seedIds.push(...results.map((r) => r.id));
  }
  if (!seedIds.length) {
    // No explicit scope: the question itself names things. Pull the most recent active identities as the working set.
    const { results } = await db.prepare("SELECT id FROM identities WHERE tenant_id = ?1 AND status = 'active' ORDER BY created_at DESC LIMIT 25").bind(tenantId).all();
    seedIds = results.map((r) => r.id);
  }
  seedIds = [...new Set(seedIds)];

  // graph expansion
  const ids = new Set(seedIds); let frontier = [...seedIds]; const relationships = [];
  for (let hop = 0; hop < maxHops && frontier.length && ids.size < 200; hop++) {
    const ph = frontier.map(() => "?").join(",");
    const { results } = await db.prepare(`SELECT * FROM relationships WHERE tenant_id = ? AND status IN ('proposed','certified') AND (from_id IN (${ph}) OR to_id IN (${ph})) LIMIT 400`).bind(tenantId, ...frontier, ...frontier).all();
    const next = [];
    for (const r of results) {
      const rel = rowToRelationship(r);
      if ((rel.confidence ?? 1) < minConf) continue;
      if (asOf && rel.effectiveFrom && Date.parse(rel.effectiveFrom) > asOf) continue;
      relationships.push(rel);
      for (const o of [rel.fromId, rel.toId]) if (!ids.has(o)) { ids.add(o); next.push(o); }
    }
    frontier = next;
  }
  const explicit = seedIds.length > 0 && (scope.identityIds?.length || scope.assetId || scope.subjectId || scope.organizationId || scope.identityId || scope.q);
  const idList = [...ids];
  const ph = idList.map(() => "?").join(",");
  const identities = idList.length ? (await db.prepare(`SELECT * FROM identities WHERE tenant_id = ? AND id IN (${ph})`).bind(tenantId, ...idList).all()).results.map(rowToIdentity) : [];
  const facts = idList.length ? (await db.prepare(`SELECT * FROM facts WHERE tenant_id = ? AND status IN ('proposed','certified') AND confidence >= ? AND subject_id IN (${ph}) ORDER BY confidence DESC LIMIT 300`).bind(tenantId, minConf, ...idList).all()).results.map(rowToFact) : [];
  const obligations = idList.length ? (await db.prepare(`SELECT * FROM obligations WHERE tenant_id = ? AND subject_id IN (${ph}) ORDER BY due_date ASC LIMIT 200`).bind(tenantId, ...idList).all()).results : [];
  let evidenceRows = (await db.prepare("SELECT * FROM evidence WHERE tenant_id = ?1 AND status IN ('proposed','certified') ORDER BY created_at DESC LIMIT 300").bind(tenantId).all()).results.map(rowToEvidence);
  if (scope.domains?.length) evidenceRows = evidenceRows.filter((e) => !e.attributes?.domains || e.attributes.domains.some((d) => scope.domains.includes(d)));
  evidenceRows = evidenceRows.filter((e) => (e.confidence ?? 1) >= minConf);
  const filters = req.filters || [];
  const keep = (rec, kind) => filters.every((f) => (f.field.startsWith("relationship.") ? kind !== "relationship" || applyFilter(rec, { ...f, field: f.field.slice("relationship.".length) }) : f.field.startsWith("fact.") ? kind !== "fact" || applyFilter(rec, { ...f, field: f.field.slice(5) }) : f.field === "dueDate" ? kind !== "obligation" || applyFilter(rec, { ...f, field: "due_date" }) : true));
  if (explicit && !identities.length) throw E.unprocessable("The scope names identities that do not exist in this tenant.", { code: "empty_context" });
  return {
    identities, facts: facts.filter((f) => keep(f, "fact")), evidence: evidenceRows,
    relationships: relationships.filter((r) => keep(r, "relationship")),
    obligations: obligations.filter((o) => keep(o, "obligation")).map((r) => ({ id: r.id, subjectId: r.subject_id, title: r.title, obligee: r.obligee, regulation: r.regulation, dueDate: r.due_date, status: r.status, facilityId: r.facility_id })),
  };
}

function contextText(ctx) {
  const L = [];
  L.push("IDENTITIES"); for (const i of ctx.identities) L.push(`[I:${i.id}] ${i.type} "${i.displayName}" attributes=${JSON.stringify(i.attributes)}`);
  L.push("RELATIONSHIPS"); for (const r of ctx.relationships) L.push(`[R:${r.id}] ${r.fromId} --${r.type}(${r.status}, conf ${r.confidence ?? 1})--> ${r.toId}`);
  L.push("FACTS"); for (const f of ctx.facts) L.push(`[F:${f.id}] subject ${f.subjectId} ${f.predicate} = ${JSON.stringify(f.object)} (${f.status}, conf ${f.confidence})`);
  L.push("EVIDENCE"); for (const e of ctx.evidence) L.push(`[E:${e.id}] ${e.kind} (${e.status}, conf ${e.confidence ?? "n/a"}, +${e.corroborationCount}/-${e.contradictionCount}): ${e.claim}`);
  L.push("OBLIGATIONS"); for (const o of ctx.obligations) L.push(`[O:${o.id}] subject ${o.subjectId} "${o.title}" due ${o.dueDate} status ${o.status} regulation ${o.regulation ?? "n/a"} obligee ${o.obligee ?? "n/a"}`);
  return L.join("\n");
}

const CITE_RE = /\[(I|R|F|E|O):([0-9a-f-]{36})\]/g;

export async function callModel(env, { system, user, maxTokens = 1500, model }) {
  if (!env.ANTHROPIC_API_KEY) throw E.unprocessable("No reasoning provider is configured for this environment.", { code: "no_reasoning_provider" });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: model || env.IGL_MODEL || DEFAULT_MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("anthropic error", res.status, t.slice(0, 300));
    if (res.status === 429) throw E.tooMany(30);
    throw E.unprocessable("The reasoning provider refused the request.", { code: "reasoning_provider_error" });
  }
  const j = await res.json();
  return { text: (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n"), model: j.model, usage: j.usage };
}

export async function runIntelligence(db, env, tenantId, kind, req, { purposeNodes = null } = {}) {
  const ctx = await assembleContext(db, tenantId, req);
  const requireCitations = req.requireCitations !== false;
  const empty = !ctx.identities.length && !ctx.facts.length && !ctx.evidence.length && !ctx.obligations.length;
  if (empty) throw E.unprocessable("Nothing in this tenant's governed graph is in scope for the question, so it cannot be answered with citations.", { code: "empty_context" });
  const task = { query: "Answer the question using only the records below.", research: "Produce a structured research memo answering the question using only the records below: findings, gaps, and what evidence would close each gap.", crosswalk: "Map the relationships among the records below that bear on the question: which entities connect, through which relationships, and with what status and confidence. Name the paths explicitly.", investigate: "Investigate the question using only the records below: timeline, actors, supporting and contradicting evidence, and open questions." }[kind];
  const system = [
    "You are the reasoning layer of IGL, a governed identity platform. You see only records the caller is permitted to see.",
    "Rules: use only the records provided. Every factual statement must cite the record it comes from using its tag exactly as given, for example [F:<id>] or [E:<id>].",
    "Never invent records, ids, people, dates or amounts. If the records do not support an answer, say what is missing.",
    "Records marked proposed are not confirmed; say so when you rely on them. Obligations with status proposed are not confirmed dates.",
    "Write plainly, for a professional reader. No preamble.",
  ].join("\n");
  const user = `${task}\n\nQUESTION: ${req.question}\n\nRECORDS:\n${contextText(ctx)}`;
  const out = await callModel(env, { system, user, model: req.modelPreference || undefined });
  const known = new Map();
  for (const i of ctx.identities) known.set(`I:${i.id}`, { sourceId: i.id, sourceType: "database", uri: `/identities/${i.id}`, title: i.displayName, retrievedAt: nowIso(), contentHash: null, locator: "identities" });
  for (const r of ctx.relationships) known.set(`R:${r.id}`, { sourceId: r.id, sourceType: "database", uri: `/graph/relationships/${r.id}`, title: r.type, retrievedAt: nowIso(), contentHash: null, locator: "relationships" });
  for (const f of ctx.facts) known.set(`F:${f.id}`, { sourceId: f.id, sourceType: "database", uri: `/knowledge/facts?subjectId=${f.subjectId}&predicate=${encodeURIComponent(f.predicate)}`, title: f.predicate, retrievedAt: nowIso(), contentHash: null, locator: "facts" });
  for (const e of ctx.evidence) known.set(`E:${e.id}`, { sourceId: e.id, sourceType: "database", uri: `/evidence/${e.id}`, title: e.claim.slice(0, 120), retrievedAt: nowIso(), contentHash: null, locator: "evidence" });
  for (const o of ctx.obligations) known.set(`O:${o.id}`, { sourceId: o.id, sourceType: "database", uri: `/identities/${o.subjectId}/obligations`, title: o.title, retrievedAt: nowIso(), contentHash: null, locator: "obligations" });
  const cited = new Map();
  for (const m of out.text.matchAll(CITE_RE)) { const k = `${m[1]}:${m[2]}`; if (known.has(k)) cited.set(k, known.get(k)); }
  if (requireCitations && cited.size === 0) throw E.unprocessable("The reasoning layer could not produce an answer grounded in the governed records; nothing citable was returned.", { code: "uncited_answer" });
  const citedIds = new Set([...cited.keys()].map((k) => k.slice(2)));
  return {
    requestId: uuid(), answer: out.text, citations: [...cited.values()],
    entities: ctx.identities.filter((i) => citedIds.has(i.id)),
    paths: [], findings: ctx.evidence.filter((e) => citedIds.has(e.id)),
    model: out.model, usage: out.usage, contextSize: { identities: ctx.identities.length, facts: ctx.facts.length, evidence: ctx.evidence.length, relationships: ctx.relationships.length, obligations: ctx.obligations.length },
  };
}
