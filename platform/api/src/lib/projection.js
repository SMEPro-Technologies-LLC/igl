/* Purpose-bounded projections: what a caller may see of an identity, why,
   and what was withheld. Four gates in a fixed order, per node:
     1. nodeType      the purpose profile permits this node type
     2. sensitivity   the node's sensitivity is at or below the profile's ceiling
     3. consent       an active consent record covers (identity, purpose)
     4. jurisdiction  the tenant's transfer policy allows serving it where the caller is
   The first failure is the reason, and explain returns every node considered. */

import { parseJson, uuid, nowIso } from "./http.js";

export const SENSITIVITY = ["public", "internal", "confidential", "restricted"];
const DEFAULT_SENSITIVITY = { Person: "internal", Organization: "internal", Role: "internal", Jurisdiction: "public", Credential: "confidential", Facility: "internal", Obligation: "confidential", Asset: "internal", System: "internal", Agent: "internal", Place: "public", Document: "confidential", Program: "internal", Course: "internal", Product: "internal", Other: "internal" };

export const DEFAULT_PURPOSES = [
  { id: "identity-introduction", name: "Identity introduction", description: "Greeting, routing and addressing the person correctly.", permits: ["Person", "Organization", "Role", "Jurisdiction"], sensitivityCeiling: "internal", default: true },
  { id: "directory-lookup", name: "Directory lookup", description: "Rosters, mentions and org charts.", permits: ["Person", "Role"], sensitivityCeiling: "internal", default: false },
  { id: "scientific-research", name: "Scientific research", description: "Qualification checks and study eligibility.", permits: ["Person", "Organization", "Role", "Jurisdiction", "Credential", "Facility"], sensitivityCeiling: "confidential", default: false },
  { id: "regulatory-filing", name: "Regulatory filing", description: "Deadline tracking and filing preparation.", permits: ["Person", "Organization", "Role", "Jurisdiction", "Facility", "Obligation"], sensitivityCeiling: "confidential", default: false },
];

export function typeToNode(identityType) {
  const map = { person: "Person", organization: "Organization", system: "System", agent: "Agent", asset: "Asset", place: "Place", document: "Document", program: "Program", course: "Course", product: "Product", other: "Other" };
  return map[identityType] || "Other";
}
const REL_NODE = { employed_by: "Organization", member_of: "Organization", works_for: "Organization", holds_credential: "Credential", licensed_as: "Credential", certified_in: "Credential", operates: "Facility", responsible_for: "Facility", located_at: "Facility", owns: "Asset" };

export function rowToIdentity(r) {
  const out = { id: r.id, type: r.type, displayName: r.display_name, aliases: parseJson(r.aliases, []), externalIds: parseJson(r.external_ids, {}), attributes: parseJson(r.attributes, {}), status: r.status, confidence: r.confidence ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at ?? null, provenance: parseJson(r.provenance, undefined) };
  if (r.schema_type) { out.schemaType = r.schema_type; out.summary = r.summary ?? null; }
  if (out.confidence === undefined) delete out.confidence;
  if (out.provenance === undefined) delete out.provenance;
  return out;
}
export function rowToRelationship(r) {
  return { id: r.id, fromId: r.from_id, type: r.type, toId: r.to_id, direction: r.direction, attributes: parseJson(r.attributes, {}), effectiveFrom: r.effective_from, effectiveTo: r.effective_to, confidence: r.confidence ?? undefined, status: r.status, provenance: parseJson(r.provenance, undefined) };
}
export function rowToObligation(r) {
  return { id: r.id, subjectId: r.subject_id, title: r.title, obligee: r.obligee, facilityId: r.facility_id, regulation: r.regulation, dueDate: r.due_date, status: r.status, attestedBy: parseJson(r.attested_by, null), attestedAt: r.attested_at, evidenceIds: parseJson(r.evidence_ids, []) };
}
export function rowToConsent(r) {
  return { id: r.id, identityId: r.identity_id, purpose: r.purpose, grantedBy: parseJson(r.granted_by, undefined), scope: r.scope, jurisdictions: parseJson(r.jurisdictions, []), status: r.status, grantedAt: r.granted_at, expiresAt: r.expires_at };
}
export function rowToPurpose(r) { return { id: r.id, name: r.name, description: r.description, permits: parseJson(r.permits, []), sensitivityCeiling: r.sensitivity_ceiling, default: !!r.is_default }; }

