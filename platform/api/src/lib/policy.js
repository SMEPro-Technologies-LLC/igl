/* Policy and authority evaluation.

   A Policy's `rule` is a plain object the service understands:
     {
       "actions":       ["intelligence.query", "identity.read", "*"],     glob on action
       "resourceTypes": ["identity", "asset", "*"],
       "conditions":    [{ "field": "actor.roleIds", "operator": "contains", "value": "<roleId>" }, ...],
       "approvals":     [{ "authorityType": "manager", "count": 1 }],   for effect conditional / escalate
       "obligations":   ["record-interaction"],
       "reasonCode":    "optional short code"
     }
   `scope` narrows the policy to a subset of the tenant (for example
   { "jurisdictions": ["US-TX"] }) and is matched against context.jurisdiction.

   Evaluation order is fixed: every active policy whose actions, resource
   types, scope and conditions match contributes; deny wins over escalate,
   escalate over conditional, conditional over allow. With no matching policy
   the answer is deny with reason code no_policy, except for the built-in
   read actions, the intelligence operations (which only ever read
   admitted records) and the subject controls (a person's pause, forget,
   reset and export over their own record), so a fresh tenant can use its
   own graph and a person can exercise their controls without a policy
   first permitting it; a policy can still deny or escalate any of them. Anything
   that acts (agent.invoke, workflow.run, and every custom action) fails
   closed until a policy allows it. */

import { nowIso, uuid } from "./http.js";
import { sha256, canonical } from "./crypto.js";

/* What a policy said at the moment it was evaluated: effect, scope, rule and
   validity window, hashed. Policies cannot be edited in place (schema
   triggers), so the hash is stable for the life of the row, and a decision
   that carries it can be checked against the policy it cites. */
export function policyRuleHash(p) { return sha256(canonical({ effect: p.effect, scope: p.scope || {}, rule: p.rule || {}, effectiveFrom: p.effectiveFrom ?? null, effectiveTo: p.effectiveTo ?? null })); }

const RANK = { deny: 4, escalate: 3, conditional: 2, allow: 1 };
const DEFAULT_ALLOW = new Set(["identity.read", "projection.read", "graph.read", "knowledge.read", "audit.read", "intelligence.query", "intelligence.research", "intelligence.crosswalk", "intelligence.investigate", "subject.pause", "subject.resume", "subject.forget", "subject.reset", "subject.export"]);

function glob(pattern, value) {
  if (pattern === "*" || pattern === value) return true;
  if (pattern.endsWith(".*")) return value.startsWith(pattern.slice(0, -1));
  return false;
}
function getPath(obj, path) { return path.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj); }

export function conditionHolds(cond, ctx) {
  const v = getPath(ctx, cond.field);
  const t = cond.value;
  switch (cond.operator) {
    case "eq": return v === t;
    case "ne": return v !== t;
    case "in": return Array.isArray(t) && t.includes(v);
    case "not_in": return Array.isArray(t) && !t.includes(v);
    case "gt": return v > t; case "gte": return v >= t; case "lt": return v < t; case "lte": return v <= t;
    case "contains": return Array.isArray(v) ? v.includes(t) : typeof v === "string" && v.includes(String(t));
    case "exists": return (v !== undefined && v !== null) === (t !== false);
    case "between": return Array.isArray(t) && v >= t[0] && v <= t[1];
    default: return false;
  }
}

function policyMatches(p, { action, resource, context }) {
  const rule = p.rule || {};
  const actions = rule.actions || ["*"];
  if (!actions.some((a) => glob(a, action))) return false;
  const types = rule.resourceTypes || ["*"];
  if (!types.some((t) => glob(t, resource?.type || ""))) return false;
  if (p.scope?.jurisdictions?.length && !p.scope.jurisdictions.includes(context?.jurisdiction)) return false;
  if (p.scope?.resourceIds?.length && !p.scope.resourceIds.includes(resource?.id)) return false;
  const now = Date.now();
  if (p.effectiveFrom && Date.parse(p.effectiveFrom) > now) return false;
  if (p.effectiveTo && Date.parse(p.effectiveTo) < now) return false;
  for (const c of rule.conditions || []) if (!conditionHolds(c, context)) return false;
  return true;
}

export function evaluate(policies, { actor, action, resource, context = {}, facts = {} }) {
  const ctx = { actor, action, resource, facts, ...context };
  const matched = policies.filter((p) => p.status === "active" && policyMatches(p, { action, resource, context: ctx }));
  let effect = null; const reasonCodes = []; const requiredApprovals = []; const obligations = new Set(); const ids = []; const policiesMatched = [];
  for (const p of matched) {
    ids.push(p.id);
    policiesMatched.push({ id: p.id, name: p.name, version: p.version, effect: p.effect, ruleHash: policyRuleHash(p) });
    if (!effect || RANK[p.effect] > RANK[effect]) effect = p.effect;
    if (p.rule?.reasonCode) reasonCodes.push(p.rule.reasonCode); else reasonCodes.push(`${p.effect}:${p.name}`);
    for (const a of p.rule?.approvals || []) requiredApprovals.push({ authorityType: a.authorityType, roleId: a.roleId ?? null, identityId: a.identityId ?? null, count: a.count ?? 1 });
    for (const o of p.rule?.obligations || []) obligations.add(o);
  }
  if (!effect) {
    effect = DEFAULT_ALLOW.has(action) ? "allow" : "deny";
    reasonCodes.push(effect === "allow" ? "default_allow" : "no_policy");
  }
  return {
    decisionId: uuid(), effect, reasonCodes, requiredApprovals: effect === "allow" || effect === "deny" ? [] : requiredApprovals,
    obligations: [...obligations], evaluatedAt: nowIso(), policyDecisionIds: ids,
    /* the narrow record an auditor asks for: which rules fired, as they stood, on which identity and which object */
    policiesMatched,
    subject: { action, resourceType: resource?.type ?? null, resourceId: resource?.id ?? null, identityId: actor?.identityId ?? null, organizationId: actor?.organizationId ?? null, roleIds: actor?.roleIds ?? [] },
  };
}

export function rowToPolicy(r) {
  return { id: r.id, name: r.name, version: r.version, description: r.description, effect: r.effect, status: r.status, scope: JSON.parse(r.scope || "{}"), rule: JSON.parse(r.rule || "{}"), effectiveFrom: r.effective_from, effectiveTo: r.effective_to };
}

export async function activePolicies(db, tenantId) {
  const { results } = await db.prepare("SELECT * FROM policies WHERE tenant_id = ?1 AND status = 'active'").bind(tenantId).all();
  return results.map(rowToPolicy);
}
