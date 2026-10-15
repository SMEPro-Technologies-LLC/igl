/* One handler per contract operation, keyed by operationId.

   Each handler receives { request, env, ctx, db, url, params, principal,
   body, requestId, signer } and returns { status, body, headers? }.
   Validation is explicit per operation; shapes follow spec/openapi.yaml. */

import { E, validate, pageParams, cursorWhere, pageOut, parseJson, nowIso, uuid, UUID_RE } from "./lib/http.js";
import { appendAudit, rowToEvent, storeDecision, issueReceipt } from "./lib/audit.js";
import { evaluate, activePolicies, rowToPolicy } from "./lib/policy.js";
import { project, rowToIdentity, rowToRelationship, rowToObligation, rowToConsent, rowToPurpose, newConsent, typeToNode } from "./lib/projection.js";
import { runIntelligence, rowToFact, rowToEvidence } from "./lib/intelligence.js";
import { emit } from "./lib/webhooks.js";
import { CONTRACT_VERSION } from "./routes.generated.js";
import { canonical, sha256 } from "./lib/crypto.js";

const IDENTITY_TYPES = ["person", "organization", "system", "agent", "asset", "place", "document", "program", "course", "product", "other"];
const SOURCE_TYPES = ["document", "database", "api", "web", "email", "transcript", "human", "system", "other"];

function provenance(principal, sources = [], extra = {}) {
  return { createdAt: nowIso(), createdBy: principal.actor, sources, model: null, workflowRunId: null, policyDecisionIds: [], ...extra };
}
function checkSources(sources, field = "sources") {
  if (sources === undefined) return [];
  if (!Array.isArray(sources)) throw E.unprocessable(`${field} must be an array.`, { code: "validation" });
  sources.forEach((s, i) => validate(s, { required: ["sourceId", "sourceType"], fields: { sourceId: { type: "string" }, sourceType: { type: "string", enum: SOURCE_TYPES }, uri: { type: "string" }, title: { type: "string" }, retrievedAt: { type: "string", datetime: true }, contentHash: { type: "string" }, locator: { type: "string" } } }, `${field}[${i}]`));
  return sources;
}
function checkActor(a, field = "actor") {
  if (a === undefined || a === null) return null;
  validate(a, { required: ["identityId"], fields: { identityId: { type: "string", uuid: true }, organizationId: { type: "string", uuid: true }, roleIds: { type: "array" } } }, field);
  for (const r of a.roleIds || []) if (!UUID_RE.test(String(r))) throw E.unprocessable(`${field}.roleIds must contain UUIDs.`, { code: "validation", violations: [{ field: `${field}.roleIds`, code: "format", message: "role ids are UUIDs" }] });
  return { identityId: a.identityId, organizationId: a.organizationId ?? null, roleIds: a.roleIds || [] };
}
async function getIdentity(db, tenantId, id) {
  if (!UUID_RE.test(id)) throw E.notFound();
  const row = await db.prepare("SELECT * FROM identities WHERE tenant_id = ?1 AND id = ?2").bind(tenantId, id).first();
  if (!row) throw E.notFound();
  return rowToIdentity(row);
}
async function getPurpose(db, tenantId, purposeId) {
  const row = await db.prepare("SELECT * FROM purposes WHERE tenant_id = ?1 AND id = ?2").bind(tenantId, purposeId).first();
  if (!row) throw E.unprocessable(`Unknown purpose ${purposeId}. GET /purposes lists the profiles this tenant has.`, { code: "unknown_purpose" });
  return rowToPurpose(row);
}
async function decide(db, signer, tenantId, principal, action, resource, context = {}) {
  const policies = await activePolicies(db, tenantId);
  const decision = evaluate(policies, { actor: principal.actor, action, resource, context: { ...context, jurisdiction: principal.jurisdiction || principal.tenantJurisdiction } });
  await storeDecision(db, tenantId, decision);
  return { decision, policies };
}
function projectionResponse(identity, purpose, p, receipt) {
  return { identityId: identity.id, purpose: purpose.id, nodes: p.admitted, edges: p.edges, truncated: p.truncated, emptyWarning: p.emptyWarning, withheld: p.withheld, governance: receipt, createdAt: nowIso() };
}
async function serveProjection(h, identity, { explain = false } = {}) {
  const { db, url, principal, signer, requestId } = h;
  const purposeId = url.searchParams.get("purpose");
  if (!purposeId) throw E.unprocessable("purpose is required.", { code: "validation", violations: [{ field: "purpose", code: "required", message: "purpose is required" }] });
  const purpose = await getPurpose(db, principal.tenantId, purposeId);
  const nodeBudget = Math.min(Math.max(Number(url.searchParams.get("nodeBudget") || principal.tenantSettings.nodeBudget || 50), 1), 500);
  const maxDepth = Math.min(Math.max(Number(url.searchParams.get("maxDepth") || 1), 0), 4);
  const { decision, policies } = await decide(db, signer, principal.tenantId, principal, "projection.read", { type: "identity", id: identity.id }, { purpose: purpose.id });
  if (decision.effect === "deny") throw E.forbidden("A policy denies projecting this identity for this purpose.", { code: "policy_denied" });
  const p = await project(db, principal.tenantId, { identity, purpose, principal, nodeBudget, maxDepth, explain });
  if (explain) return { status: 200, body: { identityId: identity.id, purpose: purpose.id, considered: p.considered, truncated: p.truncated } };
  const receipt = await issueReceipt(db, signer, principal.tenantId, { actor: principal.actor, authorityDecision: decision, policiesEvaluated: policies.map((x) => x.id), evidenceIds: [], output: p.admitted });
  await appendAudit(db, principal.tenantId, { eventType: "projection.served", actor: principal.actor, resource: { type: "identity", id: identity.id }, action: "projection.read", requestId, decisionId: decision.decisionId, details: { purpose: purpose.id, admitted: p.admitted.length, withheld: p.withheld, truncated: p.truncated, receiptId: receipt.receiptId } });
  return { status: 200, body: projectionResponse(identity, purpose, p, receipt) };
}

