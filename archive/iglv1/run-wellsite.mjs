// SPDX-License-Identifier: Apache-2.0
/* Execute the WellSite v1.0 program end to end and print the governed ledger,
   then verify the receipt and recompute a FUSE step the way a third party would. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { run, verify, recomputeFuse } from "./src/index.js";

const src = readFileSync(new URL("./programs/wellsite.igl", import.meta.url), "utf8");
const r = run(src, { seed: 7 });

console.log("WellSite production filing  -  IGL v1.0 governed session");
console.log("=".repeat(66));
console.log("session   :", r.sessionId);
console.log("programHash:", r.programHash.slice(0, 32), "...");
console.log("");
console.log("TURN LEDGER");
console.log("-".repeat(66));
console.log("seq  identity                              outcome     entropy");
const seen = new Set();
for (const [, v] of r.env) {
  if (v && v.type === "turn" && !seen.has(v.value.sequenceNo)) {
    seen.add(v.value.sequenceNo);
    const t = v.value;
    console.log(String(t.sequenceNo).padEnd(4),
      t.identity.id.replace("igl://identity/", "").padEnd(36),
      (t.outcome || "COMPLIANT").padEnd(11),
      (t.output?.entropy ?? "").toString());
  }
}
console.log("");
console.log("GOVERNANCE RECEIPT (terminal)");
console.log("-".repeat(66));
const rc = r.receipt;
for (const k of ["receiptUUID", "boundIdentity", "outcome", "constraintMatrixDigest", "cognitiveTraceRef", "identityGraphVersion", "timeOfIssuance"])
  console.log("  " + k.padEnd(24), (rc[k] || "").toString().slice(0, 40));
console.log("  " + "algorithm".padEnd(24), rc.algorithm);
console.log("  " + "signature".padEnd(24), rc.signature.slice(0, 40) + " ...");

console.log("");
console.log("INDEPENDENT VERIFICATION  (what an outside party runs)");
console.log("-".repeat(66));
const v = verify(r.receipt);                    // signature + fields, using the receipt's own key
console.log("  receipt signature verifies :", v.ok, v.ok ? "" : v.reason);

// recompute the FUSE of the first sealed trace from its stored record
const firstFuse = r.traces.map(t => t.trace.fuse).find(Boolean);
const fc = recomputeFuse(firstFuse);
console.log("  FUSE recomputes (normalize(v*w)) :", fc.ok);
console.log("    support restriction (w=0 -> g=0) :", fc.supportOk);
console.log("    output matches stored dist       :", fc.matches);
console.log("    output digest matches            :", fc.digestOk);

// Emit a standalone artifact: the receipt, the public key, and one FUSE record,
// so a third party can verify from these files alone (see verify-receipt.mjs).
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
const artifact = { receipt: r.receipt, publicKey: r.publicKey, fuseRecord: firstFuse, sessionId: r.sessionId };
writeFileSync(new URL("./out/receipt.json", import.meta.url), JSON.stringify(artifact, null, 2));

console.log("");
console.log("wrote out/receipt.json  (receipt + public key + one FUSE record)");
console.log("");
console.log(v.ok && fc.ok ? "RESULT: governed session filed and independently verifiable."
                          : "RESULT: verification FAILED.");
