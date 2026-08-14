/* Prove the D1 adapter against the real udmcore schema, using a mock binding
   whose columns match the live DDL: categorical boundary allow, obligations with
   citations, identity nodes, and persistence of a Governance Receipt into the
   hash-chained audit_receipts / receipt_edges tables. */

import { readFileSync } from "node:fs";
import { pinnedConstraints, run } from "../src/index.js";
import {
  loadBoundaryAllow, allowVector, loadObligations, loadIdentityNodes, persistReceipt,
} from "../src/d1.js";

const data = {
  boundary: [
    { from_system: "packet", to_system: "filing", allowed: 1, via: "compliance", rationale: "reviewed" },
    { from_system: "packet", to_system: "public", allowed: 0, via: null, rationale: "PII" },
  ],
  obligations: [
    { code: "PR-202", sector_code: "211120", obligation: "file monthly production", summary: "", agency: "TX-RRC", citation: "16 TAC 3.27" },
    { code: "H-10", sector_code: "486210", obligation: "annual", summary: "", agency: "TX-RRC", citation: "16 TAC 3.70" },
  ],
  nodes: [
    { id: "n1", kind: "actor", key: "operator-014", value_json: '{"role":"operator"}', code_id: null },
  ],
  audit_receipts: [],
  receipt_edges: [],
};

function mockDB() {
  return {
    prepare(sql) {
      let params = [];
      return {
        bind(...p) { params = p; return this; },
        async all() {
          if (sql.includes("FROM boundary_rules")) return { results: data.boundary };
          if (sql.includes("FROM udm_obligations")) return { results: sql.includes("WHERE sector_code") ? data.obligations.filter(o => o.sector_code === params[0]) : data.obligations };
          if (sql.includes("FROM ig_nodes")) return { results: data.nodes.filter(n => true) };
          return { results: [] };
        },
        async run() {
          if (sql.includes("INSERT INTO audit_receipts")) data.audit_receipts.push(params);
          if (sql.includes("INSERT INTO receipt_edges")) data.receipt_edges.push(params);
          return { success: true };
        },
      };
    },
  };
}

let passed = 0, failed = 0;
const ok = (n, c, extra = "") => { c ? passed++ : failed++; console.log((c ? "  ok   " : "  FAIL ") + n + (c ? "" : "  [" + extra + "]")); };

const db = mockDB();

// boundary_rules -> categorical allow, and support restriction over options
const allow = await loadBoundaryAllow(db);
ok("boundary_rules loaded as categorical allow", allow.get("packet|filing").allowed === true && allow.get("packet|public").allowed === false);
const av = allowVector(["file_it", "publish_it"], { file_it: { from: "packet", to: "filing" }, publish_it: { from: "packet", to: "public" } }, allow);
ok("allowed option carries weight 1", av.cells[0] === 1.0);
ok("denied option carries weight 0 (support restriction from real rules)", av.cells[1] === 0.0);

// obligations with citations
const obs = await loadObligations(db, { sectorCode: "211120" });
ok("obligations filtered by sector, with citation", obs.length === 1 && obs[0].citation === "16 TAC 3.27");

// identity nodes
const nodes = await loadIdentityNodes(db, { tenantId: "allco" });
ok("identity nodes loaded from ig_nodes with parsed value", nodes[0].value.role === "operator");

// persist a real receipt into the hash-chained audit tables
const _ws = readFileSync(new URL("../programs/wellsite.igl", import.meta.url), "utf8");
const r = run(_ws, { constraints: pinnedConstraints(_ws), seed: 1 });
const a = await persistReceipt(db, r.receipt, { tenantId: "allco", citations: obs.map(o => o.citation) });
ok("receipt written to audit_receipts under its own id", data.audit_receipts.length === 1 && data.audit_receipts[0][0] === r.receipt.receiptUUID);
ok("signed receipt preserved whole inside output_json", data.audit_receipts[0][5].includes(r.receipt.signature));
ok("chain_hash computed", typeof a.chain_hash === "string" && a.chain_hash.length === 64);

// chain a second receipt onto the first
const r2 = { ...r.receipt, receiptUUID: r.receipt.receiptUUID + "-2" };
const b = await persistReceipt(db, r2, { tenantId: "allco", prevReceiptId: a.id, prevChainHash: a.chain_hash });
ok("second receipt chains via prev_receipt_id", data.audit_receipts[1][9] === a.id);
ok("receipt_edges row records the chain link", data.receipt_edges.length === 1 && data.receipt_edges[0][1] === a.id && data.receipt_edges[0][2] === r2.receiptUUID);
ok("chain_hash advances with the chain", b.chain_hash !== a.chain_hash);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
