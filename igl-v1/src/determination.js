/* IGL determination engine - the governance core as IOS+ actually defines it.

   From IG_Schema and IOS_Guarantees: determination is computed, not generated,
   and happens BEFORE inference. The pipeline is Collect, Decode, Position,
   Entail, Bind. Every lookup returns exactly one of four outcomes and fails
   closed. The model is downstream of truth: it may interpret a question into a
   predicate and render a computed answer, but it never originates an answer,
   selects an obligation, or decides a position.

   This module is fully deterministic. No model is in the decision path. */

import { sha256, canonical, Signer } from "./sign.js";

export const OUTCOME = {
  MATCHED: "MATCHED",
  NO_MATCH: "NO_MATCH",
  MULTI_MATCH: "MULTI_MATCH",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
};

/* ---- Decode: onboarding facts to codes via a crosswalk ---- */
export function decode(activities, crosswalk) {
  const codes = [], undecoded = [];
  for (const phrase of activities || []) {
    const hit = crosswalk[String(phrase).toLowerCase()];
    if (hit) codes.push({ phrase, ...hit });
    else undecoded.push(phrase);
  }
  return { codes, undecoded };
}

/* ---- Resolve a lattice position under the resolution contract ---- */
export function resolvePosition(input, sources, { required = ["activities", "address"] } = {}) {
  const facts = input.facts || {};
  const missing = required.filter(f => {
    const v = facts[f];
    return v == null || (Array.isArray(v) && v.length === 0) || v === "";
  });
  if (missing.length) return { outcome: OUTCOME.INSUFFICIENT_DATA, missing };

  const { codes, undecoded } = decode(facts.activities, sources.crosswalk);
  if (codes.length === 0)
    return { outcome: OUTCOME.INSUFFICIENT_DATA, missing: ["a decodable activity"], undecoded };

  let subsectors = [...new Set(codes.map(c => c.subsector).filter(Boolean))];
  if (subsectors.length === 0) return { outcome: OUTCOME.NO_MATCH, undecoded };

  if (subsectors.length > 1) {
    // declared tie-break: most specific code (longest code string) wins
    const bySpecificity = [...codes].sort((a, b) => String(b.code).length - String(a.code).length);
    const top = bySpecificity[0];
    const tied = bySpecificity.filter(c => String(c.code).length === String(top.code).length);
    if (tied.length > 1)
      return { outcome: OUTCOME.MULTI_MATCH, candidates: subsectors };
    subsectors = [top.subsector];
  }

  const position = {
    organization: input.organization || null,
    codes: [...new Set(codes.map(c => c.code))],
    subsector: subsectors[0],
    domain: codes.find(c => c.subsector === subsectors[0])?.domain || null,
    jurisdictions: input.jurisdictionStack || [],
    metrics: facts.metrics || {},
  };
  return { outcome: OUTCOME.MATCHED, position };
}

/* ---- Entail: evaluate obligations over a resolved position ---- */
export function entail(position, obligations) {
  const codeSet = new Set(position.codes);
  const jurSet = new Set(position.jurisdictions);
  const selected = [], evaluationPath = [];
  for (const o of obligations) {
    if (!codeSet.has(o.sector_code)) continue;
    if (o.jurisdiction && !jurSet.has(o.jurisdiction)) continue;
    if (o.when) {
      const m = Number(position.metrics[o.when.metric]);
      if (!satisfies(m, o.when.op, Number(o.when.value))) continue;
    }
    selected.push(o);
    evaluationPath.push({
      code: o.sector_code, jurisdiction: o.jurisdiction, agency: o.agency,
      basis: o.when ? `threshold ${o.when.metric} ${o.when.op} ${o.when.value}` : "code x jurisdiction",
      citation: o.citation,
    });
  }
  const citations = [...new Set(selected.map(o => o.citation).filter(Boolean))];
  return { obligations: selected, citations, evaluationPath };
}
function satisfies(a, op, b) {
  switch (op) { case ">=": return a >= b; case ">": return a > b; case "<=": return a <= b; case "<": return a < b; case "==": return a === b; default: return false; }
}

/* ---- The determination (LENS: what applies now) ---- */
export function determine(input, sources, {
  predicate = { lens: "LENS", question: "What applies now?" },
  udmVersion = "udmcore@live", ruleVersion = "igl-entail@1", signer = null, prev = null, tenantId = null,
  issuedBy = "LENS", now = () => Date.now() / 1000,
} = {}) {
  const res = resolvePosition(input, sources);
  const base = { predicate, positionInput: { organization: input.organization, jurisdictionStack: input.jurisdictionStack, facts: input.facts }, udm_version: udmVersion, rule_version: ruleVersion };

  if (res.outcome !== OUTCOME.MATCHED) {
    // fail closed: seal a receipt that reports the outcome as-is, never estimated
    const payload = { ...base, outcome: res.outcome, obligations: [], citations: [], missing: res.missing || null, candidates: res.candidates || null, evaluationPath: [] };
    const receipt = sealReceipt(payload, { kind: res.outcome, issuedBy, tenantId: tenantId || input.tenantId, subject: input.organization, prev, signer, now });
    return { outcome: res.outcome, obligations: [], citations: [], missing: res.missing || null, candidates: res.candidates || null, position: null, receipt };
  }

  const ent = entail(res.position, sources.obligations || []);
  const payload = { ...base, outcome: OUTCOME.MATCHED, position: res.position, obligations: ent.obligations, citations: ent.citations, evaluationPath: ent.evaluationPath };
  const receipt = sealReceipt(payload, { kind: "determination", issuedBy, tenantId: tenantId || input.tenantId, subject: input.organization, prev, signer, now });
  return { outcome: OUTCOME.MATCHED, position: res.position, obligations: ent.obligations, citations: ent.citations, evaluationPath: ent.evaluationPath, receipt };
}

