/* Finix, the billing system of record for every application: the SMEPro
   Technologies merchant on the smeprotech.com account. Same API conventions
   as Ricorsa's src/lib/finix.ts, in plain JavaScript for the console.

   Secrets on the ops Worker: FINIX_USERNAME and FINIX_PASSWORD (the API key
   pair from the Finix dashboard) and FINIX_ENV (live unless "sandbox"). The
   console never sees a card number: cards are collected in each application
   with Finix.js, and the console reads plans, subscriptions and transfers
   and creates plans from the catalog. */

export const FINIX_VERSION = "2022-02-01";

export const finixConfigured = (env) => Boolean(env.FINIX_USERNAME && env.FINIX_PASSWORD);
export const finixEnv = (env) => (env.FINIX_ENV === "sandbox" ? "sandbox" : "live");
export const finixBase = (env) => env.FINIX_BASE_URL || (finixEnv(env) === "live" ? "https://finix.live-payments-api.com" : "https://finix.sandbox-payments-api.com");

export class FinixError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

async function api(env, path, init = {}) {
  if (!finixConfigured(env)) throw new FinixError(503, "FINIX_USERNAME / FINIX_PASSWORD are not set on the ops Worker", "unconfigured");
  const url = /^https?:/.test(path) ? path : finixBase(env) + path;
  const res = await fetch(url, { ...init, headers: { authorization: "Basic " + btoa(`${env.FINIX_USERNAME}:${env.FINIX_PASSWORD}`), "content-type": "application/json", "finix-version": FINIX_VERSION, ...(init.headers || {}) }, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 600); let code;
    try { const j = JSON.parse(text); const e = j._embedded?.errors?.[0]; message = e?.message || j.message || message; code = e?.code || j.code; } catch { /* raw text */ }
    throw new FinixError(res.status, `Finix ${init.method || "GET"} ${path}: ${res.status} ${message}`, code);
  }
  return text ? JSON.parse(text) : {};
}

async function listAll(env, path, key, maxPages = 5) {
  const out = []; let next = path;
  for (let i = 0; i < maxPages && next; i++) {
    const page = await api(env, next);
    const items = page._embedded?.[key] || Object.values(page._embedded || {})[0] || [];
    out.push(...items);
    const cursor = page.page?.next_cursor;
    next = cursor ? `${path}${path.includes("?") ? "&" : "?"}after_cursor=${encodeURIComponent(cursor)}` : (page._links?.next?.href && page._links.next.href !== next ? page._links.next.href : null);
    if (!items.length) break;
  }
  return out;
}

export const listPlans = (env) => listAll(env, "/subscription_plans?limit=100", "subscription_plans");
export const listMerchants = (env) => listAll(env, "/merchants?limit=20", "merchants", 2);
export const listSubscriptions = (env) => listAll(env, "/subscriptions?limit=100", "subscriptions", 10);
export const listTransfers = (env, limit = 100) => listAll(env, `/transfers?limit=${limit}`, "transfers", 3);
export const getSubscription = (env, id) => api(env, `/subscriptions/${encodeURIComponent(id)}`);
export const getIdentity = (env, id) => api(env, `/identities/${encodeURIComponent(id)}`);

/** A monthly evergreen plan for an application tier, tagged with the application and tier so the console can find it again. */
export function createPlan(env, { merchantId, appId, tier, name, description, amountCents, trialDays = 0 }) {
  return api(env, "/subscription_plans", { method: "POST", body: JSON.stringify({
    plan_name: name, description: description.slice(0, 200), amount: amountCents, currency: "USD", billing_interval: "MONTHLY",
    linked_to: merchantId, linked_type: "MERCHANT", duration_type: "EVERGREEN",
    trial_defaults: trialDays > 0 ? { interval_type: "DAY", interval_count: trialDays } : null,
    billing_defaults: { collection_method: "BILL_AUTOMATICALLY", send_invoice: false, send_receipt: true },
    tags: { app: appId, tier, managed_by: "ops.id-me.ai" },
  }) });
}

export async function cancelSubscription(env, id) {
  try { return await api(env, `/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ state: "CANCELED" }) }); }
  catch (e) { if (e.status === 404 || e.status === 405 || /already|cancel/i.test(e.message)) return getSubscription(env, id); throw e; }
}

/** The merchant that processes: the one the existing plans are linked to, else the first with processing enabled. */
export async function resolveMerchant(env, plans) {
  const linked = plans.find((p) => p.linked_to)?.linked_to; if (linked) return linked;
  const ms = await listMerchants(env);
  return (ms.find((m) => m.processing_enabled !== false) || ms[0])?.id || null;
}

export function subscriptionStatusOf(s) {
  const st = String(s.state || "").toUpperCase();
  if (st === "ACTIVE") return s.subscription_phase === "TRIAL" ? "trialing" : "active";
  if (st === "CANCELED" || st === "CANCELLED") return "canceled";
  if (st === "COMPLETED") return "completed";
  return st.toLowerCase() || "unknown";
}
export function nextBillingOf(s) {
  const d = s.next_billing_date; if (!d) return null;
  if (typeof d === "string") return d;
  if (d.year && d.month && d.day) return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
  return null;
}
