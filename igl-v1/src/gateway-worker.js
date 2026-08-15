/* Cloudflare Worker entry for the governed-decode gateway.
   Same deploy pattern as igl-api: nodejs_compat, IGL_SIGNING_SEED as a secret,
   UDM_SERVICE as a var. Any OpenAI-compatible client points its base URL here. */
import { governedCompletion, referenceConnector, verifyCompletionReceipt } from "./gateway.js";
import { Signer } from "./sign.js";

function signerFrom(env) {
  const hex = env && env.IGL_SIGNING_SEED;
  return hex ? Signer.fromSeed("igl-gateway", Buffer.from(hex, "hex")) : Signer.generate("igl-gateway");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const signer = signerFrom(env);
    const base = env && env.UDM_SERVICE ? env.UDM_SERVICE : undefined;

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      const body = await request.json();
      /* Connector registry seam: real deployments map model names to upstream
         connectors here (env-configured). The reference connector needs no
         upstream and keeps the gateway honest and testable. */
      const r = await governedCompletion({ base, body, connector: referenceConnector(), signer });
      return Response.json(r.payload, { status: r.status });
    }
    if (request.method === "POST" && url.pathname === "/v1/verify") {
      const { receipt, publicKey } = await request.json();
      return Response.json(verifyCompletionReceipt(receipt, { publicKeyB64: publicKey }));
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ service: "igl-gateway", surface: "OpenAI-compatible governed decode", upstream: base || "https://udm.igl.dev", keyed: !!(env && env.IGL_SIGNING_SEED) });
    }
    return new Response("POST /v1/chat/completions | POST /v1/verify | GET /health", { status: 404 });
  },
};
