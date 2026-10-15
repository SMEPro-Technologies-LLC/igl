/* Surfaces outside the public contract:

   POST /oauth2/token            client_credentials; client_id = API key id, client_secret = the key
   GET  /.well-known/jwks.json   the service signing key, for verifying tokens and receipts
   GET  /.well-known/igl.json    service metadata: environment, contract version, key id
   POST /sandbox/signup          sandbox only: creates a tenant and a sandbox key (rate limited)
   POST /admin/tenants           platform key only: create a tenant
   POST /admin/keys              platform key or igl.admin: issue a key for the tenant
   POST /admin/keys/revoke       platform key or igl.admin: revoke a key (its own tenant; platform may revoke any)
   POST /admin/webhooks          platform key or igl.admin: register a webhook for the tenant
   POST /admin/consents          platform key or igl.admin: grant or revoke a consent record
   POST /admin/obligations       platform key or igl.admin: create or attest an obligation
   GET  /admin/implemented       what this deployment serves, for the site generator */

import { E, readJson, validate, json, uuid, nowIso } from "./lib/http.js";
import { sha256, randomToken } from "./lib/crypto.js";
import { mintToken, newApiKey, SCOPES, rateLimit, authenticate } from "./lib/auth.js";
import { seedPurposes, newConsent } from "./lib/projection.js";
import { appendAudit } from "./lib/audit.js";
import { ROUTES, CONTRACT_VERSION } from "./routes.generated.js";

/* Every key acts as an identity. If none is bound, a system identity is
   created for the key so that every record it writes and every audit event
   it causes names a real identity in the graph. */
async function issueKey(db, env, { tenantId, scopes, label, identityId = null, jurisdiction = null }) {
  const secret = newApiKey(env);
  const id = "key_" + randomToken(12);
  if (!identityId) {
    identityId = uuid();
    await db.prepare("INSERT INTO identities (id, tenant_id, type, display_name, aliases, external_ids, attributes, status, sensitivity, provenance, created_at) VALUES (?1, ?2, 'system', ?3, '[]', ?4, ?5, 'active', 'internal', ?6, ?7)")
      .bind(identityId, tenantId, label ? `API client: ${label}` : `API client ${id}`, JSON.stringify({ clientId: id }), JSON.stringify({ kind: "api-client", scopes }), JSON.stringify({ createdAt: nowIso(), createdBy: { identityId, organizationId: null, roleIds: [] }, sources: [], model: null, workflowRunId: null, policyDecisionIds: [] }), nowIso()).run();
  }
  await db.prepare("INSERT INTO api_keys (id, tenant_id, key_hash, prefix, scopes, label, identity_id, jurisdiction, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', ?9)")
    .bind(id, tenantId, sha256(secret), secret.slice(0, 12), JSON.stringify(scopes), label ?? null, identityId, jurisdiction, nowIso()).run();
  return { id, secret, scopes, tenantId, identityId };
}

