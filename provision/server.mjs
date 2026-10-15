/* HTTP surface for the provisioning service. Node stdlib only — no deps.

     POST /api/provision        { description, kind?, auto?, owner? } → governed run, stored under the caller's principal
     GET  /api/graphs           → graphs the caller may read, newest first
     GET  /api/graphs/:id       → one graph by id, if the caller may read it
     GET  /api/whoami           → the caller's own graph (seed on first contact, replay after)
     GET  /api/health           → model warm status (public)
     GET  /  or  /studio        → IGL Studio, a static UI shell (public; every API call it makes is gated)
     POST /mcp                  → Model Context Protocol endpoint

   Security posture (F-01):
     · binds 127.0.0.1 unless PROVISION_PUBLIC=1, which also REQUIRES
       PROVISION_API_KEY — the process refuses to start otherwise
     · credentials in headers only (Authorization: Bearer / X-IGL-Caller-Key);
       a key in the query string is ignored
     · per-principal rate limit and a concurrency cap on inference
     · CORS origins are an allow-list (PROVISION_ALLOWED_ORIGINS); CORS is not auth */

import http from "node:http";
import { warmRuntime, provisionIdentity, listProvisioned, getProvisioned, whoAmI } from "./service.mjs";
import { handleMcp } from "./mcp.mjs";
import { readFile } from "node:fs/promises";
import { makeGate, listenConfig, RateLimiter, Semaphore, allowedOrigins, corsHeaders as cors, clientError } from "./auth.mjs";
/* Real caller registry is gitignored (identities.mjs); the example ships in
   the repo so the service boots out of the box. */
const { resolveCaller } = await import("./identities.mjs").catch(() => import("./identities.example.mjs"));

const cfg = listenConfig(process.env);            // throws on PUBLIC without a key
const gate = makeGate({ apiKey: cfg.apiKey, resolveCaller, publicRoutes: ["/api/health", "/", "/studio"] });
const limiter = new RateLimiter({ capacity: Number(process.env.PROVISION_RATE_BURST || 60), refillPerSec: Number(process.env.PROVISION_RATE_PER_SEC || 1) });
const inference = new Semaphore({ max: Number(process.env.PROVISION_MAX_CONCURRENT || 2), maxQueue: Number(process.env.PROVISION_MAX_QUEUE || 8) });
const ORIGINS = allowedOrigins();
const corsHeaders = (req) => cors(req, ORIGINS);
function send(req, res, status, body, extra = {}) {
  res.writeHead(status, { "content-type": "application/json", "x-content-type-options": "nosniff", "cache-control": "no-store", ...corsHeaders(req), ...extra });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => { buf += c; if (buf.length > 1e6) { req.destroy(); reject(Object.assign(new Error("body too large"), { status: 413 })); } });
    req.on("end", () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(Object.assign(new Error("invalid JSON body"), { status: 400 })); } });
    req.on("error", reject);
  });
}
function ownerFor(auth, requested) {
  if (auth.admin && requested?.tenant && requested?.principal) return { tenant: requested.tenant, principal: requested.principal };
  if (!auth.tenant || !auth.principal) throw Object.assign(new Error("present a registered caller key or the service key"), { status: 401 });
  return { tenant: auth.tenant, principal: auth.principal };
}
async function withInference(fn) { const release = await inference.acquire(); try { return await fn(); } finally { release(); } }

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${cfg.host}:${cfg.port}`);
    if (req.method === "OPTIONS") { res.writeHead(204, corsHeaders(req)); return res.end(); }
    const auth = gate(req, url);
    if (!auth.ok) return send(req, res, auth.status, { error: auth.reason }, { "www-authenticate": 'Bearer realm="igl-provision"' });
    if (!auth.anonymous) {
      const rl = limiter.take(auth.principal, req.method === "POST" ? 5 : 1);
      if (!rl.ok) return send(req, res, 429, { error: "rate limit exceeded" }, { "retry-after": String(rl.retryAfterSec) });
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/studio")) {
      const html = globalThis.__IGL_STUDIO_HTML ??= await readFile(new URL("./studio.html", import.meta.url), "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      return res.end(html);
    }
    if (req.method === "GET" && url.pathname === "/api/health")
      return send(req, res, 200, { ok: true, model: "Xenova/distilgpt2", public: cfg.isPublic });
    if (req.method === "GET" && url.pathname === "/api/whoami") {
      if (!auth.caller) return send(req, res, 401, { error: "unrecognized caller — present a registered identity key" });
      return send(req, res, 200, await withInference(() => whoAmI(auth.caller, ownerFor(auth))));
    }
    if (url.pathname === "/mcp") {
      if (req.method !== "POST") return send(req, res, 405, { error: "MCP is POST-only on this endpoint" });
      return withInference(async () => handleMcp(req, res, await readBody(req), auth));
    }
    if (req.method === "GET" && url.pathname === "/api/graphs")
      return send(req, res, 200, { graphs: listProvisioned(auth) });
    const m = url.pathname.match(/^\/api\/graphs\/([a-z0-9_-]+)$/i);
    if (req.method === "GET" && m) {
      const g = getProvisioned(auth, m[1]);
      return g ? send(req, res, 200, g) : send(req, res, 404, { error: "not found or not readable by this principal" });
    }
    if (req.method === "POST" && url.pathname === "/api/provision") {
      const body = await readBody(req);
      if (!body.auto && !(body.description || "").trim()) return send(req, res, 400, { error: "description is required (or set auto=true)" });
      const owner = ownerFor(auth, body.owner);
      const result = await withInference(() => provisionIdentity({ description: body.description ?? "", kind: body.kind ?? null, auto: !!body.auto, owner }));
      return send(req, res, 200, result);
    }
    send(req, res, 404, { error: "unknown route" });
  } catch (err) {
    const e = clientError(err);
    send(req, res, e.status, e.code ? { error: e.message, code: e.code } : { error: e.message });
  }
});

if (process.env.PROVISION_NO_LISTEN !== "1") {
  await warmRuntime();
  server.listen(cfg.port, cfg.host, () => {
    console.log(`[provision] Identity Graph provisioning service on http://${cfg.host}:${cfg.port}${cfg.isPublic ? "" : " (loopback only — set PROVISION_PUBLIC=1 and PROVISION_API_KEY to expose)"}`);
    console.log(`[provision] auth: ${cfg.apiKey ? "service key + registered callers" : "none configured — local operator only"}; credentials in headers only`);
  });
}
