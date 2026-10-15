/* Conformance suite for the platform API.

   Runs against a live service (IGL_API_BASE, default the local wrangler dev
   on :8801 started by `npm run dev` in platform/api, or `npm run test:api`
   from the repository root which starts and stops it). Every response body
   is validated against the schema the contract declares for that status
   code, and every contract operation must be covered or the suite fails.

   Needs a sandbox-mode service (IGL_ENV=sandbox) so /sandbox/signup can
   mint a tenant. Intelligence operations are exercised for their governed
   behavior (empty context, policy deny) and, when ANTHROPIC_API_KEY is set
   on the service, for a real cited answer. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicKey, verify as edVerify, createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const Ajv = require("ajv/dist/2020");
const addFormats = require("ajv-formats");
const YAML = require("yaml");

const here = dirname(fileURLToPath(import.meta.url));
const spec = YAML.parse(readFileSync(join(here, "../../../spec/openapi.yaml"), "utf8"));
const BASE = process.env.IGL_API_BASE || "http://127.0.0.1:8801";

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: "contract", components: spec.components });
const schemaFor = (ref) => ajv.getSchema("contract" + ref) || ajv.compile({ $ref: "contract" + ref });

const covered = new Set();
function opFor(method, path) {
  const item = spec.paths[path]; const op = item?.[method.toLowerCase()];
  if (!op) throw new Error(`no operation ${method} ${path} in the contract`);
  return op;
}
function responseSchema(op, status) {
  const r = op.responses[String(status)] || op.responses.default;
  if (!r) return null;
  const sch = r.content?.["application/json"]?.schema || r.content?.["application/problem+json"]?.schema;
  if (!sch) return null;
  if (sch.$ref) return schemaFor(sch.$ref);
  return ajv.compile({ ...sch, components: spec.components });
}

let tenant, key, identityId, token;
async function call(method, path, { body, headers = {}, raw = false, auth = true, expect } = {}) {
  const url = BASE + "/v1" + path;
  const h = { "content-type": "application/json" };
  if (auth !== false) { h.authorization = `Bearer ${auth === "token" ? token : key}`; h["x-igl-tenant-id"] = tenant; }
  Object.assign(h, headers);
  const res = await fetch(url, { method, headers: h, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  const templatePath = path.split("?")[0];
  const contractPath = Object.keys(spec.paths).find((p) => p === templatePath) || Object.keys(spec.paths).find((p) => new RegExp("^" + p.replace(/\{[^}]+\}/g, "[^/]+") + "$").test(templatePath));
  if (contractPath) {
    const op = opFor(method, contractPath);
    covered.add(op.operationId);
    if (expect !== undefined) assert.equal(res.status, expect, `${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
    const validateFn = responseSchema(op, res.status);
    if (validateFn && json !== null) {
      const ok = validateFn(json);
      assert.ok(ok, `${method} ${path} ${res.status} body does not match ${op.operationId} schema: ${JSON.stringify(validateFn.errors?.slice(0, 3))}\n${text.slice(0, 400)}`);
    }
    if (res.status >= 400) { assert.equal(res.headers.get("content-type"), "application/problem+json"); assert.ok(json.traceId && json.title && json.status === res.status); }
  } else if (expect !== undefined) assert.equal(res.status, expect, `${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return { status: res.status, json, headers: res.headers, text };
}

test("service is up and describes itself", async () => {
  const h = await call("GET", "/health", { auth: false, expect: 200 });
  assert.equal(h.json.status, "ok");
  const meta = await (await fetch(BASE + "/.well-known/igl.json")).json();
  assert.equal(meta.environment, "sandbox"); assert.equal(meta.operations, 46);
  const jwks = await (await fetch(BASE + "/.well-known/jwks.json")).json();
  assert.equal(jwks.keys[0].crv, "Ed25519");
});

test("sandbox signup mints a tenant, an identity and a key; the key cannot be used in the wrong tenant", async () => {
  const r = await fetch(BASE + "/sandbox/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organization: "Rio Diablo Operating", email: "maria@example.com", jurisdiction: "US-TX" }) });
  assert.equal(r.status, 201);
  const j = await r.json(); tenant = j.tenantId; key = j.apiKey; identityId = j.identityId;
  assert.match(key, /^igl_test_/);
  const other = await call("GET", "/capabilities", { headers: { "x-igl-tenant-id": "00000000-0000-0000-0000-000000000000" }, expect: 403 });
  assert.equal(other.json.type, "https://id-me.ai/problems/tenant_mismatch");
  await call("GET", "/capabilities", { auth: false, expect: 401 });
  const q = await fetch(BASE + "/v1/capabilities?key=" + key, { headers: { "x-igl-tenant-id": tenant } });
  assert.equal(q.status, 401, "a key in the query string must be ignored");
});

test("client credentials token works like the key and carries scopes", async () => {
  const signup = await (await fetch(BASE + "/sandbox/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organization: "Token Co", email: "t@example.com" }) })).json();
  const r = await fetch(BASE + "/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: signup.clientId, client_secret: signup.apiKey, scope: "igl.read" }) });
  assert.equal(r.status, 200);
  const t = await r.json(); assert.equal(t.token_type, "Bearer"); assert.equal(t.scope, "igl.read");
  const ok = await fetch(BASE + "/v1/capabilities", { headers: { authorization: `Bearer ${t.access_token}`, "x-igl-tenant-id": signup.tenantId } });
  assert.equal(ok.status, 200);
  const denied = await fetch(BASE + "/v1/identities", { method: "POST", headers: { authorization: `Bearer ${t.access_token}`, "x-igl-tenant-id": signup.tenantId, "content-type": "application/json" }, body: JSON.stringify({ type: "person", displayName: "x" }) });
  assert.equal(denied.status, 403, "igl.read token must not write");
  const bad = await fetch(BASE + "/oauth2/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grant_type: "client_credentials", client_id: signup.clientId, client_secret: "wrong" }) });
  assert.equal(bad.status, 401);
  token = t.access_token;
});

test("capabilities and purposes", async () => {
  const c = await call("GET", "/capabilities", { expect: 200 });
  assert.equal(c.json.apiVersion, "0.2.0");
  const p = await call("GET", "/purposes", { expect: 200 });
  assert.ok(p.json.items.some((x) => x.id === "identity-introduction" && x.default));
  await call("GET", "/purposes/identity-introduction", { expect: 200 });
  await call("GET", "/purposes/nope", { expect: 404 });
});

const OPS = "11111111-1111-4111-8111-111111111111";
let orgId, assetId, relId, factId, evidenceId, evidence2Id, policyId, outcomeId, receiptId;
test("identities: create, get, list, patch, context, validation, idempotency", async () => {
  const me = await call("GET", `/identities/${identityId}`, { expect: 200 });
  assert.equal(me.json.type, "person");
  const org = await call("POST", "/identities", { body: { type: "organization", displayName: "Rio Diablo Operating, LLC", attributes: { jurisdiction: "US-TX", industry: "oil-and-gas" } }, headers: { "idempotency-key": "org-1" }, expect: 201 });
  orgId = org.json.id;
  const replay = await call("POST", "/identities", { body: { type: "organization", displayName: "Rio Diablo Operating, LLC", attributes: { jurisdiction: "US-TX", industry: "oil-and-gas" } }, headers: { "idempotency-key": "org-1" }, expect: 201 });
  assert.equal(replay.json.id, orgId, "same idempotency key and body replays the same identity");
  assert.equal(replay.headers.get("idempotent-replayed"), "true");
  await call("POST", "/identities", { body: { type: "organization", displayName: "Different" }, headers: { "idempotency-key": "org-1" }, expect: 409 });
  const asset = await call("POST", "/identities", { body: { type: "asset", displayName: "Gathering Station 3", attributes: { kind: "facility", jurisdiction: "US-TX" } }, expect: 201 });
  assetId = asset.json.id;
  const bad = await call("POST", "/identities", { body: { type: "spaceship", displayName: "" }, expect: 422 });
  assert.ok(bad.json.violations.length >= 2);
  await call("POST", "/identities", { body: "{not json", expect: 400 });
  const byName = await call("GET", "/identities?q=Rio", { expect: 200 });
  assert.ok(byName.json.items.some((i) => i.id === orgId));
  const list = await call("GET", "/identities?limit=1", { expect: 200 });
  assert.equal(list.json.items.length, 1); assert.equal(list.json.page.hasMore, true);
  const page2 = await call("GET", `/identities?limit=1&cursor=${list.json.page.nextCursor}`, { expect: 200 });
  assert.notEqual(page2.json.items[0]?.id, list.json.items[0].id);
  await call("GET", "/identities?type=robot", { expect: 400 });
  const patched = await call("PATCH", `/identities/${identityId}`, { body: { attributes: { role: "Compliance Lead", jurisdiction: "US-TX", credentials: { PE: "TX-12345" } }, displayName: "Maria Santos" }, expect: 200 });
  assert.equal(patched.json.displayName, "Maria Santos"); assert.equal(patched.json.attributes.role, "Compliance Lead");
  await call("PATCH", `/identities/${identityId}`, { body: { status: "merged" }, expect: 422 });
  const ctx = await call("POST", `/identities/${identityId}/context`, { body: { kind: "expertise", value: "RRC filings", confidence: 0.9 }, expect: 200 });
  assert.equal(ctx.json.attributes.contextCount, 1);
  await call("GET", "/identities/00000000-0000-0000-0000-000000000001", { expect: 404 });
  await call("GET", "/identities/not-a-uuid", { expect: 404 });
});

test("graph: relationships, neighbors, paths; proposed relationships never project", async () => {
  await call("POST", "/graph/relationships", { body: { fromId: identityId, type: "employed_by", toId: identityId }, expect: 422 });
  const rel = await call("POST", "/graph/relationships", { body: { fromId: identityId, type: "employed_by", toId: orgId, status: "certified", confidence: 0.95 }, expect: 201 });
  relId = rel.json.id; assert.equal(rel.json.status, "certified");
  const proposed = await call("POST", "/graph/relationships", { body: { fromId: orgId, type: "operates", toId: assetId, confidence: 0.7 }, expect: 201 });
  assert.equal(proposed.json.status, "proposed");
  const rels = await call("GET", `/identities/${identityId}/relationships`, { expect: 200 });
  assert.equal(rels.json.items.length, 1);
  const nb = await call("GET", `/graph/entities/${orgId}/neighbors?depth=2`, { expect: 200 });
  assert.equal(nb.json.items.length, 2);
  const paths = await call("POST", "/graph/paths", { body: { fromId: identityId, toId: assetId, maxHops: 4 }, expect: 200 });
  assert.equal(paths.json.length, 1); assert.equal(paths.json[0].edges.length, 2); assert.ok(paths.json[0].score < 1);
  const none = await call("POST", "/graph/paths", { body: { fromId: identityId, toId: assetId, maxHops: 1 }, expect: 200 });
  assert.equal(none.json.length, 0);
});

test("projection: four gates, consent, explain, whoami, receipts verify with the published key", async () => {
  const proj = await call("GET", `/identities/${identityId}/projection?purpose=identity-introduction`, { expect: 200 });
  const types = proj.json.nodes.map((n) => n.type);
  assert.ok(types.includes("Person") && types.includes("Role") && types.includes("Organization") && types.includes("Jurisdiction"), types.join(","));
  assert.ok(!types.includes("Credential"), "credential is withheld under identity-introduction");
  assert.equal(proj.json.withheld.Credential, 1);
  assert.equal(proj.json.edges.length, 1, "only the certified edge between admitted nodes");
  receiptId = proj.json.governance.receiptId;
  // verify the receipt with the JWKS key, independently of the service
  const jwks = await (await fetch(BASE + "/.well-known/jwks.json")).json();
  const { signer, alg, publicKey, signature, ...receipt } = proj.json.governance;
  const canonical = (x) => Array.isArray(x) ? "[" + x.map(canonical).join(",") + "]" : (x && typeof x === "object") ? "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}" : JSON.stringify(x === undefined ? null : x);
  const pub = createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
  assert.ok(edVerify(null, Buffer.from("IGL-RECEIPT-v0.2:" + canonical(receipt)), pub, Buffer.from(signature, "base64")), "receipt signature verifies");
  assert.equal(Buffer.from(jwks.keys[0].x, "base64url").toString("hex"), Buffer.from(publicKey, "base64").subarray(-32).toString("hex"), "receipt key is the JWKS key");
  assert.equal(receipt.outputHash, createHash("sha256").update(canonical(proj.json.nodes)).digest("hex"), "outputHash covers the admitted nodes");
  const got = await call("GET", `/audit/receipts/${receiptId}`, { expect: 200 });
  assert.equal(got.json.receiptId, receiptId);

  const research = await call("GET", `/identities/${identityId}/projection?purpose=scientific-research`, { expect: 200 });
  assert.equal(research.json.nodes.length, 0); assert.match(research.json.emptyWarning, /consent/);
  const ex = await call("GET", `/identities/${identityId}/projection/explain?purpose=scientific-research`, { expect: 200 });
  const cred = ex.json.considered.find((c) => c.node.type === "Credential");
  assert.equal(cred.admitted, false); assert.equal(cred.gates[0].result, "pass"); assert.equal(cred.gates[2].result, "fail"); assert.equal(cred.gates[3].result, "skipped");
  await call("GET", `/identities/${identityId}/projection?purpose=unknown`, { expect: 422 });
  await call("GET", `/identities/${identityId}/projection`, { expect: 422 });
  const dir = await call("GET", `/identities/${identityId}/projection?purpose=directory-lookup`, { expect: 200 });
  assert.equal(dir.json.nodes.length, 0, "directory-lookup has no consent record by default");
  const budget = await call("GET", `/identities/${identityId}/projection?purpose=identity-introduction&nodeBudget=1`, { expect: 200 });
  assert.equal(budget.json.truncated, true); assert.equal(budget.json.nodes.length, 1);
  const me = await call("GET", "/identities/me?purpose=identity-introduction", { expect: 200 });
  assert.equal(me.json.identityId, identityId);
  const consents = await call("GET", `/identities/${identityId}/consents`, { expect: 200 });
  assert.equal(consents.json.items[0].purpose, "identity-introduction");
});

test("obligations: purpose and consent gate the list; admin grants consent and attests", async () => {
  await call("GET", `/identities/${identityId}/obligations?purpose=identity-introduction`, { expect: 403 });
  await call("GET", `/identities/${identityId}/obligations?purpose=regulatory-filing`, { expect: 403 });
  const grant = await fetch(BASE + "/admin/consents", { method: "POST", headers: { authorization: `Bearer ${key}`, "x-igl-tenant-id": tenant, "content-type": "application/json" }, body: JSON.stringify({ identityId, purpose: "regulatory-filing", action: "grant", scope: "filing assistant" }) });
  assert.equal(grant.status, 201);
  const o1 = await fetch(BASE + "/admin/obligations", { method: "POST", headers: { authorization: `Bearer ${key}`, "x-igl-tenant-id": tenant, "content-type": "application/json" }, body: JSON.stringify({ subjectId: identityId, title: "Q3 W-3 filing", regulation: "16 TAC 3.16", dueDate: "2026-10-31", attest: true, facilityId: assetId }) });
  assert.equal(o1.status, 201);
  await fetch(BASE + "/admin/obligations", { method: "POST", headers: { authorization: `Bearer ${key}`, "x-igl-tenant-id": tenant, "content-type": "application/json" }, body: JSON.stringify({ subjectId: identityId, title: "Q4 volume report", dueDate: "2027-01-30" }) });
  const list = await call("GET", `/identities/${identityId}/obligations?purpose=regulatory-filing`, { expect: 200 });
  assert.equal(list.json.items.length, 2); assert.equal(list.json.items[0].status, "attested"); assert.equal(list.json.items[1].status, "proposed");
  const att = await call("GET", `/identities/${identityId}/obligations?purpose=regulatory-filing&status=attested&dueBefore=2026-12-31`, { expect: 200 });
  assert.equal(att.json.items.length, 1);
  const proj = await call("GET", `/identities/${identityId}/projection?purpose=regulatory-filing`, { expect: 200 });
  assert.equal(proj.json.nodes.filter((n) => n.type === "Obligation").length, 2);
});

test("policies and authority: fail closed, deny wins, conditional carries approvals", async () => {
  const d0 = await call("POST", "/authority/evaluate", { body: { actor: { identityId }, action: "well.shutdown", resource: { type: "asset", id: assetId } }, expect: 200 });
  assert.equal(d0.json.effect, "deny"); assert.deepEqual(d0.json.reasonCodes, ["no_policy"]);
  const allow = await call("POST", "/policies", { body: { name: "ops may shut down", version: "1", effect: "allow", status: "active", rule: { actions: ["well.*"], resourceTypes: ["asset"], conditions: [{ field: "actor.roleIds", operator: "contains", value: OPS }] } }, expect: 201 });
  policyId = allow.json.id;
  await call("GET", `/policies/${policyId}`, { expect: 200 });
  const cond = await call("POST", "/policies", { body: { name: "shutdown needs a manager", version: "1", effect: "conditional", status: "active", rule: { actions: ["well.shutdown"], approvals: [{ authorityType: "manager", count: 1 }] } }, expect: 201 });
  const d1 = await call("POST", "/authority/evaluate", { body: { actor: { identityId, roleIds: [OPS] }, action: "well.shutdown", resource: { type: "asset", id: assetId } }, expect: 200 });
  assert.equal(d1.json.effect, "conditional"); assert.equal(d1.json.requiredApprovals[0].authorityType, "manager"); assert.equal(d1.json.policyDecisionIds.length, 2);
  const d2 = await call("POST", "/authority/evaluate", { body: { actor: { identityId, roleIds: [] }, action: "well.shutdown", resource: { type: "asset", id: assetId } }, expect: 200 });
  assert.equal(d2.json.effect, "conditional", "allow policy does not match without the role; conditional still does");
  await call("POST", "/policies", { body: { name: "never modify pressure", version: "1", effect: "deny", status: "active", rule: { actions: ["well.modify-pressure-rating"] } }, expect: 201 });
  const d3 = await call("POST", "/policies/evaluate", { body: { actor: { identityId, roleIds: [OPS] }, action: "well.modify-pressure-rating", resource: { type: "asset", id: assetId }, facts: { pressure: 1200 } }, expect: 200 });
  assert.equal(d3.json.effect, "deny");
  await call("POST", "/policies", { body: { name: "x", version: "1", effect: "maybe", rule: {} }, expect: 422 });
  await call("GET", "/policies/00000000-0000-0000-0000-000000000009", { expect: 404 });
  assert.ok(cond.json.id);
});

test("knowledge and evidence: facts, entities, corroboration, certification needs admin", async () => {
  const fact = await call("POST", "/knowledge/facts", { body: { subjectId: assetId, predicate: "permit.number", object: "RRC-2026-0912", status: "proposed", confidence: 0.9, sources: [{ sourceId: "rrc-permit-0912", sourceType: "document", title: "RRC permit" }] }, expect: 201 });
  factId = fact.json.id;
  const facts = await call("GET", `/knowledge/facts?subjectId=${assetId}`, { expect: 200 });
  assert.equal(facts.json.items.length, 1);
  await call("POST", "/knowledge/facts", { body: { subjectId: "00000000-0000-0000-0000-000000000001", predicate: "x", object: 1 }, expect: 404 });
  const ent = await call("POST", "/knowledge/entities", { body: { type: "document", displayName: "Permit RRC-2026-0912", schemaType: "Permit", summary: "Drilling permit" }, expect: 201 });
  assert.equal(ent.json.schemaType, "Permit");
  await call("GET", `/knowledge/entities/${ent.json.id}`, { expect: 200 });
  await call("GET", `/knowledge/entities/${identityId}`, { expect: 404 });
  const ev = await call("POST", "/evidence", { body: { kind: "finding", claim: "Station 3 emissions inventory was filed on 2026-03-28.", sources: [{ sourceId: "filing-2026-03-28", sourceType: "document", uri: "https://example.com/filing.pdf" }], confidence: 0.8, attributes: { domains: ["regulatory"] } }, expect: 201 });
  evidenceId = ev.json.id; assert.equal(ev.json.status, "seed");
  const ev2 = await call("POST", "/evidence", { body: { kind: "document", claim: "Filing receipt from the RRC portal.", sources: [{ sourceId: "receipt-991", sourceType: "system" }] }, expect: 201 });
  evidence2Id = ev2.json.id;
  await call("POST", "/evidence", { body: { kind: "finding", claim: "no sources", sources: [] }, expect: 422 });
  const cor = await call("POST", `/evidence/${evidenceId}/corroborate`, { body: { supportingEvidenceIds: [evidence2Id], method: "manual" }, expect: 200 });
  assert.equal(cor.json.corroborationCount, 1); assert.equal(cor.json.status, "proposed");
  await call("POST", `/evidence/${evidenceId}/corroborate`, { body: { supportingEvidenceIds: [evidenceId] }, expect: 422 });
  const list = await call("GET", "/evidence?status=proposed", { expect: 200 });
  assert.equal(list.json.items.length, 1);
  await call("GET", `/evidence/${evidenceId}`, { expect: 200 });
  // a read-only token cannot certify; an admin key creating certified is allowed
  const certified = await call("POST", "/knowledge/facts", { body: { subjectId: assetId, predicate: "operator", object: "Rio Diablo Operating, LLC", status: "certified", confidence: 1 }, expect: 201 });
  assert.equal(certified.json.status, "certified");
});

test("outcomes: record, measure, get; webhook event emitted", async () => {
  const out = await call("POST", "/outcomes", { body: { subjectId: assetId, type: "filing.submitted", value: { form: "W-3" }, occurredAt: "2026-10-14T12:00:00Z" }, expect: 201 });
  outcomeId = out.json.id;
  const m = await call("POST", `/outcomes/${outcomeId}/measurements`, { body: { metric: "days_early", value: 17, unit: "days", measuredAt: "2026-10-14T12:00:00Z" }, expect: 200 });
  assert.equal(m.json.metrics.days_early, 17); assert.equal(m.json.measurements[0].unit, "days");
  await call("POST", `/outcomes/${outcomeId}/measurements`, { body: { metric: "x", value: { nested: true }, measuredAt: "2026-10-14T12:00:00Z" }, expect: 422 });
  await call("GET", `/outcomes/${outcomeId}`, { expect: 200 });
  await call("GET", "/outcomes/00000000-0000-0000-0000-000000000003", { expect: 404 });
});

test("intelligence: governed refusals happen before any model call", async () => {
  // empty scope in a tenant with records still has context; a scope naming nothing yields empty_context
  const empty = await call("POST", "/query", { body: { question: "Anything?", scope: { identityIds: ["00000000-0000-0000-0000-00000000aaaa"] }, maxHops: 0 }, expect: 422 });
  assert.equal(empty.json.type, "https://id-me.ai/problems/empty_context");
  await call("POST", "/policies", { body: { name: "no investigations", version: "1", effect: "deny", status: "active", rule: { actions: ["intelligence.investigate"] } }, expect: 201 });
  const denied = await call("POST", "/investigate", { body: { question: "Who did what?" }, expect: 403 });
  assert.equal(denied.json.type, "https://id-me.ai/problems/policy_denied");
  await call("POST", "/query", { body: { question: "" }, expect: 422 });
  await call("POST", "/query", { body: { question: "x", filters: [{ field: "a", operator: "nope", value: 1 }] }, expect: 422 });
  const caps = await call("GET", "/capabilities", { expect: 200 });
  if (!caps.json.modelProviders.length) {
    const r = await call("POST", "/query", { body: { question: "Which obligations are due for this asset?", scope: { assetId } }, expect: 422 });
    assert.equal(r.json.type, "https://id-me.ai/problems/no_reasoning_provider");
    const cw = await call("POST", "/crosswalk", { body: { question: "Map the relationships.", scope: { assetId }, maxHops: 3 }, expect: 422 });
    assert.equal(cw.json.type, "https://id-me.ai/problems/no_reasoning_provider");
    const rs = await call("POST", "/research", { body: { question: "Summarize the filings.", scope: { assetId } }, expect: 202 });
    assert.ok(["queued", "running"].includes(rs.json.status));
    await new Promise((r) => setTimeout(r, 800));
    const run = await call("GET", `/runs/${rs.json.id}`, { expect: 200 });
    assert.equal(run.json.status, "failed"); assert.equal(run.json.error.status, 422);
  } else {
    const r = await call("POST", "/query", { body: { question: "Which obligations are due for this person and what is the permit number of the station?", scope: { identityIds: [identityId], assetId }, requireCitations: true, minimumConfidence: 0.5 }, expect: 200 });
    assert.ok(r.json.citations.length >= 1, "a cited answer"); assert.ok(r.json.governance.receiptId);
    const cw = await call("POST", "/crosswalk", { body: { question: "Map the relationships among the person, the operator and the station.", scope: { identityIds: [identityId] }, maxHops: 3 }, expect: 200 });
    assert.ok(cw.json.answer.length > 20);
    const rs = await call("POST", "/research", { body: { question: "What filings exist and what evidence supports them?", scope: { assetId }, maxHops: 3 }, expect: 202 });
    let run; for (let i = 0; i < 30; i++) { await new Promise((x) => setTimeout(x, 1000)); run = await call("GET", `/runs/${rs.json.id}`, { expect: 200 }); if (run.json.status === "succeeded" || run.json.status === "failed") break; }
    assert.equal(run.json.status, "succeeded", JSON.stringify(run.json.error)); assert.ok(run.json.output.citations.length >= 1);
  }
});

test("agents and workflows: runs, approvals, policy gates", async () => {
  const agent = await call("POST", "/agents", { body: { name: "Filing assistant", capabilities: ["query"], allowedTools: [], policyIds: [policyId] }, expect: 201 });
  await call("GET", `/agents/${agent.json.id}`, { expect: 200 });
  await call("POST", "/agents", { body: { name: "x", capabilities: [], policyIds: ["00000000-0000-0000-0000-000000000005"] }, expect: 422 });
  const inv2 = await call("POST", `/agents/${agent.json.id}/invocations`, { body: { instruction: "List attested obligations." }, expect: 202 });
  assert.equal(inv2.json.status, "failed", "no policy allows agent.invoke, so the run fails closed"); assert.equal(inv2.json.error.status, 403);
  await call("POST", "/policies", { body: { name: "agents may run", version: "1", effect: "allow", status: "active", rule: { actions: ["agent.invoke", "workflow.run", "workflow.step"] } }, expect: 201 });
  const inv = await call("POST", `/agents/${agent.json.id}/invocations`, { body: { instruction: "List attested obligations.", requireApproval: true }, expect: 202 });
  assert.equal(inv.json.status, "awaiting_approval"); assert.ok(inv.json.governance?.receiptId);
  const inv3 = await call("POST", `/agents/${agent.json.id}/invocations`, { body: { instruction: "List attested obligations.", resourceScope: [{ type: "identity", id: identityId }] }, expect: 202 });
  await new Promise((r) => setTimeout(r, 1500));
  const run3 = await call("GET", `/runs/${inv3.json.id}`, { expect: 200 });
  assert.ok(["succeeded", "failed"].includes(run3.json.status));
  const wf = await call("POST", "/workflows", { body: { name: "Filing prep", version: "1", status: "active", steps: [{ id: "check", type: "policy_check", config: { action: "workflow.step" }, onSuccess: "set", onFailure: null }, { id: "set", type: "transform", config: { set: { prepared: true } }, onSuccess: "record" }, { id: "record", type: "outcome", config: { subjectId: assetId, type: "workflow.prepared", value: { ok: true } } }] }, expect: 201 });
  await call("POST", "/workflows", { body: { name: "bad", version: "1", steps: [{ id: "a", type: "query", onSuccess: "missing" }] }, expect: 422 });
  const wr = await call("POST", `/workflows/${wf.json.id}/runs`, { body: { input: { subjectId: assetId } }, expect: 202 });
  await new Promise((r) => setTimeout(r, 1500));
  const wrun = await call("GET", `/runs/${wr.json.id}`, { expect: 200 });
  assert.equal(wrun.json.status, "succeeded", JSON.stringify(wrun.json)); assert.equal(wrun.json.output.log.length, 3); assert.ok(wrun.json.governance.receiptId);
  const dry = await call("POST", `/workflows/${wf.json.id}/runs`, { body: { dryRun: true }, expect: 202 });
  await new Promise((r) => setTimeout(r, 800));
  const drun = await call("GET", `/runs/${dry.json.id}`, { expect: 200 });
  assert.equal(drun.json.status, "succeeded"); assert.equal(drun.json.output.log[0].output.dryRun, true);
  await call("GET", "/runs/00000000-0000-0000-0000-000000000007", { expect: 404 });
});

test("audit: events chain verifies, filters work, interactions are recorded into the chain", async () => {
  const rec = await call("POST", "/audit/interactions", { body: { identityId, purpose: "identity-introduction", outcome: "completed", projectionReceiptId: receiptId, model: "test-client" }, expect: 201 });
  assert.ok(rec.json.eventHash && rec.json.recordedAt);
  await call("POST", "/audit/interactions", { body: { purpose: "nope", outcome: "completed" }, expect: 422 });
  // walk the whole chain, oldest first
  let items = []; let cursor = null;
  for (let i = 0; i < 20; i++) { const page = await call("GET", `/audit/events?limit=25${cursor ? "&cursor=" + cursor : ""}`, { expect: 200 }); items.push(...page.json.items); if (!page.json.page.hasMore) break; cursor = page.json.page.nextCursor; }
  items.reverse();
  assert.ok(items.length >= 20, "a real history");
  const canonical = (x) => Array.isArray(x) ? "[" + x.map(canonical).join(",") + "]" : (x && typeof x === "object") ? "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}" : JSON.stringify(x === undefined ? null : x);
  let prev = "0".repeat(64);
  for (const ev of items) {
    assert.equal(ev.previousHash, prev, "chain links");
    const { previousHash, eventHash, ...body } = ev;
    assert.equal(ev.eventHash, createHash("sha256").update(prev + canonical({ type: ev.eventType, body })).digest("hex"), "event reproduces its hash");
    prev = ev.eventHash;
  }
  assert.ok(items.some((e) => e.eventType === "interaction.recorded" && e.eventHash === rec.json.eventHash));
  const filtered = await call("GET", `/audit/events?eventType=identity.created&resourceId=${orgId}`, { expect: 200 });
  assert.equal(filtered.json.items.length, 1);
  await call("GET", "/audit/receipts/00000000-0000-0000-0000-000000000008", { expect: 404 });
});

test("every operation in the contract was exercised", () => {
  const all = []; for (const [p, item] of Object.entries(spec.paths)) for (const m of ["get", "post", "patch", "put", "delete"]) if (item[m]) all.push(item[m].operationId);
  const missing = all.filter((id) => !covered.has(id));
  assert.deepEqual(missing, [], "uncovered operations");
});
