/* Verify a governed-turn artifact from the file alone, and report its provenance
   loudly so a fixture-sourced receipt is never mistaken for a live one.
   Usage: node verify-governed.mjs [artifacts/receipt.live.json] */
import { readFileSync } from "node:fs";
import { verifyGovernedReceipt } from "./src/govern.js";
// Default to the committed artifact so this runs on a fresh clone with no prior run.
const path = process.argv[2] || new URL("./artifacts/receipt.live.json", import.meta.url);
const art = JSON.parse(readFileSync(path, "utf8"));
const r = art.receipt;
const v = verifyGovernedReceipt(r, { publicKeyB64: art.publicKey });
console.log("digestSource           :", r.provenance?.digestSource ?? "(none)");
if (r.provenance?.digestSource !== "live") console.log("NOTE: this receipt's matrix digest is NOT from a live fetch.");
console.log("constraintMatrixDigest :", r.constraintMatrixDigest);
console.log("jurisdiction/agency    :", r.jurisdiction + "/" + r.agency);
console.log("outcome                :", r.outcome);
console.log("verified from artifact :", v.ok, v.ok ? "" : "(" + v.reason + ")");
process.exit(v.ok ? 0 : 1);
