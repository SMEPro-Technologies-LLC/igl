/* Billing across the portfolio: the plan catalog every application sells,
   kept in Finix as subscription plans tagged with the application and tier;
   the subscriptions and transfers Finix holds, grouped by application; and
   the metered items each application charges for.

   The catalog below is the source of truth for what is sold. "Sync plans"
   from the console creates in Finix any catalog plan that does not exist
   yet (matched by the app and tier tags, then by name and amount) and
   never changes or archives an existing plan: a price change is a new tier
   id, so subscribers on the old price keep it until they move.

   Metered items are billed by the applications themselves as Finix
   transfers against the card on file (the way Ricorsa charges gas), with
   the application, the customer and the meter in the transfer's tags, so
   the console can total them per customer. */

import { finixConfigured, finixEnv, listPlans, listSubscriptions, listTransfers, createPlan, resolveMerchant, subscriptionStatusOf, nextBillingOf, cancelSubscription } from "./finix.js";

/* ---------------- the catalog (prices approved October 16, 2026) ---------------- */

export const CATALOG = {
  ricorsa: {
    model: "prepaid",
    note: "Prepaid since October 7, 2026: 500 gas at signup, recharges from $20 to $5,000 at 40 gas per dollar by card on file (Finix) or PayPal, auto-recharge. The Essentials and Professional plans are retired; existing subscribers keep them until they cancel.",
    plans: [],
    meters: [{ id: "gas", name: "Gas", unit: "gas", usd_per_unit: 0.025, note: "1 gas per question on Fast or Best, 3 on Reasoning, 10 per Research report, 25 per Discover set, 250 per Build version, 1 per browser action or minute" }],
  },
  tortplus: {
    model: "subscription",
    plans: [
      { tier: "pilot", name: "Pilot", amount_cents: 0, description: "TortPlus. Pay per CDIP package at $250; no monthly fee.", included: { cdip: 0 } },
      { tier: "practice", name: "Practice", amount_cents: 45000, description: "TortPlus. Two CDIP packages a month included, $200 each after.", included: { cdip: 2 } },
      { tier: "firm", name: "Firm", amount_cents: 125000, description: "TortPlus. Eight CDIP packages a month included, $200 each after.", included: { cdip: 8 } },
      { tier: "archive", name: "Archive retention", amount_cents: 15000, description: "TortPlus. Transcript and finding archive retained past the matter.", addon: true },
    ],
    meters: [
      { id: "cdip", name: "CDIP package", unit: "package", usd_per_unit: 200, first_unit_usd: 250, note: "$250 on Pilot; $200 beyond the plan's included packages" },
      { id: "model", name: "Model usage", unit: "USD of provider cost", usd_per_unit: 1.3, note: "provider cost plus 30%, from the usage meter the Worker already keeps" },
    ],
  },
  tortgraph: {
    model: "subscription",
    plans: [
      { tier: "analyst", name: "Analyst", amount_cents: 19500, description: "Tortgraph.ai. 500 graph queries a month.", included: { query: 500 } },
      { tier: "firm", name: "Firm", amount_cents: 65000, description: "Tortgraph.ai. 3,000 graph queries a month.", included: { query: 3000 } },
    ],
    meters: [{ id: "query", name: "Graph query", unit: "query", usd_per_unit: 0.5 }],
  },
  vdrpros: {
    model: "subscription",
    plans: [
      { tier: "essentials", name: "Essentials", amount_cents: 29900, description: "VDRPros. One data room, 50 GB.", included: { gb: 50 } },
      { tier: "professional", name: "Professional", amount_cents: 59900, description: "VDRPros. Five data rooms, 250 GB, Q&A and audit export.", included: { gb: 250 } },
      { tier: "enterprise", name: "Enterprise", amount_cents: 149900, description: "VDRPros. Unlimited rooms, 1 TB, SSO and custom retention.", included: { gb: 1000 } },
    ],
    meters: [{ id: "gb", name: "Storage", unit: "GB-month", usd_per_unit: 0.1 }],
  },
  wellsite: {
    model: "subscription",
    plans: [
      { tier: "essentials", name: "Essentials", amount_cents: 42500, description: "Wellsite", existing: true },
      { tier: "flex", name: "Flex", amount_cents: 57500, description: "WellSite", existing: true },
      { tier: "enterprise", name: "Enterprise", amount_cents: 120000, description: "WellSite. Reporting in all 30 states, EDI and hard-copy filing, compliance calendar, data room, unlimited field and office users." },
    ],
    meters: [],
  },
  wellreporter: {
    model: "subscription",
    plans: [
      { tier: "reporter", name: "Reporter", amount_cents: 10000, description: "Per Report. Pay-As-You-Go.", existing: true },
      { tier: "operator", name: "Operator", amount_cents: 45000, description: "All Districts / All Reports", existing: true },
      { tier: "enterprise", name: "Enterprise", amount_cents: 120000, description: "WellReporter. All districts, all reports, enforcement docket monitoring, unlimited users." },
    ],
    meters: [{ id: "report", name: "Report", unit: "report", usd_per_unit: 100, note: "on Reporter" }],
  },
  leasexplorer: {
    model: "subscription",
    plans: [
      { tier: "explorer", name: "Explorer", amount_cents: 35000, description: "LeaseXplorer. Early lease discovery, deal sourcing, pipeline and records; 500 agent runs a month.", included: { run: 500 } },
      { tier: "pipeline", name: "Pipeline", amount_cents: 90000, description: "LeaseXplorer. The whole acquisition life cycle: discovery, pipeline, VDR, field capture, land accounting, partner portal; 2,500 agent runs a month.", included: { run: 2500 } },
    ],
    meters: [{ id: "run", name: "Agent run", unit: "run", usd_per_unit: 0.25 }],
  },
  realechat: {
    model: "subscription",
    plans: [
      { tier: "agent", name: "Agent", amount_cents: 7900, description: "RealEChat. One agent, live listings and market numbers; 25 lead credits a month.", included: { lead: 25 } },
      { tier: "broker", name: "Broker", amount_cents: 24900, description: "RealEChat. A brokerage, every agent, exposure you own; 150 lead credits a month.", included: { lead: 150 } },
    ],
    meters: [{ id: "lead", name: "Lead credit", unit: "lead", usd_per_unit: 2 }],
  },
  idme: {
    model: "subscription",
    plans: [
      { tier: "developer", name: "Developer", amount_cents: 9900, description: "ID-ME.ai. 100,000 governed operations a month.", included: { op: 100000 } },
      { tier: "business", name: "Business", amount_cents: 49900, description: "ID-ME.ai. 1,000,000 governed operations a month.", included: { op: 1000000 } },
    ],
    meters: [{ id: "op", name: "Governed operations", unit: "1,000 operations", usd_per_unit: 0.5 }],
    note: "The sandbox is free. Enterprise is by contract through Contact Sales.",
  },
  realstarglobal: { model: "unpriced", plans: [], meters: [], note: "Not priced yet: tell the console what RealStar Global sells." },
  ailu: { model: "none", plans: [], meters: [], note: "No billing: a Lamar University custom application under contract." },
  luconcourse: { model: "none", plans: [], meters: [], note: "No billing: a Lamar University custom application under contract." },
  toxictort: { model: "none", plans: [], meters: [], note: "No billing: a practice site." },
  smeprotech: { model: "none", plans: [], meters: [], note: "No billing: the company site and the merchant of record." },
  smeprotec: { model: "none", plans: [], meters: [], note: "No billing: the company site." },
};

