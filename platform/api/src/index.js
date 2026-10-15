/* IGL Governed Identity Platform API. Cloudflare Worker, D1, no framework.

   Host and path layout (wrangler.toml routes):
     api.id-me.ai/v1/*        production, contract operations
     sandbox.id-me.ai/v1/*    sandbox, same code, separate database, igl_test_ keys
     auth.id-me.ai/oauth2/*   the token endpoint (also served under /v1 on either host)
   Everything the contract lists is in routes.generated.js; handlers.js has
   one handler per operationId; admin.js has the surfaces outside the
   contract (token endpoint, JWKS, sandbox signup, administration). */

import { ROUTES } from "./routes.generated.js";
import { handlers } from "./handlers.js";
import { adminFetch } from "./admin.js";
import { handleMcp } from "./mcp.js";
import { authenticate, rateLimit } from "./lib/auth.js";
import { ApiError, E, problem, json, readJson, requestHash, uuid, nowIso } from "./lib/http.js";
import { loadSigner } from "./lib/crypto.js";

const ORDERED = [...ROUTES].sort((a, b) => (a.path.includes("{") ? 1 : 0) - (b.path.includes("{") ? 1 : 0));
const CORS_HEADERS = { "access-control-allow-methods": "GET,POST,PATCH,OPTIONS", "access-control-allow-headers": "authorization,content-type,x-igl-tenant-id,x-igl-api-key,x-request-id,idempotency-key", "access-control-max-age": "600" };
let signerPromise = null;

function corsFor(request, env) {
  const origin = request.headers.get("origin");
  const allowed = (env.ALLOWED_ORIGINS || "https://id-me.ai,https://www.id-me.ai").split(",").map((s) => s.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return { "access-control-allow-origin": origin, vary: "Origin", ...CORS_HEADERS };
}

function match(method, pathname) {
  // strip the /v1 prefix; the contract's servers end in /v1
  const path = pathname.replace(/^\/v1(?=\/|$)/, "") || "/";
  for (const r of ORDERED) {
    if (r.method !== method) continue;
    const m = r.pattern.exec(path);
    if (m) return { route: r, params: m.groups || {} };
  }
  // method mismatch on a known path
  const known = ORDERED.filter((r) => r.pattern.test(path));
  if (known.length) throw new ApiError(405, "Method not allowed", `Use ${[...new Set(known.map((r) => r.method))].join(", ")}.`, { headers: { allow: [...new Set(known.map((r) => r.method))].join(", ") } });
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const requestId = request.headers.get("x-request-id")?.slice(0, 128) || uuid();
    const url = new URL(request.url);
    const cors = corsFor(request, env);
    const withCommon = (res) => { const h = new Headers(res.headers); h.set("x-request-id", requestId); h.set("x-content-type-options", "nosniff"); h.set("strict-transport-security", "max-age=31536000; includeSubDomains"); for (const [k, v] of Object.entries(cors)) h.set(k, v); return new Response(res.body, { status: res.status, headers: h }); };
    if (request.method === "OPTIONS") return withCommon(new Response(null, { status: 204 }));
    const db = env.DB;
    try {
      if (!db) throw new Error("D1 binding DB is missing");
      signerPromise = signerPromise || loadSigner(env, db);
      const signer = await signerPromise;

      const admin = await adminFetch({ request, env, ctx, db, url, signer, requestId });
      if (admin) return withCommon(admin);

      // MCP endpoint: authenticated like any operation; each tool call is checked against its operation's scopes
      if (url.pathname === "/v1/mcp" || url.pathname === "/mcp") {
        if (request.method !== "POST") throw new ApiError(405, "Method not allowed", "MCP is POST-only on this endpoint.", { headers: { allow: "POST" } });
        const principal = await authenticate({ request, env, db, signer, route: { scopes: [], keyHeader: true }, url });
        await rateLimit(db, env, "key:" + principal.keyId, 2);
        const raw = await request.text(); const msg = parseBody(raw, request);
        const checkScopes = (route) => { const need = route.scopes || []; if (need.length && !principal.scopes.includes("igl.platform") && !need.some((s) => principal.scopes.includes(s))) throw E.forbidden(`This tool requires scope ${need.join(" or ")}.`, { code: "insufficient_scope" }); };
        const out = await handleMcp({ request, env, ctx, db, url, principal, requestId, signer }, msg, checkScopes);
        return withCommon(out.body === null ? new Response(null, { status: out.status }) : json(out.body, out.status));
      }
      // The base address is not an operation. A person opening it in a browser gets a short page; a program gets a JSON description.
      if ((url.pathname === "/" || url.pathname === "/v1" || url.pathname === "/v1/") && request.method === "GET") return withCommon(landing(request, env));
      const matched = match(request.method, url.pathname);
      if (!matched) throw E.notFound("No such operation. The contract is at https://id-me.ai/docs/.");
      const { route, params } = matched;

      let principal = null;
      if (!route.public) {
        principal = await authenticate({ request, env, db, signer, route, url });
        await rateLimit(db, env, "key:" + principal.keyId, request.method === "GET" ? 1 : 5);
      }

      // Idempotency-Key on mutations: same key + same body replays the stored response; different body is a conflict.
      let body = null, rawBody = null, idemKey = null;
      if (request.method !== "GET" && request.method !== "HEAD") {
        rawBody = await request.text();
        body = rawBody.trim() ? parseBody(rawBody, request) : {};
        if (route.idempotent && principal) {
          idemKey = request.headers.get("idempotency-key");
          if (idemKey) {
            if (idemKey.length > 255) throw E.badRequest("Idempotency-Key is too long.");
            const prev = await db.prepare("SELECT * FROM idempotency WHERE tenant_id = ?1 AND key = ?2").bind(principal.tenantId, idemKey).first();
            if (prev) {
              if (prev.request_hash !== requestHash(request.method, url.pathname, rawBody)) throw E.conflict("Idempotency-Key was already used with a different request.", { code: "idempotency_mismatch" });
              return withCommon(new Response(prev.body, { status: prev.status, headers: { "content-type": "application/json", "idempotent-replayed": "true" } }));
            }
          }
        }
      }

      const handler = handlers[route.operationId];
      if (!handler) throw new ApiError(501, "Not implemented", `${route.operationId} is in the contract but not served by this deployment.`);
      const result = await handler({ request, env, ctx, db, url, params, principal, body, requestId, signer, route });
      const res = json(result.body, result.status, result.headers || {});
      if (idemKey && result.status < 500) ctx.waitUntil(db.prepare("INSERT OR IGNORE INTO idempotency (tenant_id, key, method, path, request_hash, status, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)").bind(principal.tenantId, idemKey, request.method, url.pathname, requestHash(request.method, url.pathname, rawBody), result.status, JSON.stringify(result.body), nowIso()).run());
      return withCommon(res);
    } catch (err) {
      if (!(err instanceof ApiError)) console.error("unhandled", requestId, err?.stack || err);
      return withCommon(problem(err instanceof ApiError ? err : { status: 500 }, requestId, url.pathname));
    }
  },
};