export const handlers = {
  /* ---------------- System ---------------- */
  async getHealth({ env }) {
    return { status: 200, body: { status: "ok", version: env.SERVICE_VERSION || "1.4.0", time: nowIso() }, headers: { "cache-control": "no-store" } };
  },
  async getCapabilities({ env }) {
    return { status: 200, body: { apiVersion: CONTRACT_VERSION, features: ["identities", "projections", "purposes", "consents", "obligations", "authority", "knowledge", "policies", "evidence", "outcomes", "graph", "intelligence", "agents", "workflows", "audit", "receipts", "webhooks", "idempotency"], modelProviders: env.ANTHROPIC_API_KEY ? ["anthropic"] : [], maximumGraphHops: 12 } };
  },

  /* ---------------- Identity ---------------- */
  async listIdentities({ db, url, principal }) {
    const { limit, cursor } = pageParams(url);
    const q = url.searchParams.get("q"); const type = url.searchParams.get("type");
    if (type && !IDENTITY_TYPES.includes(type)) throw E.badRequest("type is not a valid IdentityType.");
    const c = cursorWhere(cursor);
    const params = [principal.tenantId];
    let sql = "SELECT * FROM identities WHERE tenant_id = ?";
    if (q) { sql += " AND (display_name LIKE ? OR aliases LIKE ?)"; params.push(`%${q}%`, `%${q}%`); }
    if (type) { sql += " AND type = ?"; params.push(type); }
    sql += c.clause; params.push(...c.params);
    sql += " ORDER BY created_at DESC, id DESC LIMIT ?"; params.push(limit + 1);
    const { results } = await db.prepare(sql).bind(...params).all();
    return { status: 200, body: pageOut(results, limit, rowToIdentity) };
  },
  async createIdentity(h) {
    const { db, principal, body, requestId, ctx } = h;
    validate(body, { required: ["type", "displayName"], fields: { type: { type: "string", enum: IDENTITY_TYPES }, displayName: { type: "string", maxLength: 300 }, aliases: { type: "array" }, externalIds: { type: "object" }, attributes: { type: "object" }, source: { type: "object" } } });
    const sources = body.source ? checkSources([body.source], "source") : [];
    const id = uuid(); const now = nowIso();
    const prov = provenance(principal, sources);
    await db.prepare("INSERT INTO identities (id, tenant_id, type, display_name, aliases, external_ids, attributes, status, confidence, sensitivity, schema_type, summary, provenance, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', ?8, ?9, ?10, ?11, ?12, ?13)")
      .bind(id, principal.tenantId, body.type, body.displayName, JSON.stringify(body.aliases || []), JSON.stringify(body.externalIds || {}), JSON.stringify(body.attributes || {}), typeof body.confidence === "number" ? body.confidence : null, body.attributes?.sensitivity?.self || "internal", body.schemaType || null, body.summary ?? null, JSON.stringify(prov), now).run();
    // default consents: the tenant's defaultConsentPurposes (identity-introduction unless changed)
    const defaults = principal.tenantSettings.defaultConsentPurposes || ["identity-introduction"];
    if (body.type === "person" || body.type === "organization") {
      for (const p of defaults) { const c = newConsent(principal.tenantId, id, p, principal.actor, "default-on-create"); await db.prepare("INSERT INTO consents (id, tenant_id, identity_id, purpose, granted_by, scope, jurisdictions, status, granted_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, '[]', 'active', ?7, NULL)").bind(c.id, principal.tenantId, id, p, JSON.stringify(principal.actor), c.scope, c.grantedAt).run(); }
    }
    await appendAudit(db, principal.tenantId, { eventType: "identity.created", actor: principal.actor, resource: { type: "identity", id }, action: "identity.create", requestId, details: { type: body.type } });
    const identity = await getIdentity(db, principal.tenantId, id);
    await emit(db, ctx, principal.tenantId, "graphUpdated", { eventType: "identity.created", resource: { type: "identity", id }, occurredAt: now });
    return { status: 201, body: identity, headers: { location: `/v1/identities/${id}` } };
  },
  async whoami(h) {
    const { db, principal } = h;
    if (!principal.identityId) throw E.unprocessable("This credential is not bound to an identity. Bind one when the key is issued, or call GET /identities/{id}/projection.", { code: "no_bound_identity" });
    const identity = await getIdentity(db, principal.tenantId, principal.identityId);
    return serveProjection(h, identity);
  },
  async getIdentity({ db, principal, params }) {
    return { status: 200, body: await getIdentity(db, principal.tenantId, params.identityId) };
  },
  async updateIdentity(h) {
    const { db, principal, params, body, requestId, ctx } = h;
    const cur = await getIdentity(db, principal.tenantId, params.identityId);
    validate(body, { fields: { displayName: { type: "string", maxLength: 300 }, aliases: { type: "array" }, externalIds: { type: "object" }, attributes: { type: "object" }, status: { type: "string", enum: ["active", "inactive", "restricted"] }, confidence: { type: "number", min: 0, max: 1 } } });
    const next = { displayName: body.displayName ?? cur.displayName, aliases: body.aliases ?? cur.aliases, externalIds: { ...cur.externalIds, ...(body.externalIds || {}) }, attributes: { ...cur.attributes, ...(body.attributes || {}) }, status: body.status ?? cur.status, confidence: body.confidence ?? cur.confidence ?? null };
    await db.prepare("UPDATE identities SET display_name = ?1, aliases = ?2, external_ids = ?3, attributes = ?4, status = ?5, confidence = ?6, updated_at = ?7 WHERE tenant_id = ?8 AND id = ?9")
      .bind(next.displayName, JSON.stringify(next.aliases), JSON.stringify(next.externalIds), JSON.stringify(next.attributes), next.status, next.confidence, nowIso(), principal.tenantId, cur.id).run();
    await appendAudit(db, principal.tenantId, { eventType: "identity.updated", actor: principal.actor, resource: { type: "identity", id: cur.id }, action: "identity.update", requestId, details: { fields: Object.keys(body) } });
    await emit(db, ctx, principal.tenantId, "graphUpdated", { eventType: "identity.updated", resource: { type: "identity", id: cur.id }, occurredAt: nowIso() });
    return { status: 200, body: await getIdentity(db, principal.tenantId, cur.id) };
  },
  async appendIdentityContext(h) {
    const { db, principal, params, body, requestId } = h;
    const cur = await getIdentity(db, principal.tenantId, params.identityId);
    validate(body, { required: ["kind", "value"], fields: { kind: { type: "string", enum: ["interest", "goal", "project", "relationship", "expertise", "preference", "constraint", "observation", "other"] }, confidence: { type: "number", min: 0, max: 1 }, source: { type: "object" } } });
    const sources = body.source ? checkSources([body.source], "source") : [];
    const row = await db.prepare("SELECT context FROM identities WHERE tenant_id = ?1 AND id = ?2").bind(principal.tenantId, cur.id).first();
    const context = parseJson(row.context, []);
    context.push({ id: uuid(), kind: body.kind, value: body.value, confidence: body.confidence ?? null, sources, recordedAt: nowIso(), recordedBy: principal.actor });
    await db.prepare("UPDATE identities SET context = ?1, updated_at = ?2 WHERE tenant_id = ?3 AND id = ?4").bind(JSON.stringify(context), nowIso(), principal.tenantId, cur.id).run();
    await appendAudit(db, principal.tenantId, { eventType: "identity.context_appended", actor: principal.actor, resource: { type: "identity", id: cur.id }, action: "identity.update", requestId, details: { kind: body.kind } });
    const out = await getIdentity(db, principal.tenantId, cur.id);
    out.attributes = { ...out.attributes, contextCount: context.length };
    return { status: 200, body: out };
  },
  async listIdentityRelationships({ db, url, principal, params }) {
    await getIdentity(db, principal.tenantId, params.identityId);
    const { limit, cursor } = pageParams(url); const type = url.searchParams.get("type");
    const c = cursorWhere(cursor);
    const p = [principal.tenantId, params.identityId, params.identityId];
    let sql = "SELECT * FROM relationships WHERE tenant_id = ? AND (from_id = ? OR to_id = ?)";
    if (type) { sql += " AND type = ?"; p.push(type); }
    sql += c.clause; p.push(...c.params); sql += " ORDER BY created_at DESC, id DESC LIMIT ?"; p.push(limit + 1);
    const { results } = await db.prepare(sql).bind(...p).all();
    return { status: 200, body: pageOut(results, limit, rowToRelationship) };
  },

  /* ---------------- Projection ---------------- */
  async listPurposes({ db, principal }) {
    const { results } = await db.prepare("SELECT * FROM purposes WHERE tenant_id = ?1 ORDER BY is_default DESC, id ASC").bind(principal.tenantId).all();
    return { status: 200, body: { items: results.map(rowToPurpose), page: { nextCursor: null, hasMore: false } } };
  },
  async getPurpose({ db, principal, params }) {
    const row = await db.prepare("SELECT * FROM purposes WHERE tenant_id = ?1 AND id = ?2").bind(principal.tenantId, params.purposeId).first();
    if (!row) throw E.notFound();
    return { status: 200, body: rowToPurpose(row) };
  },
  async getIdentityProjection(h) { return serveProjection(h, await getIdentity(h.db, h.principal.tenantId, h.params.identityId)); },
  async explainIdentityProjection(h) { return serveProjection(h, await getIdentity(h.db, h.principal.tenantId, h.params.identityId), { explain: true }); },
  async listObligations(h) {
    const { db, url, principal, params } = h;
    const identity = await getIdentity(db, principal.tenantId, params.identityId);
    const purposeId = url.searchParams.get("purpose");
    if (!purposeId) throw E.unprocessable("purpose is required.", { code: "validation" });
    const purpose = await getPurpose(db, principal.tenantId, purposeId);
    if (!purpose.permits.includes("Obligation")) throw E.forbidden(`Purpose ${purpose.id} does not permit Obligation nodes.`, { code: "purpose_denies_node_type" });
    const consent = await db.prepare("SELECT id FROM consents WHERE tenant_id = ?1 AND identity_id = ?2 AND purpose = ?3 AND status = 'active' LIMIT 1").bind(principal.tenantId, identity.id, purpose.id).first();
    if (!consent) throw E.forbidden(`No active consent record covers purpose ${purpose.id} for this identity.`, { code: "no_consent" });
    const { limit, cursor } = pageParams(url); const status = url.searchParams.get("status"); const dueBefore = url.searchParams.get("dueBefore");
    const p = [principal.tenantId, identity.id];
    let sql = "SELECT * FROM obligations WHERE tenant_id = ? AND subject_id = ?";
    if (status) { if (!["attested", "proposed"].includes(status)) throw E.badRequest("status must be attested or proposed."); sql += " AND status = ?"; p.push(status); }
    if (dueBefore) { sql += " AND due_date <= ?"; p.push(dueBefore); }
    const c = cursorWhere(cursor, "due_date"); sql += c.clause.replace(/</g, ">"); p.push(...c.params);
    sql += " ORDER BY due_date ASC, id ASC LIMIT ?"; p.push(limit + 1);
    const { results } = await db.prepare(sql).bind(...p).all();
    return { status: 200, body: pageOut(results, limit, rowToObligation, "due_date") };
  },
  async listConsents({ db, url, principal, params }) {
    const identity = await getIdentity(db, principal.tenantId, params.identityId);
    const { limit, cursor } = pageParams(url); const c = cursorWhere(cursor, "granted_at");
    const { results } = await db.prepare(`SELECT * FROM consents WHERE tenant_id = ? AND identity_id = ?${c.clause} ORDER BY granted_at DESC, id DESC LIMIT ?`).bind(principal.tenantId, identity.id, ...c.params, limit + 1).all();
    return { status: 200, body: pageOut(results, limit, rowToConsent, "granted_at") };
  },

  /* ---------------- Authority and policy ---------------- */
  async evaluateAuthority({ db, principal, body, requestId, signer }) {
    validate(body, { required: ["actor", "action", "resource"], fields: { action: { type: "string" }, context: { type: "object" } } });
    const actor = checkActor(body.actor); validate(body.resource, { required: ["type", "id"], fields: { type: { type: "string" }, id: { type: "string" } } }, "resource");
    const policies = await activePolicies(db, principal.tenantId);
    const decision = evaluate(policies, { actor, action: body.action, resource: body.resource, context: { ...(body.context || {}), jurisdiction: body.context?.jurisdiction || principal.jurisdiction || principal.tenantJurisdiction } });
    await storeDecision(db, principal.tenantId, decision);
    await appendAudit(db, principal.tenantId, { eventType: "authority.evaluated", actor, resource: body.resource, action: body.action, requestId, decisionId: decision.decisionId, details: { effect: decision.effect, reasonCodes: decision.reasonCodes } });
    return { status: 200, body: decision };
  },
  async createPolicy({ db, principal, body, requestId }) {
    validate(body, { required: ["name", "version", "effect", "rule"], fields: { name: { type: "string", maxLength: 200 }, version: { type: "string" }, description: { type: "string" }, effect: { type: "string", enum: ["allow", "deny", "conditional", "escalate"] }, status: { type: "string", enum: ["draft", "active"] }, scope: { type: "object" }, rule: { type: "object" }, effectiveFrom: { type: "string", datetime: true }, effectiveTo: { type: "string", datetime: true } } });
    const id = uuid(); const now = nowIso();
    await db.prepare("INSERT INTO policies (id, tenant_id, name, version, description, effect, status, scope, rule, effective_from, effective_to, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)")
      .bind(id, principal.tenantId, body.name, body.version, body.description ?? null, body.effect, body.status || "draft", JSON.stringify(body.scope || {}), JSON.stringify(body.rule), body.effectiveFrom ?? null, body.effectiveTo ?? null, now).run();
    await appendAudit(db, principal.tenantId, { eventType: "policy.created", actor: principal.actor, resource: { type: "policy", id }, action: "policy.create", requestId, details: { name: body.name, version: body.version, effect: body.effect, status: body.status || "draft" } });
    const row = await db.prepare("SELECT * FROM policies WHERE id = ?1").bind(id).first();
    return { status: 201, body: rowToPolicy(row), headers: { location: `/v1/policies/${id}` } };
  },
  async getPolicy({ db, principal, params }) {
    const row = await db.prepare("SELECT * FROM policies WHERE tenant_id = ?1 AND id = ?2").bind(principal.tenantId, params.policyId).first();
    if (!row) throw E.notFound();
    return { status: 200, body: rowToPolicy(row) };
  },
  async evaluatePolicies({ db, principal, body, requestId }) {
    validate(body, { required: ["actor", "action", "resource"], fields: { action: { type: "string" }, facts: { type: "object" }, requestedOutcome: { type: "string" } } });
    const actor = checkActor(body.actor); validate(body.resource, { required: ["type", "id"], fields: { type: { type: "string" }, id: { type: "string" } } }, "resource");
    const policies = await activePolicies(db, principal.tenantId);
    const decision = evaluate(policies, { actor, action: body.action, resource: body.resource, facts: body.facts || {}, context: { requestedOutcome: body.requestedOutcome ?? null, jurisdiction: principal.jurisdiction || principal.tenantJurisdiction } });
    await storeDecision(db, principal.tenantId, decision);
    await appendAudit(db, principal.tenantId, { eventType: "policy.evaluated", actor, resource: body.resource, action: body.action, requestId, decisionId: decision.decisionId, details: { effect: decision.effect, policies: decision.policyDecisionIds } });
    return { status: 200, body: decision };
  },

  /* ---------------- Knowledge ---------------- */
  async createKnowledgeEntity(h) {
    validate(h.body, { required: ["schemaType"], fields: { schemaType: { type: "string" }, summary: { type: "string" } } });
    return handlers.createIdentity(h);
  },
  async getKnowledgeEntity({ db, principal, params }) {
    const row = await db.prepare("SELECT * FROM identities WHERE tenant_id = ?1 AND id = ?2 AND schema_type IS NOT NULL").bind(principal.tenantId, params.entityId).first();
    if (!row) throw E.notFound();
    return { status: 200, body: rowToIdentity(row) };
  },
  async listFacts({ db, url, principal }) {
    const { limit, cursor } = pageParams(url); const c = cursorWhere(cursor);
    const p = [principal.tenantId]; let sql = "SELECT * FROM facts WHERE tenant_id = ?";
    for (const [k, col] of [["subjectId", "subject_id"], ["predicate", "predicate"], ["status", "status"]]) { const v = url.searchParams.get(k); if (v) { sql += ` AND ${col} = ?`; p.push(v); } }
    sql += c.clause; p.push(...c.params); sql += " ORDER BY created_at DESC, id DESC LIMIT ?"; p.push(limit + 1);
    const { results } = await db.prepare(sql).bind(...p).all();
    return { status: 200, body: pageOut(results, limit, rowToFact) };
  },
  async createFact({ db, principal, body, requestId, ctx }) {
    validate(body, { required: ["subjectId", "predicate", "object"], fields: { subjectId: { type: "string", uuid: true }, predicate: { type: "string", maxLength: 200 }, qualifiers: { type: "object" }, status: { type: "string", enum: ["seed", "proposed", "certified"] }, confidence: { type: "number", min: 0, max: 1 }, validFrom: { type: "string", datetime: true }, validTo: { type: "string", datetime: true } } });
    await getIdentity(db, principal.tenantId, body.subjectId);
    const sources = checkSources(body.sources);
    if (body.status === "certified" && !principal.scopes.some((s) => ["igl.admin", "igl.platform"].includes(s))) throw E.forbidden("Only igl.admin may create a fact as certified; create it as proposed and certify through governance.", { code: "certification_requires_admin" });
    const id = uuid(); const now = nowIso();
    await db.prepare("INSERT INTO facts (id, tenant_id, subject_id, predicate, object, qualifiers, status, confidence, valid_from, valid_to, provenance, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)")
      .bind(id, principal.tenantId, body.subjectId, body.predicate, JSON.stringify(body.object), JSON.stringify(body.qualifiers || {}), body.status || "seed", body.confidence ?? 0.5, body.validFrom ?? null, body.validTo ?? null, JSON.stringify(provenance(principal, sources)), now).run();
    await appendAudit(db, principal.tenantId, { eventType: "fact.created", actor: principal.actor, resource: { type: "fact", id }, action: "knowledge.write", requestId, details: { subjectId: body.subjectId, predicate: body.predicate, status: body.status || "seed" } });
    const row = await db.prepare("SELECT * FROM facts WHERE id = ?1").bind(id).first();
    return { status: 201, body: rowToFact(row), headers: { location: `/v1/knowledge/facts?subjectId=${body.subjectId}` } };
  },

  /* ---------------- Evidence ---------------- */
  async listEvidence({ db, url, principal }) {
    const { limit, cursor } = pageParams(url); const c = cursorWhere(cursor);
    const p = [principal.tenantId]; let sql = "SELECT * FROM evidence WHERE tenant_id = ?";
    for (const k of ["status", "kind"]) { const v = url.searchParams.get(k); if (v) { sql += ` AND ${k} = ?`; p.push(v); } }
    sql += c.clause; p.push(...c.params); sql += " ORDER BY created_at DESC, id DESC LIMIT ?"; p.push(limit + 1);
    const { results } = await db.prepare(sql).bind(...p).all();
    return { status: 200, body: pageOut(results, limit, rowToEvidence) };
  },
  async createEvidence({ db, principal, body, requestId }) {
    validate(body, { required: ["kind", "claim", "sources"], fields: { kind: { type: "string", enum: ["finding", "citation", "document", "observation", "testimony", "measurement", "other"] }, claim: { type: "string", maxLength: 4000 }, sources: { type: "array" }, confidence: { type: "number", min: 0, max: 1 }, status: { type: "string", enum: ["seed", "proposed", "certified"] }, attributes: { type: "object" } } });
    const sources = checkSources(body.sources);
    if (!sources.length) throw E.unprocessable("Evidence needs at least one source.", { code: "validation", violations: [{ field: "sources", code: "minItems", message: "at least one source" }] });
    if (body.status === "certified" && !principal.scopes.some((s) => ["igl.admin", "igl.platform"].includes(s))) throw E.forbidden("Only igl.admin may create evidence as certified.", { code: "certification_requires_admin" });
    const id = uuid(); const now = nowIso();
    await db.prepare("INSERT INTO evidence (id, tenant_id, kind, claim, sources, confidence, status, attributes, provenance, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)")
      .bind(id, principal.tenantId, body.kind, body.claim, JSON.stringify(sources), body.confidence ?? null, body.status || "seed", JSON.stringify(body.attributes || {}), JSON.stringify(provenance(principal, sources)), now).run();
    await appendAudit(db, principal.tenantId, { eventType: "evidence.created", actor: principal.actor, resource: { type: "evidence", id }, action: "evidence.write", requestId, details: { kind: body.kind, status: body.status || "seed" } });
    const row = await db.prepare("SELECT * FROM evidence WHERE id = ?1").bind(id).first();
    return { status: 201, body: rowToEvidence(row), headers: { location: `/v1/evidence/${id}` } };
  },
  async getEvidence({ db, principal, params }) {
    const row = await db.prepare("SELECT * FROM evidence WHERE tenant_id = ?1 AND id = ?2").bind(principal.tenantId, params.evidenceId).first();
    if (!row) throw E.notFound();
    return { status: 200, body: rowToEvidence(row) };
  },
  async corroborateEvidence({ db, principal, params, body, requestId }) {
    const row = await db.prepare("SELECT * FROM evidence WHERE tenant_id = ?1 AND id = ?2").bind(principal.tenantId, params.evidenceId).first();
    if (!row) throw E.notFound();
    validate(body, { required: ["supportingEvidenceIds"], fields: { supportingEvidenceIds: { type: "array" }, contradictingEvidenceIds: { type: "array" }, method: { type: "string", enum: ["manual", "rule", "model", "hybrid"] }, notes: { type: "string" } } });
    const sup = body.supportingEvidenceIds, con = body.contradictingEvidenceIds || [];
    for (const id of [...sup, ...con]) { const ok = await db.prepare("SELECT id FROM evidence WHERE tenant_id = ?1 AND id = ?2").bind(principal.tenantId, id).first(); if (!ok) throw E.unprocessable(`Evidence ${id} does not exist in this tenant.`, { code: "unknown_evidence" }); if (id === row.id) throw E.unprocessable("Evidence cannot corroborate itself.", { code: "self_corroboration" }); }
    const corroboration = row.corroboration_count + sup.length, contradiction = row.contradiction_count + con.length;
    let status = row.status;
    if (contradiction > 0 && contradiction >= corroboration) status = "disputed";
    else if (status === "seed" && corroboration >= 1) status = "proposed";
    await db.prepare("UPDATE evidence SET corroboration_count = ?1, contradiction_count = ?2, status = ?3 WHERE id = ?4").bind(corroboration, contradiction, status, row.id).run();
    await appendAudit(db, principal.tenantId, { eventType: "evidence.corroborated", actor: principal.actor, resource: { type: "evidence", id: row.id }, action: "evidence.write", requestId, details: { supporting: sup, contradicting: con, method: body.method || "manual", notes: body.notes ?? null, status } });
    const after = await db.prepare("SELECT * FROM evidence WHERE id = ?1").bind(row.id).first();
    return { status: 200, body: rowToEvidence(after) };
  },

  /* ---------------- Outcomes ---------------- */
  async createOutcome({ db, principal, body, requestId, ctx }) {
    validate(body, { required: ["subjectId", "type", "value", "occurredAt"], fields: { subjectId: { type: "string", uuid: true }, decisionId: { type: "string", uuid: true }, type: { type: "string" }, status: { type: "string", enum: ["expected", "observed", "validated"] }, metrics: { type: "object" }, occurredAt: { type: "string", datetime: true } } });
    await getIdentity(db, principal.tenantId, body.subjectId);
    const sources = checkSources(body.sources);
    const id = uuid(); const now = nowIso();
    await db.prepare("INSERT INTO outcomes (id, tenant_id, subject_id, decision_id, type, status, value, metrics, occurred_at, provenance, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)")
      .bind(id, principal.tenantId, body.subjectId, body.decisionId ?? null, body.type, body.status || "observed", JSON.stringify(body.value), JSON.stringify({ values: body.metrics || {}, measurements: [] }), body.occurredAt, JSON.stringify(provenance(principal, sources)), now).run();
    await appendAudit(db, principal.tenantId, { eventType: "outcome.recorded", actor: principal.actor, resource: { type: "outcome", id }, action: "outcome.write", requestId, decisionId: body.decisionId ?? null, details: { type: body.type, status: body.status || "observed" } });
    const out = rowToOutcome(await db.prepare("SELECT * FROM outcomes WHERE id = ?1").bind(id).first());
    await emit(db, ctx, principal.tenantId, "outcomeRecorded", out);
    return { status: 201, body: out, headers: { location: `/v1/outcomes/${id}` } };
  },
  async getOutcome({ db, principal, params }) {
    const row = await db.prepare("SELECT * FROM outcomes WHERE tenant_id = ?1 AND id = ?2").bind(principal.tenantId, params.outcomeId).first();
    if (!row) throw E.notFound();
    return { status: 200, body: rowToOutcome(row) };
  },
  async measureOutcome({ db, principal, params, body, requestId, ctx }) {
    const row = await db.prepare("SELECT * FROM outcomes WHERE tenant_id = ?1 AND id = ?2").bind(principal.tenantId, params.outcomeId).first();
    if (!row) throw E.notFound();
    validate(body, { required: ["metric", "value", "measuredAt"], fields: { metric: { type: "string" }, unit: { type: "string" }, measuredAt: { type: "string", datetime: true }, source: { type: "object" } } });
    if (!["number", "string", "boolean"].includes(typeof body.value)) throw E.unprocessable("value must be a number, string or boolean.", { code: "validation" });
    const stored = parseJson(row.metrics, {});
    const metrics = stored.values || {}; const measurements = stored.measurements || [];
    metrics[body.metric] = body.value;
    measurements.push({ metric: body.metric, value: body.value, unit: body.unit ?? null, measuredAt: body.measuredAt, source: body.source ? checkSources([body.source], "source")[0] : null, recordedBy: principal.actor });
    await db.prepare("UPDATE outcomes SET metrics = ?1 WHERE id = ?2").bind(JSON.stringify({ values: metrics, measurements }), row.id).run();
    await appendAudit(db, principal.tenantId, { eventType: "outcome.measured", actor: principal.actor, resource: { type: "outcome", id: row.id }, action: "outcome.write", requestId, details: { metric: body.metric } });
    const out = rowToOutcome(await db.prepare("SELECT * FROM outcomes WHERE id = ?1").bind(row.id).first());
    await emit(db, ctx, principal.tenantId, "outcomeRecorded", out);
    return { status: 200, body: out };
  },

  /* ---------------- Graph ---------------- */
  async createRelationship({ db, principal, body, requestId, ctx }) {
    validate(body, { required: ["fromId", "type", "toId"], fields: { fromId: { type: "string", uuid: true }, toId: { type: "string", uuid: true }, type: { type: "string", maxLength: 100 }, direction: { type: "string", enum: ["directed", "undirected"] }, attributes: { type: "object" }, effectiveFrom: { type: "string", datetime: true }, effectiveTo: { type: "string", datetime: true }, confidence: { type: "number", min: 0, max: 1 }, status: { type: "string", enum: ["proposed", "certified"] } } });
    await getIdentity(db, principal.tenantId, body.fromId); await getIdentity(db, principal.tenantId, body.toId);
    if (body.fromId === body.toId) throw E.unprocessable("A relationship needs two different identities.", { code: "validation" });
    if (body.status === "certified" && !principal.scopes.some((s) => ["igl.admin", "igl.platform"].includes(s))) throw E.forbidden("Only igl.admin may create a relationship as certified.", { code: "certification_requires_admin" });
    const sources = checkSources(body.sources);
    const id = uuid(); const now = nowIso();
    await db.prepare("INSERT INTO relationships (id, tenant_id, from_id, type, to_id, direction, attributes, effective_from, effective_to, confidence, status, provenance, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)")
      .bind(id, principal.tenantId, body.fromId, body.type, body.toId, body.direction || "directed", JSON.stringify(body.attributes || {}), body.effectiveFrom ?? null, body.effectiveTo ?? null, body.confidence ?? null, body.status || "proposed", JSON.stringify(provenance(principal, sources)), now).run();
    await appendAudit(db, principal.tenantId, { eventType: "relationship.created", actor: principal.actor, resource: { type: "relationship", id }, action: "graph.write", requestId, details: { fromId: body.fromId, type: body.type, toId: body.toId, status: body.status || "proposed" } });
    const rel = rowToRelationship(await db.prepare("SELECT * FROM relationships WHERE id = ?1").bind(id).first());
    if (rel.status === "certified") await emit(db, ctx, principal.tenantId, "graphUpdated", { eventType: "relationship.certified", resource: { type: "relationship", id }, occurredAt: now });
    return { status: 201, body: rel, headers: { location: `/v1/graph/relationships/${id}` } };
  },
  async findGraphPaths({ db, principal, body }) {
    validate(body, { required: ["fromId", "toId"], fields: { fromId: { type: "string", uuid: true }, toId: { type: "string", uuid: true }, maxHops: { type: "integer", min: 1, max: 12 }, relationshipTypes: { type: "array" }, asOf: { type: "string", datetime: true }, minimumConfidence: { type: "number", min: 0, max: 1 } } });
    const from = await getIdentity(db, principal.tenantId, body.fromId); const to = await getIdentity(db, principal.tenantId, body.toId);
    const maxHops = body.maxHops || 4; const minConf = body.minimumConfidence ?? 0; const types = body.relationshipTypes || null;
    // bounded breadth-first search over certified and proposed relationships
    const paths = []; const queue = [[from.id, [], []]]; const visited = new Map([[from.id, 0]]);
    while (queue.length && paths.length < 5) {
      const [node, nodes, edges] = queue.shift();
      if (edges.length >= maxHops) continue;
      const { results } = await db.prepare("SELECT * FROM relationships WHERE tenant_id = ?1 AND status IN ('proposed','certified') AND (from_id = ?2 OR to_id = ?2) LIMIT 200").bind(principal.tenantId, node).all();
      for (const r of results) {
        const rel = rowToRelationship(r);
        if (types && !types.includes(rel.type)) continue;
        if ((rel.confidence ?? 1) < minConf) continue;
        if (body.asOf && rel.effectiveFrom && Date.parse(rel.effectiveFrom) > Date.parse(body.asOf)) continue;
        const next = rel.fromId === node ? rel.toId : rel.fromId;
        if (rel.direction === "directed" && rel.fromId !== node) continue;
        const e2 = [...edges, rel]; const n2 = [...nodes, node];
        if (next === to.id) { paths.push({ nodes: [...n2, next], edges: e2 }); continue; }
        if (visited.has(next) && visited.get(next) <= e2.length) continue;
        visited.set(next, e2.length); queue.push([next, n2, e2]);
      }
    }
    const out = [];
    for (const p of paths) {
      const ids = p.nodes; const ph = ids.map(() => "?").join(",");
      const { results } = await db.prepare(`SELECT * FROM identities WHERE tenant_id = ? AND id IN (${ph})`).bind(principal.tenantId, ...ids).all();
      const byId = new Map(results.map((r) => [r.id, rowToIdentity(r)]));
      const score = p.edges.reduce((s, e) => s * (e.confidence ?? 1) * (e.status === "certified" ? 1 : 0.7), 1);
      out.push({ nodes: ids.map((i) => byId.get(i)).filter(Boolean), edges: p.edges, score: Number(score.toFixed(4)) });
    }
    out.sort((a, b) => b.score - a.score);
    return { status: 200, body: out };
  },
  async getGraphNeighbors({ db, url, principal, params }) {
    await getIdentity(db, principal.tenantId, params.entityId);
    const depth = Math.min(Math.max(Number(url.searchParams.get("depth") || 1), 1), 3);
    const { limit, cursor } = pageParams(url);
    let frontier = [params.entityId]; const seen = new Set(frontier); const all = [];
    for (let d = 0; d < depth && frontier.length; d++) {
      const ph = frontier.map(() => "?").join(",");
      const { results } = await db.prepare(`SELECT * FROM relationships WHERE tenant_id = ? AND status IN ('proposed','certified') AND (from_id IN (${ph}) OR to_id IN (${ph})) ORDER BY created_at DESC LIMIT 500`).bind(principal.tenantId, ...frontier, ...frontier).all();
      const next = [];
      for (const r of results) { if (all.some((x) => x.id === r.id)) continue; all.push(r); for (const o of [r.from_id, r.to_id]) if (!seen.has(o)) { seen.add(o); next.push(o); } }
      frontier = next;
    }
    all.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1));
    let rows = all;
    if (cursor) rows = all.filter((r) => r.created_at < cursor.t || (r.created_at === cursor.t && r.id < cursor.i));
    return { status: 200, body: pageOut(rows.slice(0, limit + 1), limit, rowToRelationship) };
  },

  /* ---------------- Intelligence ---------------- */
  async runQuery(h) { return intelligence(h, "query", false); },
  async runCrosswalk(h) { return intelligence(h, "crosswalk", false); },
  async runResearch(h) { return intelligence(h, "research", true); },
  async runInvestigation(h) { return intelligence(h, "investigate", true); },

  /* ---------------- Agents ---------------- */
  async createAgent({ db, principal, body, requestId }) {
    validate(body, { required: ["name", "capabilities"], fields: { name: { type: "string", maxLength: 200 }, description: { type: "string" }, capabilities: { type: "array" }, allowedTools: { type: "array" }, policyIds: { type: "array" }, modelRouting: { type: "object" } } });
    for (const pid of body.policyIds || []) { const ok = await db.prepare("SELECT id FROM policies WHERE tenant_id = ?1 AND id = ?2").bind(principal.tenantId, pid).first(); if (!ok) throw E.unprocessable(`Policy ${pid} does not exist in this tenant.`, { code: "unknown_policy" }); }
    const id = uuid(); const now = nowIso();
    await db.prepare("INSERT INTO agents (id, tenant_id, name, description, status, capabilities, allowed_tools, policy_ids, model_routing, created_at) VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?6, ?7, ?8, ?9)")
      .bind(id, principal.tenantId, body.name, body.description ?? null, JSON.stringify(body.capabilities), JSON.stringify(body.allowedTools || []), JSON.stringify(body.policyIds || []), JSON.stringify(body.modelRouting || {}), now).run();
    await appendAudit(db, principal.tenantId, { eventType: "agent.registered", actor: principal.actor, resource: { type: "agent", id }, action: "agent.create", requestId, details: { name: body.name, capabilities: body.capabilities } });
    return { status: 201, body: rowToAgent(await db.prepare("SELECT * FROM agents WHERE id = ?1").bind(id).first()), headers: { location: `/v1/agents/${id}` } };
  },
  async getAgent({ db, principal, params }) {
    const row = await db.prepare("SELECT * FROM agents WHERE tenant_id = ?1 AND id = ?2").bind(principal.tenantId, params.agentId).first();
    if (!row) throw E.notFound();
    return { status: 200, body: rowToAgent(row) };
  },
  async invokeAgent(h) {
    const { db, env, ctx, principal, params, body, requestId, signer } = h;
    const row = await db.prepare("SELECT * FROM agents WHERE tenant_id = ?1 AND id = ?2").bind(principal.tenantId, params.agentId).first();
    if (!row) throw E.notFound();
    const agent = rowToAgent(row);
    if (agent.status !== "active") throw E.conflict(`Agent is ${agent.status}.`, { code: "agent_not_active" });
    validate(body, { required: ["instruction"], fields: { instruction: { type: "string", maxLength: 8000 }, input: { type: "object" }, resourceScope: { type: "array" }, requireApproval: { type: "boolean" } } });
    const actor = checkActor(body.actor) || principal.actor;
    const run = await createRun(db, principal.tenantId, "agent", { agentId: agent.id, instruction: body.instruction, input: body.input || {}, resourceScope: body.resourceScope || [], actor });
    const { decision, policies } = await decide(db, signer, principal.tenantId, { ...principal, actor }, "agent.invoke", { type: "agent", id: agent.id }, { capabilities: agent.capabilities });
    await appendAudit(db, principal.tenantId, { eventType: "agent.invoked", actor, resource: { type: "agent", id: agent.id }, action: "agent.invoke", requestId, decisionId: decision.decisionId, details: { runId: run.id, effect: decision.effect } });
    if (decision.effect === "deny") { await finishRun(db, run.id, { status: "failed", error: { type: "https://id-me.ai/problems/policy_denied", title: "Denied by policy", status: 403, detail: decision.reasonCodes.join(", "), traceId: requestId } }); return { status: 202, body: await loadRun(db, principal.tenantId, run.id) }; }
    if (body.requireApproval || decision.effect !== "allow") {
      await db.prepare("UPDATE runs SET status = 'awaiting_approval', governance = ?1 WHERE id = ?2").bind(JSON.stringify(await issueReceipt(db, signer, principal.tenantId, { actor, authorityDecision: decision, policiesEvaluated: policies.map((p) => p.id) })), run.id).run();
      await emit(db, ctx, principal.tenantId, "approvalRequired", { runId: run.id, requirements: decision.requiredApprovals });
      return { status: 202, body: await loadRun(db, principal.tenantId, run.id) };
    }
    ctx.waitUntil(executeAgentRun(h, run.id, agent, actor, body, decision, policies));
    return { status: 202, body: await loadRun(db, principal.tenantId, run.id) };
  },
  async getRun({ db, principal, params }) { return { status: 200, body: await loadRun(db, principal.tenantId, params.runId) }; },

  /* ---------------- Workflows ---------------- */
  async createWorkflow({ db, principal, body, requestId }) {
    validate(body, { required: ["name", "version", "steps"], fields: { name: { type: "string", maxLength: 200 }, version: { type: "string" }, status: { type: "string", enum: ["draft", "active"] }, steps: { type: "array" }, policyIds: { type: "array" } } });
    if (!body.steps.length) throw E.unprocessable("A workflow needs at least one step.", { code: "validation" });
    const ids = new Set();
    body.steps.forEach((s, i) => { validate(s, { required: ["id", "type"], fields: { id: { type: "string" }, type: { type: "string", enum: ["query", "research", "agent", "human_approval", "policy_check", "tool", "transform", "outcome"] }, config: { type: "object" }, onSuccess: { type: "string" }, onFailure: { type: "string" } } }, `steps[${i}]`); if (ids.has(s.id)) throw E.unprocessable(`Duplicate step id ${s.id}.`, { code: "validation" }); ids.add(s.id); });
    for (const s of body.steps) for (const k of ["onSuccess", "onFailure"]) if (s[k] && !ids.has(s[k])) throw E.unprocessable(`Step ${s.id}.${k} points to unknown step ${s[k]}.`, { code: "validation" });
    const id = uuid(); const now = nowIso();
    await db.prepare("INSERT INTO workflows (id, tenant_id, name, version, status, steps, policy_ids, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)").bind(id, principal.tenantId, body.name, body.version, body.status || "draft", JSON.stringify(body.steps), JSON.stringify(body.policyIds || []), now).run();
    await appendAudit(db, principal.tenantId, { eventType: "workflow.created", actor: principal.actor, resource: { type: "workflow", id }, action: "workflow.create", requestId, details: { name: body.name, version: body.version, steps: body.steps.length } });
    return { status: 201, body: rowToWorkflow(await db.prepare("SELECT * FROM workflows WHERE id = ?1").bind(id).first()), headers: { location: `/v1/workflows/${id}` } };
  },
  async runWorkflow(h) {
    const { db, ctx, principal, params, body, requestId, signer } = h;
    const row = await db.prepare("SELECT * FROM workflows WHERE tenant_id = ?1 AND id = ?2").bind(principal.tenantId, params.workflowId).first();
    if (!row) throw E.notFound();
    const wf = rowToWorkflow(row);
    if (wf.status !== "active") throw E.conflict(`Workflow is ${wf.status}; only active workflows run.`, { code: "workflow_not_active" });
    validate(body || {}, { fields: { input: { type: "object" }, dryRun: { type: "boolean" } } });
    const actor = checkActor(body?.actor) || principal.actor;
    const run = await createRun(db, principal.tenantId, "workflow", { workflowId: wf.id, input: body?.input || {}, dryRun: !!body?.dryRun, actor });
    const { decision, policies } = await decide(db, signer, principal.tenantId, { ...principal, actor }, "workflow.run", { type: "workflow", id: wf.id });
    await appendAudit(db, principal.tenantId, { eventType: "workflow.run_requested", actor, resource: { type: "workflow", id: wf.id }, action: "workflow.run", requestId, decisionId: decision.decisionId, details: { runId: run.id, dryRun: !!body?.dryRun, effect: decision.effect } });
    if (decision.effect === "deny") { await finishRun(db, run.id, { status: "failed", error: { type: "https://id-me.ai/problems/policy_denied", title: "Denied by policy", status: 403, detail: decision.reasonCodes.join(", "), traceId: requestId } }); return { status: 202, body: await loadRun(db, principal.tenantId, run.id) }; }
    ctx.waitUntil(executeWorkflowRun(h, run.id, wf, actor, body || {}, decision, policies));
    return { status: 202, body: await loadRun(db, principal.tenantId, run.id) };
  },

  /* ---------------- Audit ---------------- */
  async listAuditEvents({ db, url, principal }) {
    const { limit, cursor } = pageParams(url);
    const p = [principal.tenantId]; let sql = "SELECT * FROM audit_events WHERE tenant_id = ?";
    const actorId = url.searchParams.get("actorId"), resourceId = url.searchParams.get("resourceId"), eventType = url.searchParams.get("eventType"), from = url.searchParams.get("from"), to = url.searchParams.get("to");
    if (actorId) { sql += " AND actor LIKE ?"; p.push(`%"identityId":"${actorId}"%`); }
    if (resourceId) { sql += " AND resource LIKE ?"; p.push(`%"id":"${resourceId}"%`); }
    if (eventType) { sql += " AND event_type = ?"; p.push(eventType); }
    if (from) { sql += " AND occurred_at >= ?"; p.push(from); }
    if (to) { sql += " AND occurred_at <= ?"; p.push(to); }
    if (cursor) { sql += " AND seq < ?"; p.push(Number(cursor.i)); }
    sql += " ORDER BY seq DESC LIMIT ?"; p.push(limit + 1);
    const { results } = await db.prepare(sql).bind(...p).all();
    const hasMore = results.length > limit; const items = results.slice(0, limit);
    const last = items[items.length - 1];
    return { status: 200, body: { items: items.map(rowToEvent), page: { nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ t: last.occurred_at, i: String(last.seq) })).toString("base64url") : null, hasMore } } };
  },
  async getGovernanceReceipt({ db, principal, params }) {
    const row = await db.prepare("SELECT body FROM receipts WHERE tenant_id = ?1 AND id = ?2").bind(principal.tenantId, params.receiptId).first();
    if (!row) throw E.notFound();
    return { status: 200, body: JSON.parse(row.body) };
  },
  async recordInteraction({ db, principal, body, requestId }) {
    validate(body, { required: ["purpose", "outcome"], fields: { identityId: { type: "string", uuid: true }, purpose: { type: "string" }, outcome: { type: "string", enum: ["completed", "refused", "proceeded_on_truncated", "proceeded_on_empty", "escalated"] }, reason: { type: "string", maxLength: 2000 }, projectionReceiptId: { type: "string", uuid: true }, runId: { type: "string", uuid: true }, model: { type: "string" } } });
    await getPurpose(db, principal.tenantId, body.purpose);
    if (body.identityId) await getIdentity(db, principal.tenantId, body.identityId);
    const id = uuid(); const recordedAt = nowIso();
    const record = { identityId: body.identityId ?? null, purpose: body.purpose, outcome: body.outcome, reason: body.reason ?? null, projectionReceiptId: body.projectionReceiptId ?? null, runId: body.runId ?? null, model: body.model ?? null };
    const ev = await appendAudit(db, principal.tenantId, { eventType: "interaction.recorded", actor: principal.actor, resource: { type: "identity", id: body.identityId ?? "none" }, action: "interaction.record", requestId, details: record });
    const out = { ...record, id, actor: principal.actor, recordedAt, eventHash: ev.eventHash };
    await db.prepare("INSERT INTO interactions (id, tenant_id, body, actor, recorded_at, event_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(id, principal.tenantId, JSON.stringify(record), JSON.stringify(principal.actor), recordedAt, ev.eventHash).run();
    return { status: 201, body: out };
  },
};

