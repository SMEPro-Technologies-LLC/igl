/* Run the WellSite filing pipeline and commit the sample filing record, so a
   complete two-turn governed filing (draft chained to file, both receipts, the
   audit result) is a concrete inspectable artifact in the repo.
   Default uses the pinned fixture matrix; pass --live on a networked host to bind
   the record to a fresh wire fetch. */
import { writeFileSync, mkdirSync } from "node:fs";
import { runFiling, auditFilingRecord } from "./src/filing.js";
import { Signer } from "./src/sign.js";
import { fixtureFetch } from "./test/fixtures/live-matrices.js";

const live = process.argv.includes("--live");
const signer = Signer.fromSeed("filing-DEV-INSECURE", Buffer.alloc(32, 13));   // dev key, not production
const facts = { operator: "Allco", wellId: "42-255-31234", period: "2026-Q3", district: "01", volumes: { oilBbl: 1804, gasMcf: 9312 } };

const run = await runFiling({ facts, base: "https://udm.igl.dev", signer, fetchImpl: live ? globalThis.fetch : fixtureFetch() });
if (!run.filed) { console.error("pipeline aborted at " + run.abortedAt); process.exit(1); }
const audit = auditFilingRecord(run.record);

mkdirSync(new URL("./artifacts/", import.meta.url), { recursive: true });
writeFileSync(new URL("./artifacts/filing-record.sample.json", import.meta.url), JSON.stringify({
  note: "Sample WellSite filing record: two chained governed turns through the gateway, auditor-verifiable from this file alone." + (live ? "" : " Matrix from the pinned fixture."),
  provenance: live ? "live" : "fixture",
  ...run.record,
  audit,
}, null, 2));

console.log("filed                 :", run.filed);
console.log("draft receipt         :", run.record.draftReceipt.receiptUUID);
console.log("filing receipt        :", run.record.filingReceipt.receiptUUID, "(chained:", run.record.chainLink.linked + ")");
console.log("bound to digest       :", run.record.constraintMatrixDigest.slice(0, 16) + "...");
console.log("audits clean          :", audit.ok);
console.log("wrote artifacts/filing-record.sample.json");
