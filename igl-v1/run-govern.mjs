// SPDX-License-Identifier: Apache-2.0
/* Produce the digest-match artifact, self-describing via provenance.
   Default: LIVE run against udm.igl.dev (needs network; refreshes the committed
   artifacts/receipt.live.json). A live run only writes on success, so a failed
   fetch in an offline environment leaves the committed artifact untouched.
   --fixture: uses the pinned fixture (writes out/receipt.fixture.json, which is
   gitignored and ephemeral, so it can never overwrite the committed live artifact).
   Usage: node run-govern.mjs [JURISDICTION] [AGENCY] [--fixture] */
import { writeFileSync, mkdirSync } from "node:fs";
import { governedTurn, verifyGovernedReceipt } from "./src/govern.js";
import { UDM_SERVICE } from "./src/udm.js";
import { Signer } from "./src/sign.js";
import { fixtureFetch } from "./test/fixtures/live-matrices.js";

const args = process.argv.slice(2);
const useFixture = args.includes("--fixture");
const [jur = "US-TX", agency = "RRC"] = args.filter(a => !a.startsWith("--"));
/* DEV SIGNING KEY, NOT A PRODUCTION KEY.
   The seed is the constant Buffer.alloc(32, 7). Because the seed is hard-coded in
   this public repository, the private key is derivable by anyone and the public
   key (MCowBQYDK2VwAyEA6kps...) is effectively public. This key is fine for local
   runs and for producing a self-verifying demonstration artifact, but it must
   NEVER sign a production receipt: a receipt signed by a publicly-known key proves
   nothing about who governed the turn. In production, load the seed from a KMS or
   Worker secret (see src/worker.js, which reads IGL_SIGNING_SEED) and publish only
   the public half to a key directory. */
const signer = Signer.fromSeed("udm.igl.dev-DEV-INSECURE", Buffer.alloc(32, 7));
const dist = { "path-production-report": 0.6, "path-well-identity": 0.2, "path-financial-detail": 0.1, "path-pii-disclosure": 0.1 };

const provenance = useFixture
  ? { digestSource: "fixture", note: "pinned fixture, NOT fetched from the wire", capturedAt: "2026-08-13" }
  : { digestSource: "live", service: UDM_SERVICE, url: `${UDM_SERVICE}/udm/matrix/get?jurisdiction=${jur}&agency=${agency}`, fetchedAt: new Date().toISOString() };

const { constraint, result, receipt } = await governedTurn({
  jurisdiction: jur, agency, distByPath: dist, signer, provenance,
  fetchImpl: useFixture ? fixtureFetch() : globalThis.fetch,
});

/* A successful live run refreshes the COMMITTED artifact (artifacts/); the fixture
   run stays in out/ (gitignored) so it can never overwrite the committed live one. */
const outDir = useFixture ? "./out/" : "./artifacts/";
const outName = useFixture ? "receipt.fixture.json" : "receipt.live.json";
mkdirSync(new URL(outDir, import.meta.url), { recursive: true });
writeFileSync(new URL(`${outDir}${outName}`, import.meta.url), JSON.stringify({ receipt, publicKey: signer.pub() }, null, 2));

console.log("digestSource               :", receipt.provenance.digestSource);
console.log("service matrix digest      :", constraint.digest);
console.log("receipt digest             :", receipt.constraintMatrixDigest);
console.log("digest match               :", constraint.digest === receipt.constraintMatrixDigest);
console.log("outcome                    :", result.outcome);
console.log("verifies from artifact     :", verifyGovernedReceipt(receipt).ok);
console.log("wrote " + outDir.replace("./", "") + outName);