/* ---------------- helpers for runs and intelligence ---------------- */
function rowToOutcome(r) { const m = parseJson(r.metrics, {}); const flat = m.values ? m.values : m; return { id: r.id, subjectId: r.subject_id, decisionId: r.decision_id, type: r.type, status: r.status, value: parseJson(r.value, null), metrics: flat, measurements: m.measurements || [], occurredAt: r.occurred_at, provenance: parseJson(r.provenance, undefined) }; }
function rowToAgent(r) { return { id: r.id, name: r.name, description: r.description, status: r.status, capabilities: parseJson(r.capabilities, []), allowedTools: parseJson(r.allowed_tools, []), policyIds: parseJson(r.policy_ids, []), modelRouting: parseJson(r.model_routing, {}) }; }
function rowToWorkflow(r) { return { id: r.id, name: r.name, version: r.version, status: r.status, steps: parseJson(r.steps, []), policyIds: parseJson(r.policy_ids, []) }; }
function rowToRun(r) { return { id: r.id, type: r.type, status: r.status, createdAt: r.created_at, startedAt: r.started_at, completedAt: r.completed_at, output: parseJson(r.output, null), error: parseJson(r.error, null), governance: parseJson(r.governance, null) }; }

async function createRun(db, tenantId, type, input) {
  const id = uuid(); const now = nowIso();
  await db.prepare("INSERT INTO runs (id, tenant_id, type, status, input, created_at) VALUES (?1, ?2, ?3, 'queued', ?4, ?5)").bind(id, tenantId, type, JSON.stringify(input), now).run();
  return { id };
}
async function loadRun(db, tenantId, id) {
  const row = await db.prepare("SELECT * FROM runs WHERE tenant_id = ?1 AND id = ?2").bind(tenantId, id).first();
  if (!row) throw E.notFound();
  return rowToRun(row);
}
async function startRun(db, id) { await db.prepare("UPDATE runs SET status = 'running', started_at = ?1 WHERE id = ?2").bind(nowIso(), id).run(); }
async function finishRun(db, id, { status, output = null, error = null, governance = null }) {
  await db.prepare("UPDATE runs SET status = ?1, output = ?2, error = ?3, governance = COALESCE(?4, governance), completed_at = ?5 WHERE id = ?6").bind(status, output === null ? null : JSON.stringify(output), error === null ? null : JSON.stringify(error), governance === null ? null : JSON.stringify(governance), nowIso(), id).run();
}
function problemOf(err, traceId) {
  return { type: err.code ? `https://id-me.ai/problems/${err.code}` : "about:blank", title: err.title || "Error", status: err.status || 500, detail: err.status ? (err.detail || err.message) : "The run failed.", traceId };
}