/* ---------------- matching catalog to Finix ---------------- */

const planKey = (appId, tier) => `${appId}:${tier}`;
const norm = (s) => String(s || "").trim().toLowerCase();

/* A Finix plan belongs to a catalog entry by its tags (app and tier), or, for the plans created by hand before the
   console existed, by plan name and amount with the application named in the description. */
export function matchPlans(finixPlans) {
  const byKey = {};
  for (const [appId, cat] of Object.entries(CATALOG)) for (const p of cat.plans) {
    const tagged = finixPlans.find((f) => f.tags?.app === appId && f.tags?.tier === p.tier && f.state !== "ARCHIVED");
    const named = tagged || finixPlans.find((f) => f.state !== "ARCHIVED" && norm(f.plan_name) === norm(p.name) && Number(f.amount) === p.amount_cents && (norm(f.description).includes(appId.replace(/-/g, "")) || norm(f.description).includes(norm(p.description).split(".")[0]) || (p.existing && norm(f.description).includes(norm(p.description)))));
    byKey[planKey(appId, p.tier)] = named || null;
  }
  return byKey;
}

export async function billingOverview(env) {
  const out = { configured: finixConfigured(env), env: finixEnv(env), catalog: CATALOG };
  if (!out.configured) { out.why = "FINIX_USERNAME and FINIX_PASSWORD are not set on the ops Worker; set them in Workers & Pages, igl-ops, Settings, Variables and Secrets"; return out; }
  try {
    const [plans, subs, transfers] = await Promise.all([listPlans(env), listSubscriptions(env), listTransfers(env, 100)]);
    const matched = matchPlans(plans);
    out.merchant = await resolveMerchant(env, plans);
    out.finixPlans = plans.map((p) => ({ id: p.id, name: p.plan_name, description: p.description, amount_cents: p.amount, state: p.state, interval: p.billing_interval, tags: p.tags || {}, created_at: p.created_at }));
    out.apps = {};
    for (const [appId, cat] of Object.entries(CATALOG)) {
      const rows = cat.plans.map((p) => { const f = matched[planKey(appId, p.tier)]; return { ...p, finix_id: f?.id || null, finix_state: f?.state || null, in_finix: !!f }; });
      const planIds = new Set(rows.filter((r) => r.finix_id).map((r) => r.finix_id));
      const appSubs = subs.filter((s) => s.tags?.app === appId || (s.subscription_plan_id && planIds.has(s.subscription_plan_id)));
      const appTransfers = transfers.filter((t) => t.tags?.app === appId);
      out.apps[appId] = {
        model: cat.model, note: cat.note || null, meters: cat.meters, plans: rows,
        missing: rows.filter((r) => !r.in_finix).length,
        subscriptions: appSubs.map((s) => ({ id: s.id, status: subscriptionStatusOf(s), plan_id: s.subscription_plan_id, plan: rows.find((r) => r.finix_id === s.subscription_plan_id)?.name || null, amount_cents: s.amount, customer: s.tags?.customer || s.tags?.user || s.buyer_details?.identity_id || null, email: s.tags?.email || null, nickname: s.nickname, next_billing: nextBillingOf(s), created_at: s.created_at })),
        transfers: appTransfers.slice(0, 50).map((t) => ({ id: t.id, state: t.state, amount_cents: t.amount, meter: t.tags?.meter || t.tags?.kind || null, qty: t.tags?.qty || t.tags?.gas || null, customer: t.tags?.customer || t.tags?.user || t.tags?.ricorsa_user || null, created_at: t.created_at })),
        mrr_cents: appSubs.filter((s) => subscriptionStatusOf(s) === "active").reduce((a, s) => a + (Number(s.amount) || rows.find((r) => r.finix_id === s.subscription_plan_id)?.amount_cents || 0), 0),
      };
    }
    out.unassigned = { subscriptions: subs.filter((s) => !Object.values(out.apps).some((a) => a.subscriptions.some((x) => x.id === s.id))).length, transfers: transfers.filter((t) => !t.tags?.app).length };
  } catch (e) { out.error = e.message; }
  return out;
}