/* Build the candidate node set for an identity: itself, derived attribute
   nodes, related identities up to maxDepth, and its obligations. */
export async function candidateNodes(db, tenantId, identity, { maxDepth = 1 } = {}) {
  const nodes = [];
  const edges = [];
  const a = identity.attributes || {};
  const sens = (node, fallback) => a.sensitivity?.[node] || fallback || DEFAULT_SENSITIVITY[node] || "internal";
  const selfType = typeToNode(identity.type);
  nodes.push({ id: identity.id, type: selfType, label: identity.displayName, attributes: { displayName: identity.displayName, aliases: identity.aliases || [] }, confidence: identity.confidence ?? 1, status: "certified", sensitivity: a.sensitivity?.self || DEFAULT_SENSITIVITY[selfType], source: "identity" });
  const role = a.role || a.title;
  if (role) nodes.push({ id: identity.id, type: "Role", label: String(role), attributes: { role: String(role) }, confidence: 1, status: "certified", sensitivity: sens("Role"), source: "attribute" });
  const jur = a.jurisdiction || (a.state ? `US-${String(a.state).toUpperCase()}` : null);
  if (jur) nodes.push({ id: identity.id, type: "Jurisdiction", label: String(jur), attributes: { jurisdiction: String(jur) }, confidence: 1, status: "certified", sensitivity: sens("Jurisdiction"), source: "attribute" });
  for (const [k, v] of Object.entries(a.credentials || {})) nodes.push({ id: identity.id, type: "Credential", label: `${k}: ${v}`, attributes: { [k]: v }, confidence: 1, status: "certified", sensitivity: sens("Credential"), source: "attribute" });

  // related identities, breadth-first
  let frontier = [identity.id]; const seen = new Set([identity.id]);
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const placeholders = frontier.map(() => "?").join(",");
    const { results } = await db.prepare(`SELECT * FROM relationships WHERE tenant_id = ? AND status IN ('proposed','certified') AND (from_id IN (${placeholders}) OR to_id IN (${placeholders}))`).bind(tenantId, ...frontier, ...frontier).all();
    const next = [];
    for (const r of results) {
      const rel = rowToRelationship(r);
      if (rel.status !== "certified") continue;            // proposed relationships never appear in a projection
      const other = frontier.includes(rel.fromId) ? rel.toId : rel.fromId;
      edges.push(rel);
      if (seen.has(other)) continue;
      seen.add(other); next.push(other);
      const row = await db.prepare("SELECT * FROM identities WHERE tenant_id = ?1 AND id = ?2").bind(tenantId, other).first();
      if (!row) continue;
      const o = rowToIdentity(row);
      const nodeType = REL_NODE[rel.type] || typeToNode(o.type);
      nodes.push({ id: o.id, type: nodeType, label: o.displayName, attributes: { relationship: rel.type, ...(o.attributes?.public || {}) }, confidence: rel.confidence ?? o.confidence ?? 1, status: rel.status, sensitivity: o.attributes?.sensitivity?.self || DEFAULT_SENSITIVITY[nodeType], source: "relationship" });
    }
    frontier = next;
  }
  const { results: obl } = await db.prepare("SELECT * FROM obligations WHERE tenant_id = ?1 AND subject_id = ?2 ORDER BY due_date ASC").bind(tenantId, identity.id).all();
  for (const r of obl) {
    const o = rowToObligation(r);
    nodes.push({ id: o.id, type: "Obligation", label: o.title, attributes: { dueDate: o.dueDate, status: o.status, regulation: o.regulation, facilityId: o.facilityId }, confidence: o.status === "attested" ? 1 : 0.6, status: o.status === "attested" ? "certified" : "proposed", sensitivity: DEFAULT_SENSITIVITY.Obligation, source: "obligation" });
  }
  return { nodes, edges };
}

