/* Who may see the console. Two ways in, checked in this order:

   1. Cloudflare Access. When ACCESS_TEAM_DOMAIN and ACCESS_AUD are set, the
      console sits behind an Access application and every request must carry
      an Access token (Cf-Access-Jwt-Assertion header or CF_Authorization
      cookie) that verifies against the team's published keys.
   2. Built-in sign-in. When OPS_ADMIN_PASSWORD is set as a Worker secret, the
      console shows its own sign-in page. The username is OPS_ADMIN_USER
      (default "admin"). A successful sign-in sets a signed, HttpOnly session
      cookie good for twelve hours. Five failed attempts from one address lock
      that address out for fifteen minutes.

   With neither configured the Worker answers 503 to everyone (fail closed).
   OPS_DEV=1 disables all checks for local development only. */

const certCache = { at: 0, keys: null };
const enc = new TextEncoder();
const SESSION_COOKIE = "igl_ops";
const SESSION_HOURS = 12;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map();   // ip -> { n, until }

function b64urlToBuf(s) { return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"); }
const b64url = (buf) => Buffer.from(buf).toString("base64url");

/* ---------- Cloudflare Access ---------- */

async function keysFor(teamDomain) {
  if (certCache.keys && Date.now() - certCache.at < 10 * 60 * 1000) return certCache.keys;
  const r = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`Access certs ${r.status}`);
  const j = await r.json();
  const keys = new Map();
  for (const k of j.keys || []) keys.set(k.kid, await crypto.subtle.importKey("jwk", k, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
  certCache.keys = keys; certCache.at = Date.now();
  return keys;
}

async function verifyAccess(request, env) {
  const token = request.headers.get("cf-access-jwt-assertion") || (request.headers.get("cookie") || "").match(/CF_Authorization=([^;]+)/)?.[1];
  if (!token) return { error: "No Access token; open this console through Cloudflare Access.", status: 401 };
  const parts = token.split(".");
  if (parts.length !== 3) return { error: "Malformed Access token", status: 401 };
  let header, claims;
  try { header = JSON.parse(b64urlToBuf(parts[0]).toString("utf8")); claims = JSON.parse(b64urlToBuf(parts[1]).toString("utf8")); } catch { return { error: "Malformed Access token", status: 401 }; }
  try {
    const keys = await keysFor(env.ACCESS_TEAM_DOMAIN);
    const key = keys.get(header.kid);
    if (!key) return { error: "Unknown Access signing key", status: 401 };
    const ok = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, b64urlToBuf(parts[2]), Buffer.from(parts[0] + "." + parts[1]));
    if (!ok) return { error: "Access token signature does not verify", status: 401 };
  } catch (e) { return { error: "Could not verify Access token: " + e.message, status: 503 }; }
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) return { error: "Access token expired", status: 401 };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(env.ACCESS_AUD)) return { error: "Access token is for a different application", status: 401 };
  if (claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return { error: "Access token issuer mismatch", status: 401 };
  return { email: claims.email || claims.sub, claims, mode: "access" };
}

/* ---------- Built-in sign-in ---------- */

export const builtinConfigured = (env) => typeof env.OPS_ADMIN_PASSWORD === "string" && env.OPS_ADMIN_PASSWORD.length > 0;

async function sessionKey(env) {
  // Derived from the password secret, so changing the password signs everyone out.
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("igl-ops-session:" + env.OPS_ADMIN_PASSWORD));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function constantTimeEqual(a, b) {
  const A = enc.encode(String(a)), B = enc.encode(String(b));
  let diff = A.length ^ B.length;
  for (let i = 0; i < Math.max(A.length, B.length); i++) diff |= (A[i] ?? 0) ^ (B[i] ?? 0);
  return diff === 0;
}

const clientIp = (request) => request.headers.get("cf-connecting-ip") || "local";

export function lockedOut(request) {
  const f = failures.get(clientIp(request));
  if (!f) return 0;
  if (f.until && f.until > Date.now()) return Math.ceil((f.until - Date.now()) / 60000);
  if (f.until && f.until <= Date.now()) failures.delete(clientIp(request));
  return 0;
}

export async function checkLogin(request, env, username, password) {
  const ip = clientIp(request);
  if (lockedOut(request)) return { ok: false, locked: true };
  const userOk = constantTimeEqual(username || "", env.OPS_ADMIN_USER || "admin");
  const passOk = constantTimeEqual(password || "", env.OPS_ADMIN_PASSWORD || "");
  if (userOk && passOk) { failures.delete(ip); return { ok: true, email: env.OPS_ADMIN_USER || "admin" }; }
  const f = failures.get(ip) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= MAX_FAILURES) { f.until = Date.now() + LOCK_MS; f.n = 0; }
  failures.set(ip, f);
  await new Promise((r) => setTimeout(r, 600));   // slow every failure down
  return { ok: false, locked: f.until > Date.now() };
}

export async function issueSession(env, user) {
  const payload = b64url(enc.encode(JSON.stringify({ u: user, exp: Date.now() + SESSION_HOURS * 3600 * 1000 })));
  const sig = b64url(await crypto.subtle.sign("HMAC", await sessionKey(env), enc.encode(payload)));
  return payload + "." + sig;
}

export const sessionCookie = (token) => `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

async function verifySession(request, env) {
  const tok = (request.headers.get("cookie") || "").match(new RegExp(SESSION_COOKIE + "=([^;]+)"))?.[1];
  if (!tok) return null;
  const [payload, sig] = tok.split(".");
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await sessionKey(env), Buffer.from(sig, "base64url"), enc.encode(payload));
    if (!ok) return null;
    const c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!c.exp || c.exp < Date.now()) return null;
    return { email: c.u, mode: "builtin" };
  } catch { return null; }
}

/* ---------- Entry point ---------- */

export async function requireAccess(request, env) {
  if (env.OPS_DEV === "1") return { email: "dev@localhost", dev: true, mode: "dev" };
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) return verifyAccess(request, env);
  if (builtinConfigured(env)) {
    const s = await verifySession(request, env);
    return s || { error: "Sign in to continue.", status: 401, signin: true };
  }
  return { error: "The console is not configured yet. Set OPS_ADMIN_PASSWORD as a Worker secret for the built-in sign-in, or ACCESS_TEAM_DOMAIN and ACCESS_AUD for Cloudflare Access.", status: 503 };
}
