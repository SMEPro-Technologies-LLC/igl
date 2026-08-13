/* Prove the Cloudflare D1 seam: load the identity graph and UDM matrices from a
   mock D1 binding, run WellSite against that loaded state, and confirm the receipt
   uses the D1 matrix (not the stand-in), verifies, and that persistReceipt writes.
   A mock DB stands in for env.DB; the shapes are exactly what real D1 returns. */

import { readFileSync } from "node:fs";
import { run, verify } from "../src/index.js";
import { VOCAB } from "../src/iosplus.js";
import { bootstrapIOSPlus, loadConstraintMatrix, persistReceipt } from "../src/d1.js";

// action weights: deny and redact prohibited (0), the rest permitted
const actionRows = VOCAB.map(a => ({ action: a, weight: (a === "deny" || a === "redact") ? 0.0 : 1.0 }));

const data = {
  nodes: [
    { urn: "igl://identity/allco/operator-014", authority: 0.4, boundary_ref: "tx_rrc_boundary" },
    { urn: "igl://identity/allco/compliance-001", authority: 0.85, boundary_ref: "tx_rrc_filing_boundary" },
  ],
  edges: [{ from_urn: "igl://identity/allco/operator-014", to_urn: "igl://identity/allco/compliance-001", edge_type: "DELEGATES_TO" }],
  exceptions: [{ node_urn: "igl://identity/allco/compliance-001", exception_uri: "igl://exception/tx-rrc-late-filing-window" }],
  cells: {
    "udm://module/tx-rrc-production-v3|3.2.0": actionRows,
    "udm://module/tx-rrc-filing-v2|2.0.0": actionRows,
  },
  inserts: [],
};

function mockDB() {
  return {
    prepare(sql) {
      let params = [];
      return {
        bind(...p) { params = p; return this; },
        async all() {
          if (sql.includes("authority_nodes")) return { results: data.nodes };
          if (sql.includes("authority_delegations")) return { results: data.edges };
          if (sql.includes("identity_exceptions")) return { results: data.exceptions };
          if (sql.includes("udm_matrix_cells")) return { results: data.cells[`${params[0]}|${params[1]}`] || [] };
          return { results: [] };
        },
        async run() { data.inserts.push(params); return { success: true }; },
      };
    },
  };
}

let passed = 0, failed = 0;
const ok = (n, c, extra = "") => { c ? passed++ : failed++; console.log((c ? "  ok   " : "  FAIL ") + n + (c ? "" : "  [" + extra + "]")); };

const db = mockDB();
const specs = [
  { source: "udm://module/tx-rrc-production-v3", version: "3.2.0" },
  { source: "udm://module/tx-rrc-filing-v2", version: "2.0.0" },
];
const ios = await bootstrapIOSPlus(db, { graphVersion: "udmcore", matrixSpecs: specs });

ok("identity graph loaded from D1", !!ios.graph.nodes["igl://identity/allco/compliance-001"]);
ok("delegation edge loaded from D1", ios.graph.edges.some(e => e.type === "DELEGATES_TO"));
ok("exception loaded onto node", (ios.graph.nodes["igl://identity/allco/compliance-001"].exceptions || []).length === 1);
ok("both UDM matrices loaded from D1", Object.keys(ios.matrices).length === 2);

const filingMatrix = await loadConstraintMatrix(db, specs[1]);
const src = readFileSync(new URL("../programs/wellsite.igl", import.meta.url), "utf8");
const r = run(src, { ios, seed: 7 });

ok("WellSite runs against D1-backed IOS+ and issues a receipt", !!r.receipt.signature);
ok("receipt verifies", verify(r.receipt).ok);
ok("receipt used the D1 filing matrix (digest matches D1, not the stand-in)",
   r.receipt.constraintMatrixDigest === filingMatrix.digest, r.receipt.constraintMatrixDigest);
const fuse = r.traces.map(t => t.trace.fuse).find(Boolean);
ok("D1 constraint zeroed forbidden actions", fuse.outputDist[VOCAB.indexOf("deny")] === 0 && fuse.outputDist[VOCAB.indexOf("redact")] === 0);

await persistReceipt(db, r.receipt);
ok("persistReceipt wrote the receipt to D1", data.inserts.length === 1 && data.inserts[0][0] === r.receipt.receiptUUID);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
