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
    if (request.method === "POST" && url.pathname === "/govern") {
      const { jurisdiction, agency, dist, strictness = "HARD" } = await request.json();
      const { receipt } = await governedTurn({ jurisdiction, agency, distByPath: dist, strictness, signer: signerFrom(env) });
      return Response.json({ receipt, publicKey: signerFrom(env).pub() });
    }
    if (request.method === "POST" && url.pathname === "/verify") {
      const { receipt, publicKey } = await request.json();
      return Response.json(verifyGovernedReceipt(receipt, { publicKeyB64: publicKey }));
    }
    return new Response("POST /govern { jurisdiction, agency, dist } | POST /verify { receipt, publicKey }", { status: 404 });
  },
};
