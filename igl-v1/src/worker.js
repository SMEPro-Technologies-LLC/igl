// SPDX-License-Identifier: Apache-2.0
/* Cloudflare Worker entry for the live governed turn.
   Requires compatibility_flags = ["nodejs_compat"] (node:crypto in sign.js).
   The signing seed comes from a secret (IGL_SIGNING_SEED, 64 hex chars), never a
   constant, so receipts are attributable to a stable, published key. */
import { governedTurn, verifyGovernedReceipt } from "./govern.js";
import { Signer } from "./sign.js";

function signerFrom(env) {
  const hex = env && env.IGL_SIGNING_SEED;
  return hex ? Signer.fromSeed("udm.igl.dev", Buffer.from(hex, "hex")) : Signer.generate("udm.igl.dev");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Build the signer ONCE per request. With a seed it is deterministic; without
    // one, generate() would return a different key on each call, so the returned
    // publicKey must come from the same signer that signed the receipt.
    const signer = signerFrom(env);
    const base = env && env.UDM_SERVICE ? env.UDM_SERVICE : undefined;   // defaults to udm.igl.dev

    if (request.method === "POST" && url.pathname === "/govern") {
      const { jurisdiction, agency, dist, strictness = "HARD", subject = null, prev = null } = await request.json();
      const provenance = { digestSource: "live", service: base || "https://udm.igl.dev" };
      const { receipt } = await governedTurn({ base, jurisdiction, agency, distByPath: dist, strictness, signer, subject, prev, provenance });
      return Response.json({ receipt, publicKey: signer.pub() });
    }
    if (request.method === "POST" && url.pathname === "/verify") {
      const { receipt, publicKey } = await request.json();
      return Response.json(verifyGovernedReceipt(receipt, { publicKeyB64: publicKey }));
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ service: "igl-api", surface: "govern.js over udm.js", upstream: base || "https://udm.igl.dev", keyed: !!(env && env.IGL_SIGNING_SEED) });
    }
    return new Response("POST /govern { jurisdiction, agency, dist } | POST /verify { receipt, publicKey } | GET /health", { status: 404 });
  },
};