export function jurisdictionAllows(tenantSettings, nodeSensitivity, callerJurisdiction, tenantJurisdiction) {
  const policy = tenantSettings.transferPolicy || {};
  const home = (tenantJurisdiction || "US").split("-")[0];
  const caller = (callerJurisdiction || home).split("-")[0];
  if (caller === home) return { ok: true, reason: null };
  const allowedTo = policy[caller] || policy["*"] || [];
  const ceiling = allowedTo.length ? allowedTo : ["public", "internal"];
  const ok = SENSITIVITY.indexOf(nodeSensitivity) <= Math.max(...ceiling.map((s) => SENSITIVITY.indexOf(s)));
  return { ok, reason: ok ? null : `transfer policy does not allow ${nodeSensitivity} nodes to be served in ${caller}` };
}

export async function project(db, tenantId, { identity, purpose, principal, nodeBudget = 50, maxDepth = 1, explain = false }) {
  const { nodes, edges } = await candidateNodes(db, tenantId, identity, { maxDepth });
  const consentRow = await db.prepare("SELECT * FROM consents WHERE tenant_id = ?1 AND identity_id = ?2 AND purpose = ?3 AND status = 'active' AND (expires_at IS NULL OR expires_at > ?4) LIMIT 1").bind(tenantId, identity.id, purpose.id, nowIso()).first();
  const consent = consentRow ? rowToConsent(consentRow) : null;
  const ceiling = SENSITIVITY.indexOf(purpose.sensitivityCeiling || "internal");
  const considered = []; const admitted = []; const withheld = {};
  let truncated = false;
  for (const n of nodes) {
    const gates = [];
    let firstFailure = null;
    const fail = (gate, reason) => { gates.push({ gate, result: "fail", reason }); firstFailure = firstFailure || `${gate}: ${reason}`; };
    const pass = (gate) => gates.push({ gate, result: "pass", reason: null });
    const skip = (gate) => gates.push({ gate, result: "skipped", reason: "an earlier gate failed" });
    if (!purpose.permits.includes(n.type)) fail("nodeType", `purpose ${purpose.id} does not permit ${n.type}`); else pass("nodeType");
    if (firstFailure) skip("sensitivity"); else if (SENSITIVITY.indexOf(n.sensitivity) > ceiling) fail("sensitivity", `${n.sensitivity} is above the ${purpose.sensitivityCeiling} ceiling`); else pass("sensitivity");
    if (firstFailure) skip("consent"); else if (!consent) fail("consent", `no active consent record covers purpose ${purpose.id}`); else pass("consent");
    if (firstFailure) skip("jurisdiction"); else {
      const j = jurisdictionAllows(principal.tenantSettings || {}, n.sensitivity, principal.jurisdiction, principal.tenantJurisdiction);
      if (!j.ok) fail("jurisdiction", j.reason); else pass("jurisdiction");
    }
    const node = { id: n.id, type: n.type, label: n.label, attributes: n.attributes, confidence: n.confidence, status: n.status };
    if (!firstFailure) {
      if (admitted.length >= nodeBudget) { truncated = true; withheld[n.type] = (withheld[n.type] || 0) + 1; considered.push({ node, admitted: false, gates, firstFailure: "budget: node budget reached" }); continue; }
      admitted.push(node);
    } else withheld[n.type] = (withheld[n.type] || 0) + 1;
    considered.push({ node, admitted: !firstFailure, gates, firstFailure });
  }
  const admittedIds = new Set(admitted.map((n) => n.id));
  const admittedEdges = edges.filter((e) => admittedIds.has(e.fromId) && admittedIds.has(e.toId));
  const emptyWarning = admitted.length === 0 ? (consent ? "identity exists; no node passed the gates for this purpose" : "identity exists; no consent record covers this purpose") : null;
  return { admitted, edges: admittedEdges, withheld, truncated, emptyWarning, considered, consent };
}

export async function seedPurposes(db, tenantId) {
  const stmts = DEFAULT_PURPOSES.map((p) => db.prepare("INSERT OR IGNORE INTO purposes (tenant_id, id, name, description, permits, sensitivity_ceiling, is_default) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(tenantId, p.id, p.name, p.description, JSON.stringify(p.permits), p.sensitivityCeiling, p.default ? 1 : 0));
  await db.batch(stmts);
}

export function newConsent(tenantId, identityId, purpose, grantedBy, scope = "default") {
  return { id: uuid(), identityId, purpose, grantedBy, scope, jurisdictions: [], status: "active", grantedAt: nowIso(), expiresAt: null };
}