function landing(request, env) {
  const envName = env.IGL_ENV || "production";
  const base = `https://${envName === "sandbox" ? "sandbox" : "api"}.id-me.ai/v1`;
  const info = { service: "IGL Governed Identity Platform API", environment: envName, version: env.SERVICE_VERSION || "1.4.0", baseUrl: base, operations: ROUTES.length, documentation: "https://id-me.ai/docs/", reference: "https://id-me.ai/docs/#d-rest", openapi: "https://id-me.ai/igl-openapi-v0.2.yaml", health: base + "/health", wellKnown: base.replace(/\/v1$/, "") + "/.well-known/igl.json", mcp: base + "/mcp", ...(envName === "sandbox" ? { signup: base.replace(/\/v1$/, "") + "/sandbox/signup" } : { sandbox: "https://sandbox.id-me.ai/v1" }), tagline: "Governed intelligence. Before execution." };
  if (!/text\/html/i.test(request.headers.get("accept") || "")) return json(info);
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const rows = Object.entries(info).filter(([k]) => !["service", "tagline"].includes(k)).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${/^https:/.test(String(v)) ? `<a href="${esc(v)}">${esc(v)}</a>` : esc(v)}</td></tr>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(info.service)}, ${esc(envName)}</title><meta name="robots" content="noindex"><style>:root{color-scheme:dark}body{margin:0;background:#0a0a0c;color:#e8ecf4;font:15px/1.5 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}main{max-width:760px;margin:0 auto;padding:48px 20px}h1{font-size:22px;margin:0 0 4px}p{color:#a9b0c2;margin:0 0 24px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #262a36;vertical-align:top;font-size:14px}th{color:#a9b0c2;font-weight:500;white-space:nowrap}a{color:#6a7bff;text-decoration:none}a:hover{text-decoration:underline}code{font-family:ui-monospace,Menlo,Consolas,monospace}.note{margin-top:24px;font-size:13px;color:#a9b0c2}</style></head><body><main><h1>${esc(info.service)}</h1><p>${esc(info.tagline)} This is the ${esc(envName)} API host. Every operation lives under <code>${esc(base)}</code> and needs a key; the human-readable documentation is at <a href="https://id-me.ai/docs/">id-me.ai/docs</a>.</p><table>${rows}</table><p class="note">Programs calling this address with <code>Accept: application/json</code> receive the same information as JSON.</p></main></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}

function parseBody(raw, request) {
  const ct = request.headers.get("content-type") || "";
  if (raw.length > 1_000_000) throw new ApiError(413, "Payload too large", "Body exceeds 1 MB.");
  if (!/application\/json/i.test(ct)) throw E.badRequest("Content-Type must be application/json.");
  try { return JSON.parse(raw); } catch { throw E.badRequest("Body is not valid JSON."); }
}
