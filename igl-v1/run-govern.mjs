/* Produce the digest-match artifact, self-describing via provenance.
   Default: LIVE run against udm.igl.dev (needs network; writes out/receipt.live.json).
   --fixture: uses the pinned fixture (writes out/receipt.fixture.json, labeled).
   Usage: node run-govern.mjs [JURISDICTION] [AGENCY] [--fixture] */
import { writeFileSync, mkdirSync } from "node:fs";
import { governedTurn, verifyGovernedReceipt } from "./src/govern.js";
import { UDM_SERVICE } from "./src/udm.js";
import { Signer } from "./src/sign.js";
import { fixtureFetch } from "./test/fixtures/live-matrices.js";

const args = process.argv.slice(2);
const useFixture = args.includes("--fixture");
const [jur = "US-TX", agency = "RRC"] = args.filter(a => !a.startsWith("--"));
const signer = Signer.fromSeed("udm.igl.dev", Buffer.alloc(32, 7));   // DEV key; prod seed from a secret
const dist = { "path-production-report": 0.6, "path-well-identity": 0.2, "path-financial-detail": 0.1, "path-pii-disclosure": 0.1 };

const provenance = useFixture
  ? { digestSource: "fixture", note: "pinned fixture, NOT fetched from the wire", capturedAt: "2026-08-13" }
  : { digestSource: "live", service: UDM_SERVICE, url: `${UDM_SERVICE}/udm/matrix/get?jurisdiction=${jur}&agency=${agency}`, fetchedAt: new Date().toISOString() };

const { constraint, result, receipt } = await governedTurn({
  jurisdiction: jur, agency, distByPath: dist, signer, provenance,
  fetchImpl: useFixture ? fixtureFetch() : globalThis.fetch,
});

mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
const outName = useFixture ? "receipt.fixture.json" : "receipt.live.json";
writeFileSync(new URL(`./out/${outName}`, import.meta.url), JSON.stringify({ receipt, publicKey: signer.pub() }, null, 2));

console.log("digestSource               :", receipt.provenance.digestSource);
console.log("service matrix digest      :", constraint.digest);
console.log("receipt digest             :", receipt.constraintMatrixDigest);
console.log("digest match               :", constraint.digest === receipt.constraintMatrixDigest);
console.log("outcome                    :", result.outcome);
console.log("verifies from artifact     :", verifyGovernedReceipt(receipt).ok);
console.log("wrote out/" + outName);