async function intelligence(h, kind, async) {
  const { db, env, ctx, principal, body, requestId, signer } = h;
  validate(body, { required: ["question"], fields: { question: { type: "string", maxLength: 8000 }, scope: { type: "object" }, filters: { type: "array" }, maxHops: { type: "integer", min: 0, max: 12 }, asOf: { type: "string", datetime: true }, requireCitations: { type: "boolean" }, minimumConfidence: { type: "number", min: 0, max: 1 }, modelPreference: { type: "string" }, purpose: { type: "string" } } });
  (body.filters || []).forEach((f, i) => validate(f, { required: ["field", "operator", "value"], fields: { field: { type: "string" }, operator: { type: "string", enum: ["eq", "ne", "in", "not_in", "gt", "gte", "lt", "lte", "contains", "exists", "between"] } } }, `filters[${i}]`));
  const actor = checkActor(body.actor) || principal.actor;
  if (body.purpose) await getPurpose(db, principal.tenantId, body.purpose);
  const { decision, policies } = await decide(db, signer, principal.tenantId, { ...principal, actor }, `intelligence.${kind}`, { type: "intelligence", id: kind }, { purpose: body.purpose ?? null, scope: body.scope || {} });
  if (decision.effect === "deny") throw E.forbidden("A policy denies this intelligence request.", { code: "policy_denied" });
  if (decision.effect === "escalate") throw E.forbidden("A policy requires escalation before this request can run.", { code: "policy_escalate" });
  if (!async) {
    const result = await runIntelligence(db, env, principal.tenantId, kind, body);
    const receipt = await issueReceipt(db, signer, principal.tenantId, { actor, authorityDecision: decision, policiesEvaluated: policies.map((p) => p.id), evidenceIds: result.findings.map((f) => f.id), output: { answer: result.answer, citations: result.citations.map((c) => c.sourceId) } });
    await appendAudit(db, principal.tenantId, { eventType: `intelligence.${kind}`, actor, resource: { type: "intelligence", id: result.requestId }, action: `intelligence.${kind}`, requestId, decisionId: decision.decisionId, details: { model: result.model, citations: result.citations.length, context: result.contextSize, receiptId: receipt.receiptId } });
    return { status: 200, body: { requestId: result.requestId, answer: result.answer, citations: result.citations, entities: result.entities, paths: result.paths, findings: result.findings, governance: receipt, createdAt: nowIso() } };
  }
  const run = await createRun(db, principal.tenantId, kind === "research" ? "research" : "investigation", { request: body, actor });
  await appendAudit(db, principal.tenantId, { eventType: `intelligence.${kind}.queued`, actor, resource: { type: "run", id: run.id }, action: `intelligence.${kind}`, requestId, decisionId: decision.decisionId, details: {} });
  ctx.waitUntil((async () => {
    await startRun(db, run.id);
    try {
      const result = await runIntelligence(db, env, principal.tenantId, kind, body);
      const receipt = await issueReceipt(db, signer, principal.tenantId, { actor, authorityDecision: decision, policiesEvaluated: policies.map((p) => p.id), evidenceIds: result.findings.map((f) => f.id), output: { answer: result.answer, citations: result.citations.map((c) => c.sourceId) } });
      await finishRun(db, run.id, { status: "succeeded", output: { requestId: result.requestId, answer: result.answer, citations: result.citations, entities: result.entities, paths: result.paths, findings: result.findings, governance: receipt, createdAt: nowIso() }, governance: receipt });
      await appendAudit(db, principal.tenantId, { eventType: `intelligence.${kind}.completed`, actor, resource: { type: "run", id: run.id }, action: `intelligence.${kind}`, requestId, decisionId: decision.decisionId, details: { model: result.model, citations: result.citations.length, receiptId: receipt.receiptId } });
    } catch (err) {
      console.error("run failed", run.id, err?.message);
      await finishRun(db, run.id, { status: "failed", error: problemOf(err, requestId) });
      await appendAudit(db, principal.tenantId, { eventType: `intelligence.${kind}.failed`, actor, resource: { type: "run", id: run.id }, action: `intelligence.${kind}`, requestId, decisionId: decision.decisionId, details: { code: err.code || "error" } });
    }
  })());
  return { status: 202, body: await loadRun(db, principal.tenantId, run.id), headers: { location: `/v1/runs/${run.id}` } };
}