/* ---- FORECAST: what would apply under a hypothetical change ---- */
export function forecast(input, change, sources, opts = {}) {
  const baseDet = determine(input, sources, { ...opts, predicate: { lens: "LENS" } });
  const hypInput = applyChange(input, change);
  const hypDet = determine(hypInput, sources, { ...opts, issuedBy: "FORECAST", predicate: { lens: "FORECAST", change } });
  const baseIds = new Set((baseDet.obligations || []).map(o => o.id || o.citation));
  const hypIds = new Set((hypDet.obligations || []).map(o => o.id || o.citation));
  const added = (hypDet.obligations || []).filter(o => !baseIds.has(o.id || o.citation));
  const removed = (baseDet.obligations || []).filter(o => !hypIds.has(o.id || o.citation));
  return { base: baseDet, hypothetical: hypDet, added, removed, receipt: hypDet.receipt };
}
function applyChange(input, change) {
  const next = JSON.parse(JSON.stringify(input));
  next.facts = next.facts || {};
  if (change.addActivities) next.facts.activities = [...(next.facts.activities || []), ...change.addActivities];
  if (change.setMetrics) next.facts.metrics = { ...(next.facts.metrics || {}), ...change.setMetrics };
  if (change.addJurisdictions) next.jurisdictionStack = [...(next.jurisdictionStack || []), ...change.addJurisdictions];
  return next;
}

/* ---- The AI perimeter: the ONLY two places a model may touch the pipeline ----
   interpret runs BEFORE determination (question -> predicate). render runs AFTER
   (determination -> prose). Neither may change the determination; render is given
   the sealed result and returns text only. */
export function interpretQuestion(nl, interpret = null) {
  return interpret ? interpret(nl) : { lens: "LENS", question: String(nl) };
}
export function renderDetermination(det, render = null) {
  if (render) return render(det);                       // model seam, downstream of truth
  if (det.outcome !== OUTCOME.MATCHED)
    return `Determination could not be made: ${det.outcome}${det.missing ? " (missing: " + det.missing.join(", ") + ")" : ""}.`;
  const lines = det.obligations.map(o => `- ${o.agency}: ${o.obligation} [${o.citation}]`);
  return `${det.obligations.length} obligation(s) apply to ${det.position.subsector}:\n${lines.join("\n")}`;
}

/* ---- Bind: hash-chained, version-pinned, Ed25519-signed receipt ----
   query_hash binds the predicate and the graph state; answer_hash binds the
   determination payload; chain_hash links the prior receipt. Re-verifiable
   byte-for-byte from the receipt alone. */
export function sealReceipt(payload, { kind, issuedBy, tenantId, subject, prev = null, signer = null, now = () => Date.now() / 1000 } = {}) {
  const query_hash = sha256(canonical({ predicate: payload.predicate, positionInput: payload.positionInput, udm_version: payload.udm_version, rule_version: payload.rule_version }));
  const answer_hash = sha256(canonical({ outcome: payload.outcome, obligations: payload.obligations, citations: payload.citations, missing: payload.missing ?? null, evaluationPath: payload.evaluationPath }));
  const prev_receipt_hash = prev || null;
  const chain_hash = sha256((prev_receipt_hash || "") + query_hash + answer_hash);
  const fields = {
    receiptUUID: "det-" + chain_hash.slice(0, 20),
    kind, issuedBy: issuedBy || "LENS", tenantId: tenantId || null, subject: subject || null,
    outcome: payload.outcome, query_hash, answer_hash, prev_receipt_hash, chain_hash,
    udm_version: payload.udm_version, rule_version: payload.rule_version,
    citations: payload.citations || [], payload, created_at: now(),
  };
  return signer ? signer.signReceipt(fields) : fields;
}

/* ---- Verify a determination receipt from the artifact alone ---- */
export function verifyDetermination(receipt, { publicKeyB64 = null } = {}) {
  // recompute the two hashes from the payload
  const p = receipt.payload;
  if (!p) return { ok: false, reason: "no payload to re-verify against" };
  const query_hash = sha256(canonical({ predicate: p.predicate, positionInput: p.positionInput, udm_version: p.udm_version, rule_version: p.rule_version }));
  const answer_hash = sha256(canonical({ outcome: p.outcome, obligations: p.obligations, citations: p.citations, missing: p.missing ?? null, evaluationPath: p.evaluationPath }));
  if (query_hash !== receipt.query_hash) return { ok: false, reason: "query_hash does not reproduce from payload" };
  if (answer_hash !== receipt.answer_hash) return { ok: false, reason: "answer_hash does not reproduce - determination was altered" };
  const chain_hash = sha256((receipt.prev_receipt_hash || "") + query_hash + answer_hash);
  if (chain_hash !== receipt.chain_hash) return { ok: false, reason: "chain_hash does not reproduce" };
  if (receipt.signature) {
    const v = Signer.verifyReceipt(receipt, { publicKeyB64 });
    if (!v.ok) return { ok: false, reason: "signature: " + v.reason };
  }
  return { ok: true, outcome: receipt.outcome, byteForByte: true };
}
