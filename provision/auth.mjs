/* Request authentication and limits for the provisioning service (F-01, F-02).

   Credentials travel in headers only:
     Authorization: Bearer <service key | caller key>
     X-IGL-Caller-Key: <caller key>           (for clients that reserve Authorization)
   A key in the query string is ignored — it would land in access logs,
   proxies and browser history.

   Two kinds of principal come out of the gate:
     service  — PROVISION_API_KEY. Administrative: may read every tenant and
                provision on behalf of any owner.
     caller   — a registered identity (identities.mjs). Scoped to its own
                tenant and principal; sees and writes only its own graphs.

   The service never runs open on a routable interface: with no key it binds
   loopback, and PROVISION_PUBLIC=1 without a key refuses to start. */

import { createHash, timingSafeEqual } from "node:crypto";

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export function credentialFrom(req) {
  const auth = req.headers?.authorization;
  if (typeof auth === "string" && /^Bearer\s+\S+$/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  const hdr = req.headers?.["x-igl-caller-key"];
  if (typeof hdr === "string" && hdr.trim()) return hdr.trim();
  return null;                                  // never the query string
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

/* Stable ids: a principal is the hash of the caller key, never its display
   name, so two callers who resolve to the same label never share storage.
   A registry entry may pin its own `id` and `tenant`. */
export function principalOf(key, identity = null) {
  const id = identity?.id || "p_" + sha256("igl-principal:" + key).slice(0, 24);
  const tenant = identity?.tenant || id;
  return { principal: id, tenant };
}

export function makeGate({ apiKey = null, resolveCaller = () => null, publicRoutes = ["/api/health"] } = {}) {
  return function gate(req, url) {
    if (publicRoutes.includes(url.pathname)) return { ok: true, principal: null, tenant: null, admin: false, caller: null, anonymous: true };
    const key = credentialFrom(req);
    if (key && apiKey && safeEqual(key, apiKey))
      return { ok: true, principal: "service", tenant: "*", admin: true, caller: null };
    const caller = key ? resolveCaller(key) : null;
    if (caller) return { ok: true, ...principalOf(key, caller), admin: false, caller };
    if (!apiKey && !key) {
      /* Local development with no key configured: the server is bound to
         loopback (see listenConfig), so the only principal is the local
         operator. Treated as admin of a single implicit tenant. */
      return { ok: true, principal: "local", tenant: "local", admin: true, caller: null, local: true };
    }
    return { ok: false, status: 401, reason: key ? "unrecognized credential" : "credential required" };
  };
}

/* Where to listen. Refuses the one combination that is never acceptable:
   reachable from the network with nothing checking who is calling. */
export function listenConfig(env = process.env) {
  const port = Number(env.PROVISION_PORT || 8787);
  const isPublic = env.PROVISION_PUBLIC === "1";
  const apiKey = env.PROVISION_API_KEY || null;
  if (isPublic && !apiKey)
    throw new Error("PROVISION_PUBLIC=1 requires PROVISION_API_KEY — refusing to expose the provisioning service without authentication");
  return { host: isPublic ? (env.PROVISION_HOST || "0.0.0.0") : "127.0.0.1", port, isPublic, apiKey };
}

/* Token bucket per principal. */
export class RateLimiter {
  constructor({ capacity = 60, refillPerSec = 1, now = () => Date.now() } = {}) {
    Object.assign(this, { capacity, refillPerSec, now }); this.buckets = new Map();
  }
  take(key, cost = 1) {
    const t = this.now();
    const b = this.buckets.get(key) || { tokens: this.capacity, at: t };
    b.tokens = Math.min(this.capacity, b.tokens + ((t - b.at) / 1000) * this.refillPerSec); b.at = t;
    if (b.tokens < cost) { this.buckets.set(key, b); return { ok: false, retryAfterSec: Math.ceil((cost - b.tokens) / this.refillPerSec) }; }
    b.tokens -= cost; this.buckets.set(key, b); return { ok: true };
  }
}

/* Concurrency cap for inference: queue beyond `max`, reject beyond `maxQueue`. */
export class Semaphore {
  constructor({ max = 2, maxQueue = 8 } = {}) { Object.assign(this, { max, maxQueue }); this.active = 0; this.queue = []; }
  acquire() {
    if (this.active < this.max) { this.active++; return Promise.resolve(() => this._release()); }
    if (this.queue.length >= this.maxQueue) return Promise.reject(Object.assign(new Error("inference queue full"), { status: 503 }));
    return new Promise((resolve) => this.queue.push(() => { this.active++; resolve(() => this._release()); }));
  }
  _release() { this.active--; const next = this.queue.shift(); if (next) next(); }
}

/* CORS is a browser courtesy, never an authorization decision. Origins come
   from PROVISION_ALLOWED_ORIGINS (comma-separated); nothing is allowed by
   default, and the response always varies on Origin so caches stay honest. */
export function allowedOrigins(env = process.env) {
  return (env.PROVISION_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
}
export function corsHeaders(req, origins, { exposeSession = false } = {}) {
  const origin = req.headers.origin;
  if (!origin || !origins.includes(origin)) return {};
  const h = {
    "access-control-allow-origin": origin,
    "vary": "Origin",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-igl-caller-key,mcp-session-id",
  };
  if (exposeSession) h["access-control-expose-headers"] = "mcp-session-id";
  return h;
}