async function executeAgentRun(h, runId, agent, actor, body, decision, policies) {
  const { db, env, principal, signer, requestId } = h;
  await startRun(db, runId);
  try {
    const scopeIds = (body.resourceScope || []).map((r) => r.id).filter((id) => UUID_RE.test(id));
    const result = await runIntelligence(db, env, principal.tenantId, "query", { question: body.instruction, scope: { identityIds: scopeIds, ...(body.input || {}) }, requireCitations: true, modelPreference: agent.modelRouting?.model || null });
    const receipt = await issueReceipt(db, signer, principal.tenantId, { actor, authorityDecision: decision, policiesEvaluated: policies.map((p) => p.id), evidenceIds: result.findings.map((f) => f.id), output: { answer: result.answer } });
    await finishRun(db, runId, { status: "succeeded", output: { agentId: agent.id, answer: result.answer, citations: result.citations, entities: result.entities, model: result.model }, governance: receipt });
    await appendAudit(db, principal.tenantId, { eventType: "agent.run_completed", actor, resource: { type: "run", id: runId }, action: "agent.invoke", requestId, decisionId: decision.decisionId, details: { agentId: agent.id, receiptId: receipt.receiptId } });
  } catch (err) {
    console.error("agent run failed", runId, err?.message);
    await finishRun(db, runId, { status: "failed", error: problemOf(err, requestId) });
  }
}

