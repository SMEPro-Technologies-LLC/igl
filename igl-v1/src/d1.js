// SPDX-License-Identifier: Apache-2.0
/* Cloudflare D1 backing store for the IGL v1.0 runtime, bound to the real
   udmcore schema.

   Reconciliation note, read this first. The v1.0 specification models governance
   as a numeric CONSTRAINT_MATRIX and BOUNDARY_TENSOR fused into a probability
   vector. The deployed udmcore does not store governance that way. It stores:
     - boundary_rules: categorical allow between systems (allowed 1/0), not a
       mass-ceiling tensor;
     - udm_intent_rules / udm_obligations / udm_routing_rules: the rules and
       citations that decide what applies, not weights;
     - authority_scopes: which regulatory body governs which domain, not a float
       authority level;
     - audit_receipts + receipt_edges: a hash-chained receipt store.
   So this adapter binds to the real model. The one FUSE property that carries
   over cleanly is support restriction: a denied option gets zero mass. That is
   driven here by boundary_rules (allow 1/0), which is honest, categorical, and
   auditable. Graded weights are not fabricated, because udmcore has none.

   `db` is a D1 binding (env.DB) exposing prepare(sql).bind(...).all()/.run(). */

import { sha256, canonical } from "./sign.js";

/* ---------- boundary_rules: categorical allow between systems ---------- */
export async function loadBoundaryAllow(db) {
  const rows = (await db.prepare(
    "SELECT from_system, to_system, allowed, via, rationale FROM boundary_rules"
  ).all()).results || [];
  const map = new Map();
  for (const r of rows) {
    map.set(`${r.from_system}|${r.to_system}`, {
      allowed: !!Number(r.allowed), via: r.via || null, rationale: r.rationale || null,
    });
  }
  return map;
}

/* Build a support-restriction weight vector (1 allowed, 0 denied) over a set of
   options, given an explicit option -> {from,to} mapping. No mapping is invented:
   the caller states how its options correspond to boundary_rules transitions.
   An option with no matching allow rule is denied (fails closed). */
export function allowVector(options, optionToTransition, allowMap) {
  const cells = options.map(opt => {
    const t = optionToTransition[opt];
    if (!t) return 0.0;
    const rule = allowMap.get(`${t.from}|${t.to}`);
    return rule && rule.allowed ? 1.0 : 0.0;
  });
  return { options, cells, digest: sha256(canonical(cells)) };
}

/* ---------- udm rules and obligations: what applies, and its citations ---------- */
export async function loadObligations(db, { sectorCode = null } = {}) {
  const sql = sectorCode
    ? "SELECT code, sector_code, obligation, summary, agency, citation FROM udm_obligations WHERE sector_code = ?"
    : "SELECT code, sector_code, obligation, summary, agency, citation FROM udm_obligations";
  const stmt = sectorCode ? db.prepare(sql).bind(sectorCode) : db.prepare(sql);
  return (await stmt.all()).results || [];
}

export async function loadIntentRules(db) {
  return (await db.prepare(
    "SELECT keywords, codes, matches, sector_code, citations FROM udm_intent_rules"
  ).all()).results || [];
}

export async function loadRoutingRules(db) {
  return (await db.prepare(
    "SELECT signal, route_to, decoded_dimension, guardrail, workbook_basis FROM udm_routing_rules"
  ).all()).results || [];
}

/* ---------- identity context from the ig_* graph (tenant-scoped nodes) ---------- */
export async function loadIdentityNodes(db, { tenantId }) {
  const rows = (await db.prepare(
    "SELECT id, kind, key, value_json, code_id FROM ig_nodes WHERE tenant_id = ?"
  ).bind(tenantId).all()).results || [];
  return rows.map(r => ({ id: r.id, kind: r.kind, key: r.key, value: safeJson(r.value_json), codeId: r.code_id || null }));
}

/* ---------- authority_scopes: which regulatory body governs which domain ---------- */
export async function loadAuthorityScopes(db, { domain = null } = {}) {
  const sql = domain
    ? "SELECT id, body_id, domain, scope_note FROM authority_scopes WHERE domain = ?"
    : "SELECT id, body_id, domain, scope_note FROM authority_scopes";
  const stmt = domain ? db.prepare(sql).bind(domain) : db.prepare(sql);
  return (await stmt.all()).results || [];
}

/* ---------- persist a Governance Receipt into the real audit chain ----------
   Maps the IGL receipt onto audit_receipts. The Ed25519-signed receipt is kept
   whole inside output_json, so both guarantees hold at once: the signature (in
   the JSON) and the hash chain (the table's input_hash/output_hash/chain_hash).
   Chains to a prior receipt via prev_receipt_id and a receipt_edges row. */
