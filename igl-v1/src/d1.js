/* Cloudflare D1 backing store for the IGL v1.0 runtime.

   The reference runtime keeps the identity graph and the UDM matrices in memory.
   In deployment those seams point at the udmcore D1 database: the identity graph
   and authority live in the authority tables, and the UDM constraint matrices
   live in the udm_matrix tables. D1 access is asynchronous, so governance state
   is loaded from D1 into IOS+ once, before a synchronous governed session runs.
   This is the same load-then-execute shape the v0.2 journal used.

   `db` is a D1 binding (env.DB in a Worker) exposing the standard interface:
       db.prepare(sql).bind(...params).all()   -> { results: [...] }
       db.prepare(sql).bind(...params).run()   -> { success, meta }

   The SQL below matches the udmcore model in architecture.md. Column names are
   easy to adjust to your exact schema; the shapes returned to the runtime are
   what matter. */

import { VOCAB } from "./iosplus.js";
import { sha256, canonical } from "./sign.js";
import { IOSPlus } from "./iosplus.js";

/* ---- identity graph (Article VIII) from the authority tables ---- */
export async function loadIdentityGraph(db, ios) {
  const nodes = (await db.prepare(
    "SELECT urn, authority, boundary_ref FROM authority_nodes"
  ).all()).results || [];
  for (const n of nodes) {
    ios.graph.nodes[n.urn] = {
      authority: Number(n.authority),
      boundary: n.boundary_ref || null,
    };
  }
  // INHERITS_FROM / DELEGATES_TO edges drive authority resolution (Section 8.02)
  const edges = (await db.prepare(
    "SELECT parent_urn AS to_urn, child_urn AS from_urn, edge_type FROM authority_delegations"
  ).all()).results || [];
  ios.graph.edges = edges.map(e => ({ from: e.from_urn, to: e.to_urn, type: e.edge_type }));

  // declared identity exceptions, attached per node
  const exc = (await db.prepare(
    "SELECT node_urn, exception_uri FROM identity_exceptions"
  ).all()).results || [];
  for (const e of exc) {
    const node = ios.graph.nodes[e.node_urn];
    if (node) (node.exceptions = node.exceptions || []).push(e.exception_uri);
  }
  return ios.graph;
}

/* ---- a UDM constraint matrix (Section 3.03) from udm_matrix_cells ----
   Each cell carries a governed action and a weight in [0,1] (0 prohibited,
   1 permitted). The cells are projected onto the runtime's action vocabulary;
   an action absent from the matrix is prohibited (weight 0), which fails closed. */
export async function loadConstraintMatrix(db, { source, version }) {
  const rows = (await db.prepare(
    "SELECT c.action AS action, c.value AS weight " +
    "FROM udm_matrix_cells c JOIN udm_matrix m ON c.matrix_id = m.id " +
    "WHERE m.module_ref = ? AND m.version = ?"
  ).bind(source, version).all()).results || [];

  const byAction = Object.fromEntries(rows.map(r => [String(r.action), Number(r.weight)]));
  const cells = VOCAB.map(tok => {
    const w = byAction[tok];
    return Number.isFinite(w) ? Math.max(0, Math.min(1, w)) : 0.0;
  });
  const matrix = { source, version, vocab: VOCAB, cells };
  matrix.digest = sha256(canonical(matrix.cells));   // same digest rule as IOS+ (Section 3.03)
  return matrix;
}

/* Load a set of matrices into IOS+ so injected constraints resolve to real UDM
   data. `specs` is [{ source, version }, ...] naming the modules a program uses. */
export async function loadConstraintMatrices(db, ios, specs) {
  let loaded = 0;
  for (const spec of specs) {
    const m = await loadConstraintMatrix(db, spec);
    if (m.cells.some(c => c > 0)) {                 // skip empty (would zero-partition)
      ios.matrices[`${spec.source}|${spec.version}`] = m;
      ios.knownMatrixDigests.add(m.digest);
      loaded++;
    }
  }
  return loaded;
}

/* Persist a Governance Receipt to the audit tables (igl_receipts). Append-only. */
export async function persistReceipt(db, receipt) {
  await db.prepare(
    "INSERT INTO igl_receipts (receipt_uuid, bound_identity, constraint_digest, " +
    "cognitive_trace_ref, program_hash, graph_version, outcome, algorithm, signature, public_key, issued_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    receipt.receiptUUID, receipt.boundIdentity, receipt.constraintMatrixDigest,
    receipt.cognitiveTraceRef, receipt.programHash, receipt.identityGraphVersion,
    receipt.outcome, receipt.algorithm, receipt.signature, receipt.publicKey, receipt.timeOfIssuance
  ).run();
  return receipt.receiptUUID;
}

/* Build an IOS+ pre-loaded from D1: identity graph plus the named matrices.
   Then a synchronous governed session runs against this snapshot. */
export async function bootstrapIOSPlus(db, { signer = null, graphVersion = "udmcore", matrixSpecs = [] } = {}) {
  const ios = new IOSPlus({ signer, graphVersion });
  await loadIdentityGraph(db, ios);
  await loadConstraintMatrices(db, ios, matrixSpecs);
  return ios;
}

/* Reference DDL for the columns this adapter reads and writes. Align to your
   actual udmcore schema; these are the shapes the runtime depends on. */
export const D1_REFERENCE_SCHEMA = `
CREATE TABLE IF NOT EXISTS authority_nodes (
  urn TEXT PRIMARY KEY, authority REAL NOT NULL, boundary_ref TEXT
);
CREATE TABLE IF NOT EXISTS authority_delegations (
  parent_urn TEXT NOT NULL, child_urn TEXT NOT NULL, edge_type TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS identity_exceptions (
  node_urn TEXT NOT NULL, exception_uri TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS udm_matrix (
  id INTEGER PRIMARY KEY, module_ref TEXT NOT NULL, version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS udm_matrix_cells (
  matrix_id INTEGER NOT NULL, action TEXT NOT NULL, value REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS igl_receipts (
  receipt_uuid TEXT PRIMARY KEY, bound_identity TEXT, constraint_digest TEXT,
  cognitive_trace_ref TEXT, program_hash TEXT, graph_version TEXT, outcome TEXT,
  algorithm TEXT, signature TEXT, public_key TEXT, issued_at TEXT
);
`;

/* Worker usage sketch:

   import { bootstrapIOSPlus, persistReceipt } from "./src/d1.js";
   import { Interpreter } from "./src/interpreter.js";

   export default {
     async fetch(request, env) {
       const program = await request.text();
       const ios = await bootstrapIOSPlus(env.DB, {
         graphVersion: "udmcore",
         matrixSpecs: [{ source: "udm://module/tx-rrc-production-v3", version: "3.2.0" }],
       });
       const interp = new Interpreter({ ios });          // + a real model behind invoke
       const result = interp.run(program);
       await persistReceipt(env.DB, result.receipt);
       return Response.json({ receipt: result.receipt, publicKey: result.publicKey });
     }
   };
*/
