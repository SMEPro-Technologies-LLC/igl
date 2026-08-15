/* The WellSite filing pipeline, end to end: two chained governed turns through
   the gateway, a filing record an auditor verifies from the artifact alone, and
   the abort path where an ungovernable filing produces no record at all. */

import { runFiling, auditFilingRecord } from "../src/filing.js";
import { Signer, sha256 } from "../src/sign.js";
import { fixtureFetch, LIVE } from "./fixtures/live-matrices.js";

let passed = 0, failed = 0;
const ok = (n, c, extra = "") => { c ? passed++ : failed++; console.log((c ? "  ok   " : "  FAIL ") + n + (c ? "" : "  [" + extra + "]")); };

const signer = Signer.fromSeed("filing-test", Buffer.alloc(32, 11));
const facts = { operator: "Allco", wellId: "42-255-31234", period: "2026-Q3", district: "01", volumes: { oilBbl: 1804, gasMcf: 9312 } };

// A clean filing.
const run = await runFiling({ facts, base: "https://udm.igl.dev", signer, fetchImpl: fixtureFetch() });
ok("pipeline files (two governed turns, neither refused)", run.filed === true);
ok("both steps recorded with identities", run.steps.length === 2 && run.steps[0].identity.includes("operator-014") && run.steps[1].identity.includes("compliance-001"));
ok("both receipts bound to the live US-TX/RRC digest", run.record.draftReceipt.constraintMatrixDigest === LIVE["US-TX|RRC"].digest && run.record.filingReceipt.constraintMatrixDigest === LIVE["US-TX|RRC"].digest);
ok("filing chains to the draft (prev = draft chain_hash)", run.record.chainLink.linked === true);
ok("draft subject is the preparer, filing subject is the filer", run.record.draftReceipt.subject.includes("operator-014") && run.record.filingReceipt.subject.includes("compliance-001"));

// The auditor's check, from the record alone.
const audit = auditFilingRecord(run.record);
ok("filing record audits clean from the artifact alone", audit.ok === true, audit.reason || "");
ok("audit surfaces the well and period", audit.wellId === facts.wellId && audit.period === facts.period);

// Tampering with the volumes after the fact is caught.
const tampered = JSON.parse(JSON.stringify(run.record));
tampered.filingReceipt.payload.answer.outcome = "COMPLIANT_EDITED";
ok("editing a sealed receipt inside the record is caught", auditFilingRecord(tampered).ok === false);

// Breaking the chain is caught.
const broken = JSON.parse(JSON.stringify(run.record));
broken.filingReceipt.prev_receipt_hash = sha256("someone else's draft");
ok("re-parenting the filing onto a different draft is caught", auditFilingRecord(broken).ok === false);

// The abort path: a connector whose filing turn is over the production-report
// ceiling. The pipeline refuses at file_report and produces NO record.
let call = 0;
const overCapConnector = async (model, messages) => {
  call++;
  if (call === 1) return { text: "packet drafted: production report with well identity records" };
  return { text: "file it all", distByPath: { "path-production-report": 0.95, "path-well-identity": 0.02, "path-financial-detail": 0.01, "path-pii-disclosure": 0.02 } };
};
const aborted = await runFiling({ facts, base: "https://udm.igl.dev", signer, fetchImpl: fixtureFetch(), connector: overCapConnector });
ok("over-ceiling filing turn aborts the pipeline", aborted.filed === false && aborted.abortedAt === "file_report");
ok("no filing record exists for an ungovernable filing", aborted.record === undefined);
ok("the refusal itself is sealed and carries the draft receipt", aborted.refusal.igl.refused === true && aborted.draftReceipt.chain_hash.length === 64);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