async function createTenant(db, env, { name, jurisdiction = "US", settings = {} }) {
  const id = uuid();
  await db.prepare("INSERT INTO tenants (id, name, environment, jurisdiction, settings, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(id, name, env.IGL_ENV || "production", jurisdiction, JSON.stringify(settings), nowIso()).run();
  await seedPurposes(db, id);
  return id;
}

async function platformOrAdmin(request, env, db, signer, url, { adminOk }) {
  const route = { scopes: adminOk ? ["igl.admin"] : ["igl.platform"], keyHeader: true };
  const p = await authenticate({ request, env, db, signer, route, url });
  const platform = p.scopes.includes("igl.platform");
  if (!platform && !adminOk) throw E.forbidden("A platform credential is required.", { code: "platform_required" });
  return p;
}

export async function adminFetch({ request, env, ctx, db, url, signer, requestId }) {
  const path = url.pathname; const method = request.method;

  if (method === "GET" && path === "/.well-known/jwks.json") return json({ keys: [signer.jwk()] }, 200, { "cache-control": "public, max-age=300" });
  if (method === "GET" && path === "/.well-known/igl.json") return json({ service: "igl-api", environment: env.IGL_ENV || "production", contract: CONTRACT_VERSION, version: env.SERVICE_VERSION || "1.4.0", signer: signer.id, publicKey: signer.pub(), tokenEndpoint: "/oauth2/token", operations: ROUTES.length }, 200, { "cache-control": "public, max-age=60" });

  if (method === "POST" && path === "/oauth2/token") {
    const ct = request.headers.get("content-type") || "";
    let params;
    if (/application\/x-www-form-urlencoded/i.test(ct)) params = Object.fromEntries(new URLSearchParams(await request.text()));
    else params = await readJson(request);
    let clientId = params.client_id, secret = params.client_secret;
    const basic = (request.headers.get("authorization") || "").match(/^Basic\s+(.+)$/i);
    if (basic) { const [u, p] = Buffer.from(basic[1], "base64").toString("utf8").split(":"); clientId = clientId || u; secret = secret || p; }
    if (params.grant_type !== "client_credentials") return oauthError("unsupported_grant_type", "Only client_credentials is supported at this endpoint.");
    if (!clientId || !secret) return oauthError("invalid_client", "client_id and client_secret are required.");
    const row = await db.prepare("SELECT * FROM api_keys WHERE id = ?1 AND status = 'active'").bind(clientId).first();
    if (!row || row.key_hash !== sha256(secret)) return oauthError("invalid_client", "Unknown client or wrong secret.", 401);
    const have = JSON.parse(row.scopes);
    const asked = params.scope ? String(params.scope).split(/[\s+]+/).filter(Boolean) : have;
    const granted = asked.filter((s) => have.includes(s));
    if (!granted.length) return oauthError("invalid_scope", "None of the requested scopes are granted to this client.");
    const { token, expiresIn } = mintToken(signer, { tenantId: row.tenant_id, keyId: row.id, scopes: granted, identityId: row.identity_id });
    return json({ access_token: token, token_type: "Bearer", expires_in: expiresIn, scope: granted.join(" ") }, 200, { "cache-control": "no-store", pragma: "no-cache" });
  }

  if (method === "POST" && path === "/sandbox/signup") {
    if ((env.IGL_ENV || "production") !== "sandbox") throw E.notFound("Self-serve signup exists only in the sandbox.");
    await rateLimit(db, env, "signup:" + (request.headers.get("cf-connecting-ip") || "unknown"), 20);
    const body = await readJson(request);
    validate(body, { required: ["organization", "email"], fields: { organization: { type: "string", maxLength: 200 }, email: { type: "string", maxLength: 254 }, jurisdiction: { type: "string", maxLength: 8 } } });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw E.unprocessable("email is not valid.", { code: "validation" });
    const tenantId = await createTenant(db, env, { name: body.organization, jurisdiction: body.jurisdiction || "US", settings: { contact: body.email, selfServe: true } });
    // the signup's own identity, so whoami works out of the box
    const identityId = uuid();
    await db.prepare("INSERT INTO identities (id, tenant_id, type, display_name, aliases, external_ids, attributes, status, sensitivity, provenance, created_at) VALUES (?1, ?2, 'person', ?3, '[]', ?4, ?5, 'active', 'internal', ?6, ?7)")
      .bind(identityId, tenantId, body.email.split("@")[0], JSON.stringify({ email: body.email }), JSON.stringify({ role: "developer", jurisdiction: body.jurisdiction || "US" }), JSON.stringify({ createdAt: nowIso(), createdBy: { identityId, organizationId: null, roleIds: [] }, sources: [], model: null, workflowRunId: null, policyDecisionIds: [] }), nowIso()).run();
    const c = newConsent(tenantId, identityId, "identity-introduction", { identityId, organizationId: null, roleIds: [] }, "self, at signup");
    await db.prepare("INSERT INTO consents (id, tenant_id, identity_id, purpose, granted_by, scope, jurisdictions, status, granted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, '[]', 'active', ?7)").bind(c.id, tenantId, identityId, c.purpose, JSON.stringify(c.grantedBy), c.scope, c.grantedAt).run();
    const key = await issueKey(db, env, { tenantId, scopes: SCOPES, label: "sandbox signup", identityId, jurisdiction: body.jurisdiction || "US" });
    await appendAudit(db, tenantId, { eventType: "tenant.created", actor: { identityId, organizationId: null, roleIds: [] }, resource: { type: "tenant", id: tenantId }, action: "tenant.create", requestId, details: { selfServe: true } });
    return json({ tenantId, identityId, apiKey: key.secret, clientId: key.id, scopes: key.scopes, baseUrl: `https://sandbox.id-me.ai/v1`, note: "Store the key now; it is not shown again. Send it as Authorization: Bearer and X-IGL-Tenant-Id: " + tenantId }, 201);
  }

  if (path.startsWith("/admin/")) {
    if (method !== "POST" && !(method === "GET" && path === "/admin/implemented")) throw E.notFound();
    if (method === "GET" && path === "/admin/implemented") {
      const live = ROUTES.map((r) => `${r.method} ${r.path}`);
      return json({ deployed: true, environment: env.IGL_ENV || "production", live: (env.IGL_ENV || "production") === "production" ? live : [], sandbox: (env.IGL_ENV || "production") === "sandbox" ? live : [] });
    }
    const body = await readJson(request);
    if (path === "/admin/bootstrap") {
      /* Creates the platform tenant and one igl.platform key. Requires the
         BOOTSTRAP_TOKEN secret in X-IGL-Bootstrap and refuses while an active
         platform key exists. After that key is revoked (POST /admin/keys/revoke)
         bootstrap may run again: it reuses the platform tenant and issues a new
         key, which is how the platform key is rotated. */
      if (!env.BOOTSTRAP_TOKEN || request.headers.get("x-igl-bootstrap") !== env.BOOTSTRAP_TOKEN) throw E.forbidden("Bootstrap token missing or wrong.", { code: "bootstrap_denied" });
      const existing = await db.prepare("SELECT id FROM api_keys WHERE scopes LIKE '%igl.platform%' AND status = 'active' LIMIT 1").first();
      if (existing) throw E.conflict("A platform key already exists; revoke it with POST /admin/keys/revoke before bootstrapping again.", { code: "already_bootstrapped" });
      const platformTenant = await db.prepare("SELECT id FROM tenants WHERE settings LIKE '%\"platform\":true%' ORDER BY created_at ASC LIMIT 1").first();
      const tenantId = platformTenant?.id || await createTenant(db, env, { name: body.name || "Smeprotech platform", jurisdiction: "US", settings: { platform: true } });
      const key = await issueKey(db, env, { tenantId, scopes: [...SCOPES, "igl.platform"], label: "platform bootstrap" });
      await appendAudit(db, tenantId, { eventType: "platform.bootstrapped", actor: { identityId: key.identityId, organizationId: null, roleIds: [] }, resource: { type: "tenant", id: tenantId }, action: "tenant.create", requestId, details: {} });
      return json({ tenantId, clientId: key.id, apiKey: key.secret, scopes: key.scopes }, 201);
    }
    if (path === "/admin/tenants") {
      await platformOrAdmin(request, env, db, signer, url, { adminOk: false });
      validate(body, { required: ["name"], fields: { name: { type: "string", maxLength: 200 }, jurisdiction: { type: "string" }, settings: { type: "object" } } });
      const tenantId = await createTenant(db, env, body);
      const key = await issueKey(db, env, { tenantId, scopes: SCOPES, label: "initial admin key" });
      await appendAudit(db, tenantId, { eventType: "tenant.created", actor: { identityId: key.identityId, organizationId: null, roleIds: [] }, resource: { type: "tenant", id: tenantId }, action: "tenant.create", requestId, details: { name: body.name } });
      return json({ tenantId, apiKey: key.secret, clientId: key.id, scopes: key.scopes }, 201);
    }
    if (path === "/admin/keys") {
      const p = await platformOrAdmin(request, env, db, signer, url, { adminOk: true });
      validate(body, { fields: { scopes: { type: "array" }, label: { type: "string" }, identityId: { type: "string", uuid: true }, jurisdiction: { type: "string" } } });
      const scopes = (body.scopes || SCOPES).filter((s) => SCOPES.includes(s));
      if (!scopes.length) throw E.unprocessable("scopes must include at least one of " + SCOPES.join(", "), { code: "validation" });
      const key = await issueKey(db, env, { tenantId: p.tenantId, scopes, label: body.label, identityId: body.identityId ?? null, jurisdiction: body.jurisdiction ?? null });
      await appendAudit(db, p.tenantId, { eventType: "key.issued", actor: p.actor, resource: { type: "api_key", id: key.id }, action: "key.issue", requestId, details: { scopes, label: body.label ?? null } });
      return json({ clientId: key.id, apiKey: key.secret, scopes, tenantId: p.tenantId }, 201);
    }
    if (path === "/admin/keys/revoke") {
      const p = await platformOrAdmin(request, env, db, signer, url, { adminOk: true });
      validate(body, { required: ["clientId"], fields: { clientId: { type: "string", maxLength: 64 } } });
      const key = await db.prepare("SELECT id, tenant_id, status, scopes FROM api_keys WHERE id = ?1").bind(body.clientId).first();
      if (!key) throw E.notFound("No key with that clientId.");
      if (key.tenant_id !== p.tenantId && !p.scopes.includes("igl.platform")) throw E.forbidden("That key belongs to another tenant.", { code: "tenant_mismatch" });
      if (key.status !== "active") return json({ clientId: key.id, status: key.status });
      await db.prepare("UPDATE api_keys SET status = 'revoked' WHERE id = ?1").bind(key.id).run();
      await appendAudit(db, key.tenant_id, { eventType: "key.revoked", actor: p.actor, resource: { type: "api_key", id: key.id }, action: "key.revoke", requestId, details: { self: key.id === p.keyId } });
      return json({ clientId: key.id, status: "revoked" });
    }
    if (path === "/admin/webhooks") {
      const p = await platformOrAdmin(request, env, db, signer, url, { adminOk: true });
      validate(body, { required: ["url", "events"], fields: { url: { type: "string", maxLength: 500 }, events: { type: "array" } } });
      if (!/^https:\/\//.test(body.url)) throw E.unprocessable("Webhook URLs must use https.", { code: "validation" });
      const id = uuid(); const secret = "whsec_" + randomToken(24);
      await db.prepare("INSERT INTO webhooks (id, tenant_id, url, events, secret, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6)").bind(id, p.tenantId, body.url, JSON.stringify(body.events), secret, nowIso()).run();
      await appendAudit(db, p.tenantId, { eventType: "webhook.registered", actor: p.actor, resource: { type: "webhook", id }, action: "webhook.create", requestId, details: { events: body.events } });
      return json({ id, url: body.url, events: body.events, secret }, 201);
    }
    if (path === "/admin/consents") {
      const p = await platformOrAdmin(request, env, db, signer, url, { adminOk: true });
      validate(body, { required: ["identityId", "purpose", "action"], fields: { identityId: { type: "string", uuid: true }, purpose: { type: "string" }, action: { type: "string", enum: ["grant", "revoke"] }, scope: { type: "string" }, jurisdictions: { type: "array" }, expiresAt: { type: "string", datetime: true } } });
      const idn = await db.prepare("SELECT id FROM identities WHERE tenant_id = ?1 AND id = ?2").bind(p.tenantId, body.identityId).first(); if (!idn) throw E.notFound();
      const pur = await db.prepare("SELECT id FROM purposes WHERE tenant_id = ?1 AND id = ?2").bind(p.tenantId, body.purpose).first(); if (!pur) throw E.unprocessable("Unknown purpose.", { code: "unknown_purpose" });
      if (body.action === "revoke") {
        await db.prepare("UPDATE consents SET status = 'revoked' WHERE tenant_id = ?1 AND identity_id = ?2 AND purpose = ?3 AND status = 'active'").bind(p.tenantId, body.identityId, body.purpose).run();
        await appendAudit(db, p.tenantId, { eventType: "consent.revoked", actor: p.actor, resource: { type: "identity", id: body.identityId }, action: "consent.revoke", requestId, details: { purpose: body.purpose } });
        return json({ identityId: body.identityId, purpose: body.purpose, status: "revoked" });
      }
      const c = newConsent(p.tenantId, body.identityId, body.purpose, p.actor, body.scope || "granted by administrator");
      await db.prepare("INSERT INTO consents (id, tenant_id, identity_id, purpose, granted_by, scope, jurisdictions, status, granted_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', ?8, ?9)").bind(c.id, p.tenantId, c.identityId, c.purpose, JSON.stringify(c.grantedBy), c.scope, JSON.stringify(body.jurisdictions || []), c.grantedAt, body.expiresAt ?? null).run();
      await appendAudit(db, p.tenantId, { eventType: "consent.granted", actor: p.actor, resource: { type: "identity", id: body.identityId }, action: "consent.grant", requestId, details: { purpose: body.purpose, consentId: c.id } });
      return json({ ...c, jurisdictions: body.jurisdictions || [], expiresAt: body.expiresAt ?? null }, 201);
    }
    if (path === "/admin/obligations") {
      const p = await platformOrAdmin(request, env, db, signer, url, { adminOk: true });
      validate(body, { required: ["subjectId", "title", "dueDate"], fields: { subjectId: { type: "string", uuid: true }, title: { type: "string", maxLength: 300 }, obligee: { type: "string" }, facilityId: { type: "string", uuid: true }, regulation: { type: "string" }, dueDate: { type: "string" }, attest: { type: "boolean" }, evidenceIds: { type: "array" } } });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) throw E.unprocessable("dueDate must be YYYY-MM-DD.", { code: "validation" });
      const idn = await db.prepare("SELECT id FROM identities WHERE tenant_id = ?1 AND id = ?2").bind(p.tenantId, body.subjectId).first(); if (!idn) throw E.notFound();
      const id = uuid(); const attested = body.attest === true;
      await db.prepare("INSERT INTO obligations (id, tenant_id, subject_id, title, obligee, facility_id, regulation, due_date, status, attested_by, attested_at, evidence_ids, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)")
        .bind(id, p.tenantId, body.subjectId, body.title, body.obligee ?? null, body.facilityId ?? null, body.regulation ?? null, body.dueDate, attested ? "attested" : "proposed", attested ? JSON.stringify(p.actor) : null, attested ? nowIso() : null, JSON.stringify(body.evidenceIds || []), nowIso()).run();
      await appendAudit(db, p.tenantId, { eventType: attested ? "obligation.attested" : "obligation.proposed", actor: p.actor, resource: { type: "obligation", id }, action: "obligation.write", requestId, details: { subjectId: body.subjectId, dueDate: body.dueDate } });
      return json({ id, subjectId: body.subjectId, title: body.title, obligee: body.obligee ?? null, facilityId: body.facilityId ?? null, regulation: body.regulation ?? null, dueDate: body.dueDate, status: attested ? "attested" : "proposed", attestedBy: attested ? p.actor : null, attestedAt: attested ? nowIso() : null, evidenceIds: body.evidenceIds || [] }, 201);
    }
    throw E.notFound();
  }
  return null;
}

function oauthError(error, description, status = 400) {
  return json({ error, error_description: description }, status, { "cache-control": "no-store" });
}
