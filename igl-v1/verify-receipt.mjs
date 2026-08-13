/* Third-party verification from the artifact alone.
   Reads out/receipt.json (produced by run-wellsite.mjs) and checks, using only
   the receipt, the published public key, and the stored FUSE record:
     1. the Ed25519 signature verifies over the receipt fields, and
     2. the governed output recomputes as normalize(v (x) w) with support
        restriction, matching the stored digest.
   Nothing here trusts the runtime that produced the receipt. */

import { readFileSync } from "node:fs";
import { verify, recomputeFuse } from "./src/index.js";

const art = JSON.parse(readFileSync(new URL("./out/receipt.json", import.meta.url), "utf8"));

const v = verify(art.receipt, art.publicKey);
console.log("signature verifies against published key :", v.ok, v.ok ? "" : "(" + v.reason + ")");

const fc = recomputeFuse(art.fuseRecord);
console.log("FUSE recomputes independently            :", fc.ok);
console.log("  support restriction holds (w=0 -> g=0) :", fc.supportOk);
console.log("  matches stored governed distribution   :", fc.matches);
console.log("  matches stored output digest           :", fc.digestOk);

const ok = v.ok && fc.ok;
console.log("\n" + (ok ? "VERIFIED from the artifact alone." : "NOT VERIFIED."));
process.exit(ok ? 0 : 1);