export async function persistReceipt(db, receipt, {
  tenantId = null, kind = "igl_governed_turn", subject = null, citations = [],
  prevReceiptId = null, prevChainHash = "", sst = null, now = () => Date.now() / 1000,
} = {}) {
  const input = { programHash: receipt.programHash, sessionId: receipt.sessionId, boundIdentity: receipt.boundIdentity, constraintDigest: receipt.constraintMatrixDigest };
  const input_json = JSON.stringify(input);
  const output_json = JSON.stringify(receipt);
  const input_hash = sha256(input_json);
  const output_hash = sha256(output_json);
  const chain_hash = sha256((prevChainHash || "") + input_hash + output_hash);
  const created_at = now();

  await db.prepare(
    "INSERT INTO audit_receipts (id, kind, subject, tenant_id, input_json, output_json, " +
    "input_hash, output_hash, citations_json, prev_receipt_id, chain_hash, created_at, sst) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    receipt.receiptUUID, kind, subject || receipt.boundIdentity, tenantId,
    input_json, output_json, input_hash, output_hash,
    JSON.stringify(citations || []), prevReceiptId, chain_hash, created_at, sst
  ).run();

  if (prevReceiptId) {
    await db.prepare(
      "INSERT INTO receipt_edges (id, from_receipt_id, to_receipt_id, relation) VALUES (?, ?, ?, ?)"
    ).bind(sha256(prevReceiptId + receipt.receiptUUID).slice(0, 24), prevReceiptId, receipt.receiptUUID, "chain").run();
  }
  return { id: receipt.receiptUUID, input_hash, output_hash, chain_hash, created_at };
}

function safeJson(s) { if (s == null) return null; try { return JSON.parse(s); } catch { return s; } }

/* Real udmcore DDL for the tables this adapter reads and writes (as returned by
   sqlite_master). Kept here so the binding is pinned to the live schema. */
export const UDMCORE_SCHEMA = {
  boundary_rules: "CREATE TABLE boundary_rules (id TEXT PRIMARY KEY, from_system TEXT NOT NULL, to_system TEXT NOT NULL, allowed INTEGER NOT NULL, via TEXT, rationale TEXT)",
  authority_scopes: "CREATE TABLE authority_scopes (id TEXT PRIMARY KEY, body_id TEXT NOT NULL REFERENCES regulatory_bodies(id), domain TEXT NOT NULL, scope_note TEXT)",
  audit_receipts: "CREATE TABLE audit_receipts (id TEXT PRIMARY KEY, kind TEXT NOT NULL, subject TEXT, tenant_id TEXT, input_json TEXT NOT NULL, output_json TEXT NOT NULL, input_hash TEXT NOT NULL, output_hash TEXT NOT NULL, citations_json TEXT, prev_receipt_id TEXT, chain_hash TEXT NOT NULL, created_at REAL, sst TEXT)",
  receipt_edges: "CREATE TABLE receipt_edges (id TEXT PRIMARY KEY, from_receipt_id TEXT NOT NULL REFERENCES audit_receipts(id), to_receipt_id TEXT NOT NULL REFERENCES audit_receipts(id), relation TEXT)",
  udm_obligations: "CREATE TABLE udm_obligations (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, sector_code TEXT, obligation TEXT, summary TEXT, agency TEXT, citation TEXT)",
  udm_intent_rules: "CREATE TABLE udm_intent_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, keywords TEXT, codes TEXT, matches TEXT, sector_code TEXT, citations TEXT)",
  udm_routing_rules: "CREATE TABLE udm_routing_rules (signal TEXT, route_to TEXT, decoded_dimension TEXT, guardrail TEXT, workbook_basis TEXT)",
  ig_nodes: "CREATE TABLE ig_nodes (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES ig_tenants(id), kind TEXT NOT NULL, key TEXT NOT NULL, value_json TEXT, code_id TEXT REFERENCES codes(id))",
};

/* Worker sketch:

   import { loadBoundaryAllow, allowVector, loadObligations, persistReceipt } from "./src/d1.js";
   import { Interpreter } from "./src/interpreter.js";

   export default {
     async fetch(request, env) {
       const program = await request.text();
       // real governance from udmcore
       const allow = await loadBoundaryAllow(env.DB);
       const obligations = await loadObligations(env.DB, { sectorCode: "211120" });
       // run the governed session (model attached behind invoke), then seal the receipt
       const result = new Interpreter({}).run(program);
       const sealed = await persistReceipt(env.DB, result.receipt, {
         tenantId: "allco", citations: obligations.map(o => o.citation),
         prevReceiptId: null, prevChainHash: "",
       });
       return Response.json({ receipt: result.receipt, chain: sealed });
     }
   };
*/
