/* Authentication and tenancy.

   Credentials:
     Authorization: Bearer igl_live_…  or  igl_test_…    an API key, hashed in api_keys
     Authorization: Bearer <JWT>                         an access token from POST /oauth2/token (EdDSA, 1 hour)
     X-IGL-API-Key: igl_…                                the same API key, on operations the contract lists apiKey for
   A credential in the query string is ignored.

   Every key belongs to one tenant. X-IGL-Tenant-Id must name that tenant;
   a key whose scopes include igl.platform may act in any tenant of its
   environment (that is how Smeprotech administers production). */

import { sha256, safeEqual, randomToken } from "./crypto.js";
import { E, nowIso, uuid } from "./http.js";

export const SCOPES = ["igl.read", "igl.write", "igl.execute", "igl.admin"];
const KEY_RE = /^igl_(live|test)_[A-Za-z0-9_-]{24,}$/;

export function keyPrefix(env) { return env.IGL_ENV === "sandbox" ? "igl_test_" : "igl_live_"; }
export function newApiKey(env) { return keyPrefix(env) + randomToken(27); }

function b64url(s) { return Buffer.from(s).toString("base64url"); }
function b64urlJson(o) { return b64url(JSON.stringify(o)); }

export function mintToken(signer, { tenantId, keyId, scopes, identityId = null, ttlSec = 3600 }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "EdDSA", typ: "JWT", kid: signer.id };
  const claims = { iss: "https://auth.id-me.ai", sub: keyId, tid: tenantId, scope: scopes.join(" "), iat: now, exp: now + ttlSec, jti: uuid(), ...(identityId ? { identity: identityId } : {}) };
  const signingInput = b64urlJson(header) + "." + b64urlJson(claims);
  const sig = signer.signRaw(Buffer.from(signingInput, "utf8")).toString("base64url");
  return { token: signingInput + "." + sig, expiresIn: ttlSec, claims };
}

export function verifyToken(signer, token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, c, s] = parts;
  let header, claims;
  try { header = JSON.parse(Buffer.from(h, "base64url").toString("utf8")); claims = JSON.parse(Buffer.from(c, "base64url").toString("utf8")); } catch { return null; }
  if (header.alg !== "EdDSA") return null;
  if (!signer.verifyRaw(Buffer.from(h + "." + c, "utf8"), Buffer.from(s, "base64url"))) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp < now) return null;
  return claims;
}

export function credentialFrom(request, { allowApiKeyHeader }) {
  const auth = request.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return { kind: KEY_RE.test(m[1].trim()) ? "key" : "token", value: m[1].trim() };
  const k = request.headers.get("x-igl-api-key");
  if (k && allowApiKeyHeader) return { kind: "key", value: k.trim() };
  if (k && !allowApiKeyHeader) return { kind: "key-not-allowed", value: null };
  return null;
}

export async function authenticate({ request, env, db, signer, route, url }) {
  const tenantHeader = request.headers.get("x-igl-tenant-id");
  const cred = credentialFrom(request, { allowApiKeyHeader: route.apiKey });
  if (!cred) throw E.unauthorized();
  if (cred.kind === "key-not-allowed") throw E.unauthorized("This operation does not accept X-IGL-API-Key; use an OAuth 2.0 bearer token.");

  let principal;
  if (cred.kind === "key") {
    if (!KEY_RE.test(cred.value)) throw E.unauthorized("Malformed API key.");
    const row = await db.prepare("SELECT k.*, t.environment, t.settings AS tenant_settings, t.jurisdiction AS tenant_jurisdiction FROM api_keys k JOIN tenants t ON t.id = k.tenant_id WHERE k.key_hash = ?1 AND k.status = 'active'").bind(sha256(cred.value)).first();
    if (!row) throw E.unauthorized("Unknown or revoked API key.");
    if (!safeEqual(row.key_hash, sha256(cred.value))) throw E.unauthorized();
    const envPrefix = keyPrefix(env);
    if (!cred.value.startsWith(envPrefix)) throw E.unauthorized(`This key belongs to the ${cred.value.startsWith("igl_test_") ? "sandbox" : "production"} environment.`);
    principal = { keyId: row.id, tenantId: row.tenant_id, scopes: JSON.parse(row.scopes), identityId: row.identity_id, jurisdiction: row.jurisdiction, via: "key", tenantSettings: JSON.parse(row.tenant_settings || "{}"), tenantJurisdiction: row.tenant_jurisdiction };
    db.prepare("UPDATE api_keys SET last_used_at = ?1 WHERE id = ?2").bind(nowIso(), row.id).run().catch(() => {});
  } else {
    const claims = verifyToken(signer, cred.value);
    if (!claims) throw E.unauthorized("Invalid or expired access token.");
    const key = await db.prepare("SELECT k.status, k.identity_id, k.jurisdiction, t.settings AS tenant_settings, t.jurisdiction AS tenant_jurisdiction FROM api_keys k JOIN tenants t ON t.id = k.tenant_id WHERE k.id = ?1").bind(claims.sub).first();
    if (!key || key.status !== "active") throw E.unauthorized("The client behind this token is revoked.");
    principal = { keyId: claims.sub, tenantId: claims.tid, scopes: claims.scope.split(" ").filter(Boolean), identityId: claims.identity || key.identity_id, jurisdiction: key.jurisdiction, via: "token", tenantSettings: JSON.parse(key.tenant_settings || "{}"), tenantJurisdiction: key.tenant_jurisdiction };
  }

  // scope check
  const need = route.scopes || [];
  const platform = principal.scopes.includes("igl.platform");
  if (need.length && !platform && !need.some((s) => principal.scopes.includes(s)))
    throw E.forbidden(`This operation requires scope ${need.join(" or ")}.`, { code: "insufficient_scope" });

  // tenancy
  if (!tenantHeader) throw E.badRequest("X-IGL-Tenant-Id is required.", { code: "tenant_required" });
  if (tenantHeader !== principal.tenantId) {
    if (!platform) throw E.forbidden("The credential does not belong to tenant " + tenantHeader + ".", { code: "tenant_mismatch" });
    const t = await db.prepare("SELECT id, settings, jurisdiction FROM tenants WHERE id = ?1 AND environment = ?2").bind(tenantHeader, env.IGL_ENV || "production").first();
    if (!t) throw E.notFound("No such tenant in this environment.");
    principal.tenantSettings = JSON.parse(t.settings || "{}"); principal.tenantJurisdiction = t.jurisdiction;
  }
  principal.tenantId = tenantHeader;
  if (!principal.identityId) throw E.unauthorized("This key is not bound to an identity; reissue it.");
  principal.actor = { identityId: principal.identityId, organizationId: null, roleIds: [] };
  return principal;
}

/* Token bucket in D1, per key: capacity and refill from env. Coarse, but it
   is per-key and survives isolates. */
export async function rateLimit(db, env, bucketKey, cost = 1) {
  const capacity = Number(env.RATE_BURST || 120), refill = Number(env.RATE_PER_SEC || 2);
  const now = Date.now();
  const row = await db.prepare("SELECT tokens, updated_at FROM rate_limits WHERE bucket = ?1").bind(bucketKey).first();
  let tokens = capacity;
  if (row) tokens = Math.min(capacity, row.tokens + ((now - row.updated_at) / 1000) * refill);
  if (tokens < cost) throw E.tooMany(Math.ceil((cost - tokens) / refill));
  tokens -= cost;
  await db.prepare("INSERT INTO rate_limits (bucket, tokens, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(bucket) DO UPDATE SET tokens = ?2, updated_at = ?3").bind(bucketKey, tokens, now).run();
}
