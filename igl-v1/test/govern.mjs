// SPDX-License-Identifier: Apache-2.0
/* Hermetic test of the governed turn. The matrix is a pinned fixture captured
   live from udm.igl.dev with its real digest (1252a4e5...), so this never touches
   the network and never goes red because the Worker blipped. The live run is a
   separate artifact (run-govern.mjs), not this test. */

import { governedTurn, verifyGovernedReceipt } from "../src/govern.js";
import { Signer } from "../src/sign.js";
import { LIVE, fixtureFetch } from "./fixtures/live-matrices.js";

const US_TX_RRC = LIVE["US-TX|RRC"];
const mockFetch = fixtureFetch();
const signer = Signer.fromSeed("udm.igl.dev", Buffer.alloc(32, 9));

let passed = 0, failed = 0;
const ok = (n, c, extra = "") => { c ? passed++ : failed++; console.log((c ? "  ok   " : "  FAIL ") + n + (c ? "" : "  [" + extra + "]")); };

const compliantDist = { "path-production-report": 0.6, "path-well-identity": 0.2, "path-financial-detail": 0.1, "path-pii-disclosure": 0.1 };
const g = await governedTurn({ base: "https://udm.igl.dev", jurisdiction: "US-TX", agency: "RRC", distByPath: compliantDist, signer, fetchImpl: mockFetch });

ok("receipt binds the SERVICE-computed digest", g.receipt.constraintMatrixDigest === US_TX_RRC.digest);
ok("outcome COMPLIANT within ceilings", g.receipt.outcome === "COMPLIANT");
ok("PII path forced to zero mass", g.result.governed[g.result.paths.indexOf("path-pii-disclosure")] === 0);
ok("verifies from the artifact alone", verifyGovernedReceipt(g.receipt).ok);
ok("cross-session verify with the published key", verifyGovernedReceipt(g.receipt, { publicKeyB64: signer.pub() }).ok);

const tampered = JSON.parse(JSON.stringify(g.receipt));
tampered.payload.answer.governed[tampered.payload.answer.paths.indexOf("path-pii-disclosure")] = 0.5;
ok("altering the governed output is caught", verifyGovernedReceipt(tampered).ok === false);

const over = await governedTurn({ base: "https://udm.igl.dev", jurisdiction: "US-TX", agency: "RRC", distByPath: { "path-production-report": 0.95, "path-well-identity": 0.01, "path-financial-detail": 0.01, "path-pii-disclosure": 0.5 }, signer, fetchImpl: mockFetch });
ok("mass over the 0.8 ceiling -> HARD_VIOLATION in the receipt", over.receipt.outcome === "HARD_VIOLATION");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