async function executeWorkflowRun(h, runId, wf, actor, body, decision, policies) {
  const { db, env, principal, signer, requestId } = h;
  await startRun(db, runId);
  const steps = new Map(wf.steps.map((s) => [s.id, s]));
  const log = []; let current = wf.steps[0]; let context = { input: body.input || {} }; let guard = 0;
  try {
    while (current && guard++ < 50) {
      const step = current; let ok = true; let out = null;
      try {
        if (body.dryRun) { out = { dryRun: true }; }
        else switch (step.type) {
          case "query": case "research": {
            const r = await runIntelligence(db, env, principal.tenantId, step.type, { question: step.config?.question || body.input?.question || "", scope: { ...(step.config?.scope || {}), ...(context.input?.scope || {}) }, requireCitations: step.config?.requireCitations !== false });
            out = { answer: r.answer, citations: r.citations }; break;
          }
          case "policy_check": {
            const d = evaluate(await activePolicies(db, principal.tenantId), { actor, action: step.config?.action || "workflow.step", resource: step.config?.resource || { type: "workflow", id: wf.id }, context: { jurisdiction: principal.jurisdiction || principal.tenantJurisdiction } });
            await storeDecision(db, principal.tenantId, d); out = d; ok = d.effect === "allow"; break;
          }
          case "human_approval": { out = { awaiting: true }; await db.prepare("UPDATE runs SET status = 'awaiting_approval', output = ?1 WHERE id = ?2").bind(JSON.stringify({ log: [...log, { step: step.id, type: step.type, ok: true, output: out }], context }), runId).run(); await emit(db, h.ctx, principal.tenantId, "approvalRequired", { runId, requirements: step.config?.requirements || [] }); return; }
          case "transform": { context = { ...context, ...(step.config?.set || {}) }; out = step.config?.set || {}; break; }
          case "outcome": {
            const subjectId = step.config?.subjectId || context.input?.subjectId; if (!subjectId) throw E.unprocessable("outcome step needs subjectId", { code: "validation" });
            const id = uuid(); await db.prepare("INSERT INTO outcomes (id, tenant_id, subject_id, decision_id, type, status, value, metrics, occurred_at, provenance, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'observed', ?6, '{}', ?7, ?8, ?7)").bind(id, principal.tenantId, subjectId, decision.decisionId, step.config?.type || "workflow", JSON.stringify(step.config?.value ?? log), nowIso(), JSON.stringify({ createdAt: nowIso(), createdBy: actor, sources: [], model: null, workflowRunId: runId, policyDecisionIds: [decision.decisionId] })).run();
            out = { outcomeId: id }; break;
          }
          case "agent": {
            const a = await db.prepare("SELECT * FROM agents WHERE tenant_id = ?1 AND id = ?2").bind(principal.tenantId, step.config?.agentId).first(); if (!a) throw E.unprocessable("agent step names an unknown agent", { code: "unknown_agent" });
            const r = await runIntelligence(db, env, principal.tenantId, "query", { question: step.config?.instruction || body.input?.question || "", scope: step.config?.scope || {}, requireCitations: true });
            out = { agentId: a.id, answer: r.answer, citations: r.citations }; break;
          }
          case "tool": throw E.unprocessable("tool steps are not executed by this service; register the tool as an agent", { code: "unsupported_step" });
        }
      } catch (err) { ok = false; out = problemOf(err, requestId); }
      log.push({ step: step.id, type: step.type, ok, output: out });
      const nextId = ok ? step.onSuccess : step.onFailure;
      if (!ok && !nextId) { const receipt = await issueReceipt(db, signer, principal.tenantId, { actor, authorityDecision: decision, policiesEvaluated: policies.map((p) => p.id), output: log }); await finishRun(db, runId, { status: "failed", output: { log, context }, error: out, governance: receipt }); return; }
      current = nextId ? steps.get(nextId) : null;
    }
    const receipt = await issueReceipt(db, signer, principal.tenantId, { actor, authorityDecision: decision, policiesEvaluated: policies.map((p) => p.id), output: log });
    await finishRun(db, runId, { status: "succeeded", output: { log, context }, governance: receipt });
    await appendAudit(db, principal.tenantId, { eventType: "workflow.run_completed", actor, resource: { type: "run", id: runId }, action: "workflow.run", requestId, decisionId: decision.decisionId, details: { workflowId: wf.id, steps: log.length, receiptId: receipt.receiptId } });
  } catch (err) {
    console.error("workflow run failed", runId, err?.message);
    await finishRun(db, runId, { status: "failed", output: { log, context }, error: problemOf(err, requestId) });
  }
}
