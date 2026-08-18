/* HTTP surface for the provisioning service. Node stdlib only — no deps.

     POST /api/provision   { description, kind?, auto? } → full governed run
     GET  /api/graphs      → every provisioned graph, newest first
     GET  /api/graphs/:slug → one graph's runtime artifact
     GET  /api/health      → model warm status
     POST /mcp             → Model Context Protocol endpoint (ChatGPT Apps)

   The model loads once at boot and stays warm; every provision is a real
   governed execution against the actor's hash-chained journal. */

import http from "node:http";
import { warmRuntime, provisionIdentity, listProvisioned, whoAmI } from "./service.mjs";
import { handleMcp } from "./mcp.mjs";
/* Real caller registry is gitignored (identities.mjs); the example ships in
   the repo so the service boots out of the box. Deployment drops its own
   identities.mjs next to this file and it wins automatically. */
const { resolveCaller } = await import("./identities.mjs")
  .catch(() => import("./identities.example.mjs"));

const PORT = Number(process.env.PROVISION_PORT || 8787);
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8787",
];
const ALLOWED_ORIGINS = new Set(
  (process.env.PROVISION_ALLOWED_ORIGINS
    ? process.env.PROVISION_ALLOWED_ORIGINS.split(",")
    : DEFAULT_ALLOWED_ORIGINS).map((o) => o.trim()).filter(Boolean),
);

function corsHeaders(req) {
  const origin = req.headers.origin;
  const headers = {
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,mcp-session-id",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

function send(req, res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    ...corsHeaders(req),
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => { buf += c; if (buf.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

await warmRuntime();

/* Optional bearer gate — set PROVISION_API_KEY when the service is exposed
   beyond localhost (e.g. tunnelled for ChatGPT). Health stays open so uptime
   checks work; everything else requires the key. The MCP endpoint also
   accepts ?key= because developer-mode connectors cannot always send custom
   headers. Registered caller keys (identities.mjs) pass the gate the same
   way — and carry the caller's identity graph with them. */
const API_KEY = process.env.PROVISION_API_KEY || null;
function callerKey(req, url) {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  return bearer ?? url.searchParams.get("key");
}
function authorized(req, url) {
  if (url.pathname === "/api/health") return true;
  const key = callerKey(req, url);
  if (!API_KEY) return true;                    // local dev: no gate
  if (key === API_KEY) return true;             // service key
  if (resolveCaller(key)) return true;          // registered caller identity
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "OPTIONS") return send(req, res, 204, {});
    if (!authorized(req, url)) return send(req, res, 401, { error: "unauthorized" });
    const caller = resolveCaller(callerKey(req, url));

    if (req.method === "GET" && url.pathname === "/api/whoami") {
      if (!caller) return send(req, res, 401, { error: "unrecognized caller — present a registered identity key" });
      return send(req, res, 200, await whoAmI(caller));
    }

    if (url.pathname === "/mcp") {
      if (req.method !== "POST") return send(req, res, 405, { error: "MCP is POST-only on this endpoint" });
      return handleMcp(req, res, await readBody(req), caller);
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      return send(req, res, 200, { ok: true, model: "Xenova/distilgpt2" });
    }

    if (req.method === "GET" && url.pathname === "/api/graphs") {
      return send(req, res, 200, { graphs: listProvisioned() });
    }

    const m = url.pathname.match(/^\/api\/graphs\/([a-z0-9-]+)$/);
    if (req.method === "GET" && m) {
      const g = listProvisioned().find((x) => x.slug === m[1]);
      return g ? send(req, res, 200, g) : send(req, res, 404, { error: "not provisioned" });
    }

    if (req.method === "POST" && url.pathname === "/api/provision") {
      const body = await readBody(req);
      if (!body.auto && !(body.description || "").trim())
        return send(req, res, 400, { error: "description is required (or set auto=true)" });
      const result = await provisionIdentity({
        description: body.description ?? "",
        kind: body.kind ?? null,
        auto: !!body.auto,
      });
      return send(req, res, 200, result);
    }

    send(req, res, 404, { error: "unknown route" });
  } catch (err) {
    send(req, res, 500, { error: String(err?.message ?? err) });
  }
});

server.listen(PORT, () => {
  console.log(`[provision] Identity Graph provisioning service on http://localhost:${PORT}`);
  console.log(`[provision] POST /api/provision — model warm, journals hash-chained`);
  console.log(`[provision] POST /mcp — MCP endpoint for ChatGPT Apps${API_KEY ? " (append ?key=$PROVISION_API_KEY)" : ""}`);
  if (API_KEY) console.log(`[provision] bearer auth ENABLED (PROVISION_API_KEY set)`);
});
