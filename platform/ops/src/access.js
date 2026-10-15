/* Cloudflare Access verification. The console sits behind an Access
   application on ops.id-me.ai; Access adds a Cf-Access-Jwt-Assertion header
   (and a CF_Authorization cookie) that this code verifies against the team's
   published keys. Without ACCESS_TEAM_DOMAIN and ACCESS_AUD the Worker
   refuses to serve anything (fail closed); OPS_DEV=1 disables the check for
   local development only. */

const certCache = { at: 0, keys: null };

function b64urlToBuf(s) { return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"); }

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

export async function requireAccess(request, env) {
  if (env.OPS_DEV === "1") return { email: "dev@localhost", dev: true };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return { error: "Access is not configured (ACCESS_TEAM_DOMAIN, ACCESS_AUD)", status: 503 };
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
  return { email: claims.email || claims.sub, claims };
}