/* Create every catalog plan that Finix does not have yet. Returns what was created and what already existed. */
export async function syncPlans(env, onlyApp) {
  if (!finixConfigured(env)) return { error: "Finix is not configured on the ops Worker", status: 503 };
  const plans = await listPlans(env); const matched = matchPlans(plans);
  const merchant = await resolveMerchant(env, plans);
  if (!merchant) return { error: "no merchant with processing enabled on this Finix account", status: 503 };
  const created = [], existing = [], failed = [];
  for (const [appId, cat] of Object.entries(CATALOG)) {
    if (onlyApp && appId !== onlyApp) continue;
    for (const p of cat.plans) {
      const key = planKey(appId, p.tier);
      if (matched[key]) { existing.push({ app: appId, tier: p.tier, finix_id: matched[key].id }); continue; }
      if (p.amount_cents <= 0) { existing.push({ app: appId, tier: p.tier, finix_id: null, note: "no monthly charge; nothing to create" }); continue; }
      try {
        const f = await createPlan(env, { merchantId: merchant, appId, tier: p.tier, name: p.name, description: p.description, amountCents: p.amount_cents, trialDays: p.trial_days || 0 });
        created.push({ app: appId, tier: p.tier, finix_id: f.id, amount_cents: p.amount_cents });
      } catch (e) { failed.push({ app: appId, tier: p.tier, error: e.message }); }
    }
  }
  return { ok: failed.length === 0, merchant, created, existing, failed };
}

export async function cancelAppSubscription(env, id) {
  if (!finixConfigured(env)) return { error: "Finix is not configured on the ops Worker", status: 503 };
  const s = await cancelSubscription(env, id);
  return { ok: true, id: s.id, status: subscriptionStatusOf(s) };
}

/* The price list an application serves to its own customers: what to show on a pricing page, from one source. */
export function priceList(appId) {
  const cat = CATALOG[appId]; if (!cat) return null;
  return { app: appId, model: cat.model, note: cat.note || null, plans: cat.plans.map((p) => ({ tier: p.tier, name: p.name, monthly_usd: p.amount_cents / 100, description: p.description, included: p.included || {}, addon: !!p.addon })), meters: cat.meters };
}
