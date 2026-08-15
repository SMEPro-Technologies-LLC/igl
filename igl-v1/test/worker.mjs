// SPDX-License-Identifier: Apache-2.0
/* Prove the deployable surface end to end, locally, with no network and no
   Cloudflare account. We import the exact deploy entry (workers/igl-api/index.js),
   stub the wire with the pinned live fixture, and drive real Request/Response
   objects through the handler: govern, then verify, then health. This is the same
   code path that `wrangler deploy` ships, so a green run here means the deployed
   Worker governs against the live matrix and returns a receipt that verifies. */

import worker from "../workers/igl-api/index.js";
import { fixtureFetch, LIVE } from "./fixtures/live-matrices.js";

let passed = 0, failed = 0;
const ok = (n, c, extra = "") => { c ? passed++ : failed++; console.log((c ? "  ok   " : "  FAIL ") + n + (c ? "" : "  [" + extra + "]")); };

// Deterministic signing seed (64 hex = 32 bytes), as `wrangler secret put` would provide.
const env = { IGL_SIGNING_SEED: "07".repeat(32) };
const realFetch = globalThis.fetch;
globalThis.fetch = fixtureFetch();   // stub the upstream matrix service

try {
  const req = (path, body, method = "POST") =>
    new Request("https://igl-api.local" + path, method === "POST"
      ? { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      : { method });

  // 1) govern a compliant distribution
  const dist = { "path-production-report": 0.6, "path-well-identity": 0.2, "path-financial-detail": 0.1, "path-pii-disclosure": 0.1 };
  const gres = await worker.fetch(req("/govern", { jurisdiction: "US-TX", agency: "RRC", dist }), env);
  ok("POST /govern returns 200", gres.status === 200, "status " + gres.status);
  const gbody = await gres.json();
  ok("receipt binds the live service digest", gbody.receipt.constraintMatrixDigest === LIVE["US-TX|RRC"].digest);
  ok("outcome is COMPLIANT within ceilings", gbody.receipt.outcome === "COMPLIANT");
  ok("provenance marks a live wire fetch", gbody.receipt.provenance?.digestSource === "live");
  ok("PII path was forced to zero mass", gbody.receipt.payload.answer.governed[gbody.receipt.payload.answer.paths.indexOf("path-pii-disclosure")] === 0);

  // 2) verify the receipt the surface just issued, with the key it returned
  const vres = await worker.fetch(req("/verify", { receipt: gbody.receipt, publicKey: gbody.publicKey }), env);
  const vbody = await vres.json();
  ok("POST /verify confirms the fresh receipt", vbody.ok === true, JSON.stringify(vbody));

  // 3) a HARD_VIOLATION is reported, not thrown past the surface
  const over = { "path-production-report": 0.95, "path-well-identity": 0.01, "path-financial-detail": 0.01, "path-pii-disclosure": 0.5 };
  const ores = await worker.fetch(req("/govern", { jurisdiction: "US-TX", agency: "RRC", dist: over }), env);
  const obody = await ores.json();
  ok("mass over the 0.8 ceiling is HARD_VIOLATION in the receipt", obody.receipt.outcome === "HARD_VIOLATION");

  // 4) health reports the surface is keyed
  const hres = await worker.fetch(req("/health", null, "GET"), env);
  const hbody = await hres.json();
  ok("GET /health reports the live-bound surface, keyed", hbody.service === "igl-api" && hbody.keyed === true);
} finally {
  globalThis.fetch = realFetch;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
