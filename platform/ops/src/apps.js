/* The application portfolio: every live product SMEPro operates, managed
   from this console.

   One registry entry per application. An entry names the domain, the
   Cloudflare Worker that serves it and the D1 binding that holds its
   customers. An adapter per store reads that store's own tables (read
   only, never copied) and answers four questions in one shape for every
   application: who the customers are, who is signed in and when they
   signed in and out, what they used, and what plan they are on. An
   application whose store is not bound yet, or that keeps no sessions,
   says so on the console instead of showing an empty table.

   Writes are limited to what an operator does on purpose and are logged in
   the console's own tables (ops_* in the INTAKE database): a plan change on
   a customer, a note, and events posted by an application to /ingest. */

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const iso = (v) => (v === null || v === undefined || v === "") ? null : (typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v).toISOString() : String(v));

/* ---------------- registry ---------------- */

export const APPS = [
  { id: "wellreporter", name: "WellReporter", domain: "wellreporter.com", worker: "wellreporter-landing", store: null, kind: "energy intelligence" },
  { id: "wellsite", name: "WellSite", domain: "wellsite.app", worker: null, store: null, kind: "regulatory reporting and GIS" },
  { id: "leasexplorer", name: "LeaseXplorer", domain: "leasexplorer.com", worker: null, store: null, kind: "land and lease pipeline" },
  { id: "toxictort", name: "ToxicTort", domain: "toxictort.us", worker: null, store: null, kind: "toxic tort practice" },
  { id: "tortplus", name: "TortPlus", domain: "tortplus.com", worker: "tortplus", store: "TORTGRAPH", kind: "deposition evidence intelligence" },
  { id: "tortgraph", name: "Tortgraph", domain: "tortgraph.ai", worker: "tortgraph", store: "TORTGRAPH", kind: "defendant relationship graph" },
  { id: "vdrpros", name: "VDRPros", domain: "vdrpros.com", worker: "vdrpros", store: "VDRPROS", kind: "virtual data room" },
  { id: "realechat", name: "RealEChat", domain: "realechat.com", worker: "realechat", store: null, kind: "real estate leads and exposure" },
  { id: "realstarglobal", name: "RealStar Global", domain: "realstarglobal.com", worker: null, store: null, kind: "real estate" },
  { id: "idme", name: "ID-ME.ai", domain: "id-me.ai", worker: "igl-api", store: "API_PROD", kind: "IGL governed identity platform" },
  { id: "ricorsa", name: "Ricorsa", domain: "ricorsa.com", worker: "ricorsa", store: "RICORSA", kind: "living intelligence", console: "RICORSA_CONSOLE" },
  { id: "smeprotech", name: "SMEProtech", domain: "smeprotech.com", worker: "smepro", store: null, kind: "company site and merchant" },
  { id: "smeprotec", name: "SMEProtec", domain: "smeprotec.com", worker: null, store: null, kind: "company site" },
  { id: "ailu", name: "AILU", domain: "ailu.igl.dev", worker: null, store: null, kind: "igl.dev application" },
  { id: "luconcourse", name: "LU Concourse", domain: "luconcourse.igl.dev", worker: null, store: null, kind: "igl.dev application" },
];

export const appById = (id) => APPS.find((a) => a.id === id) || null;

/* ---------------- adapters ---------------- */

/* Each adapter: { customers(db, q), sessions(db, q), usage(db, q), plans(db), summary(db), setPlan(db, id, plan) }.
   q = { limit, offset, search, days }. Every row is normalized to:
     customer: { id, email, name, org, plan, status, mrr_cents, created_at, last_seen_at, external: {...} }
     session:  { id, customer_id, email, started_at, last_seen_at, ended_at, end_reason, ip, user_agent }
     usage:    { customer_id, period, meter, qty, cost_usd }
*/

const like = (s) => `%${String(s || "").replace(/[%_]/g, (c) => "\\" + c)}%`;

const TORTGRAPH = {
  describe: "accounts, sessions with login and logout, activity log, customer profiles with plan and per-CDIP price, invoices, model usage",
  sessionsKept: true,
  async summary(db) {
    const r = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM accounts) AS customers,
      (SELECT COUNT(*) FROM accounts WHERE status='active') AS active,
      (SELECT COUNT(*) FROM sessions WHERE ended_at IS NULL AND expires_at > ?1) AS signed_in,
      (SELECT COUNT(*) FROM sessions WHERE created_at >= ?2) AS logins_7d,
      (SELECT COUNT(*) FROM tenants) AS tenants,
      (SELECT COALESCE(SUM(total_cents),0) FROM invoices WHERE status='paid') AS paid_cents,
      (SELECT COALESCE(SUM(est_cost_usd),0) FROM model_usage) AS model_cost_usd`).bind(now(), daysAgo(7)).first();
    const plans = (await db.prepare("SELECT plan, COUNT(*) AS n FROM customer_profiles GROUP BY plan").all()).results;
    return { ...r, plans };
  },
  async customers(db, q) {
    const where = q.search ? "WHERE a.email LIKE ?3 ESCAPE '\\' OR a.name LIKE ?3 ESCAPE '\\' OR t.name LIKE ?3 ESCAPE '\\'" : "";
    const sql = `SELECT a.id, a.email, a.name, a.role, a.status, a.created_at, a.last_login_at, a.tenant_id, t.name AS tenant_name,
        p.plan, p.cdip_price_cents, p.archive_subscription, p.firm_name,
        (SELECT COUNT(*) FROM sessions s WHERE s.account_id = a.id) AS sessions,
        (SELECT MAX(last_seen_at) FROM sessions s WHERE s.account_id = a.id) AS last_seen_at
      FROM accounts a LEFT JOIN tenants t ON t.id = a.tenant_id LEFT JOIN customer_profiles p ON p.tenant_id = a.tenant_id ${where}
      ORDER BY COALESCE(a.last_login_at, a.created_at) DESC LIMIT ?1 OFFSET ?2`;
    const stmt = db.prepare(sql); const rows = (await (q.search ? stmt.bind(q.limit, q.offset, like(q.search)) : stmt.bind(q.limit, q.offset)).all()).results;
    return rows.map((r) => ({ id: r.id, email: r.email, name: r.name, org: r.firm_name || r.tenant_name, plan: r.plan || null, status: r.status, mrr_cents: null, created_at: r.created_at, last_seen_at: r.last_seen_at || r.last_login_at,
      external: { role: r.role, tenant_id: r.tenant_id, cdip_price_cents: r.cdip_price_cents, archive_subscription: r.archive_subscription, sessions: r.sessions } }));
  },
  async sessions(db, q) {
    const where = q.customer ? "WHERE s.account_id = ?3" : "";
    const stmt = db.prepare(`SELECT s.id, s.account_id, a.email, s.created_at, s.last_seen_at, s.expires_at, s.ended_at, s.end_reason, s.ip, s.user_agent
      FROM sessions s LEFT JOIN accounts a ON a.id = s.account_id ${where} ORDER BY s.created_at DESC LIMIT ?1 OFFSET ?2`);
    const rows = (await (q.customer ? stmt.bind(q.limit, q.offset, q.customer) : stmt.bind(q.limit, q.offset)).all()).results;
    return rows.map((s) => ({ id: s.id, customer_id: s.account_id, email: s.email, started_at: s.created_at, last_seen_at: s.last_seen_at, ended_at: s.ended_at || (s.expires_at < now() ? s.expires_at : null), end_reason: s.end_reason || (s.ended_at ? null : (s.expires_at < now() ? "expired" : null)), ip: s.ip, user_agent: s.user_agent }));
  },
  async activity(db, q) {
    const where = q.customer ? "WHERE l.account_id = ?3" : "";
    const stmt = db.prepare(`SELECT l.id, l.account_id, a.email, l.at, l.kind, l.detail FROM activity_log l LEFT JOIN accounts a ON a.id = l.account_id ${where} ORDER BY l.at DESC LIMIT ?1 OFFSET ?2`);
    return (await (q.customer ? stmt.bind(q.limit, q.offset, q.customer) : stmt.bind(q.limit, q.offset)).all()).results;
  },
  async usage(db, q) {
    const rows = (await db.prepare(`SELECT tenant_id, substr(at,1,7) AS period, purpose AS meter, COUNT(*) AS calls, SUM(tokens_in) AS tokens_in, SUM(tokens_out) AS tokens_out, SUM(est_cost_usd) AS cost_usd
      FROM model_usage WHERE at >= ?1 GROUP BY tenant_id, period, purpose ORDER BY period DESC LIMIT 500`).bind(daysAgo(q.days)).all()).results;
    return rows.map((r) => ({ customer_id: r.tenant_id, period: r.period, meter: r.meter, qty: r.calls, tokens_in: r.tokens_in, tokens_out: r.tokens_out, cost_usd: r.cost_usd }));
  },
  async plans(db) { return (await db.prepare("SELECT plan, COUNT(*) AS n, AVG(cdip_price_cents) AS avg_cdip_price_cents FROM customer_profiles GROUP BY plan").all()).results; },
  async setPlan(db, customerId, plan) {
    const a = await db.prepare("SELECT tenant_id FROM accounts WHERE id = ?1").bind(customerId).first();
    if (!a?.tenant_id) throw new Error("account has no tenant");
    const r = await db.prepare("UPDATE customer_profiles SET plan = ?1, updated_at = ?2 WHERE tenant_id = ?3").bind(plan, now(), a.tenant_id).run();
    if (!r.meta.changes) throw new Error("no customer profile for this tenant");
    return { tenant_id: a.tenant_id };
  },
};

const RICORSA = {
  describe: "users with plan, subscription and gas balance, subscriptions, per-period usage meters, gas purchases; no session table, last_seen only",
  sessionsKept: false,
  async summary(db) {
    const r = await db.prepare(`SELECT (SELECT COUNT(*) FROM users) AS customers,
      (SELECT COUNT(*) FROM users WHERE plan != 'free') AS paid,
      (SELECT COUNT(*) FROM users WHERE last_seen_at >= ?1) AS active_7d,
      (SELECT COUNT(*) FROM subscriptions WHERE status IN ('ACTIVE','active')) AS active_subscriptions,
      (SELECT COALESCE(SUM(usd_cents),0) FROM gas_purchases WHERE status='completed') AS gas_cents,
      (SELECT COALESCE(SUM(gas_balance),0) FROM users) AS gas_outstanding`).bind(Date.now() - 7 * 864e5).first();
    const plans = (await db.prepare("SELECT plan, COUNT(*) AS n FROM users GROUP BY plan").all()).results;
    return { ...r, plans };
  },
  async customers(db, q) {
    const where = q.search ? "WHERE u.email LIKE ?3 ESCAPE '\\' OR u.name LIKE ?3 ESCAPE '\\'" : "";
    const stmt = db.prepare(`SELECT u.id, u.email, u.name, u.plan, u.subscription_status, u.subscription_provider, u.plan_renews_at, u.billing_cycle, u.gas_balance, u.auto_recharge, u.card_brand, u.card_last_four, u.finix_identity_id, u.created_at, u.last_seen_at,
        (SELECT COUNT(*) FROM threads t WHERE t.user_id = u.id) AS threads
      FROM users u ${where} ORDER BY u.last_seen_at DESC LIMIT ?1 OFFSET ?2`);
    const rows = (await (q.search ? stmt.bind(q.limit, q.offset, like(q.search)) : stmt.bind(q.limit, q.offset)).all()).results;
    return rows.map((r) => ({ id: r.id, email: r.email, name: r.name, org: null, plan: r.plan, status: r.subscription_status || (r.plan === "free" ? "free" : "unknown"), mrr_cents: null, created_at: iso(r.created_at), last_seen_at: iso(r.last_seen_at),
      external: { provider: r.subscription_provider, renews_at: iso(r.plan_renews_at), billing_cycle: r.billing_cycle, gas_balance: r.gas_balance, auto_recharge: !!r.auto_recharge, card: r.card_brand ? `${r.card_brand} ${r.card_last_four}` : null, finix_identity_id: r.finix_identity_id, threads: r.threads } }));
  },
  async sessions() { return null; },
  async usage(db, q) {
    const where = q.customer ? "WHERE user_id = ?1" : "";
    const stmt = db.prepare(`SELECT user_id, period, questions, research, searches, builds, ideas, browser_actions, gas, tokens_in, tokens_out, cost_micros FROM usage ${where} ORDER BY period DESC LIMIT 500`);
    const rows = (await (q.customer ? stmt.bind(q.customer) : stmt).all()).results;
    const out = [];
    for (const r of rows) for (const m of ["questions", "research", "searches", "builds", "ideas", "browser_actions", "gas"]) if (r[m]) out.push({ customer_id: r.user_id, period: r.period, meter: m, qty: r[m], tokens_in: r.tokens_in, tokens_out: r.tokens_out, cost_usd: r.cost_micros / 1e6 });
    return out;
  },
  async subscriptions(db, q) {
    const where = q.customer ? "WHERE s.user_id = ?1" : "";
    const stmt = db.prepare(`SELECT s.id, s.user_id, u.email, s.plan_key, s.status, s.provider, s.billing_cycle, s.started_at, s.next_billing_at, s.cancelled_at FROM subscriptions s LEFT JOIN users u ON u.id = s.user_id ${where} ORDER BY s.updated_at DESC LIMIT 200`);
    return (await (q.customer ? stmt.bind(q.customer) : stmt).all()).results.map((s) => ({ ...s, started_at: iso(s.started_at), next_billing_at: iso(s.next_billing_at), cancelled_at: iso(s.cancelled_at) }));
  },
  async plans(db) { return (await db.prepare("SELECT plan, COUNT(*) AS n FROM users GROUP BY plan").all()).results; },
  async setPlan(db, customerId, plan) {
    const r = await db.prepare("UPDATE users SET plan = ?1 WHERE id = ?2").bind(plan, customerId).run();
    if (!r.meta.changes) throw new Error("no such user");
    return {};
  },
};

const RICORSA_CONSOLE = {
  describe: "the Ricorsa CRM: customers, contacts, communications, licenses, trials, invoices, payments, staff activity",
  sessionsKept: false,
  async summary(db) {
    const r = await db.prepare(`SELECT (SELECT COUNT(*) FROM customers) AS customers,
      (SELECT COUNT(*) FROM customers WHERE status NOT IN ('lead','churned')) AS active,
      (SELECT COALESCE(SUM(mrr_cents),0) FROM customers WHERE status NOT IN ('lead','churned')) AS mrr_cents,
      (SELECT COUNT(*) FROM trials WHERE status='active') AS trials,
      (SELECT COUNT(*) FROM licenses WHERE status='active') AS licenses,
      (SELECT COALESCE(SUM(total_cents - paid_cents),0) FROM invoices WHERE status IN ('sent','overdue')) AS outstanding_cents,
      (SELECT COUNT(*) FROM communications WHERE at >= ?1) AS messages_7d`).bind(Date.now() - 7 * 864e5).first();
    const plans = (await db.prepare("SELECT plan, COUNT(*) AS n FROM customers GROUP BY plan").all()).results;
    return { ...r, plans };
  },
  async customers(db, q) {
    const where = q.search ? "WHERE c.email LIKE ?3 ESCAPE '\\' OR c.name LIKE ?3 ESCAPE '\\' OR c.company LIKE ?3 ESCAPE '\\'" : "";
    const stmt = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM communications m WHERE m.customer_id = c.id) AS messages, (SELECT MAX(at) FROM communications m WHERE m.customer_id = c.id) AS last_message_at
      FROM customers c ${where} ORDER BY c.updated_at DESC LIMIT ?1 OFFSET ?2`);
    const rows = (await (q.search ? stmt.bind(q.limit, q.offset, like(q.search)) : stmt.bind(q.limit, q.offset)).all()).results;
    return rows.map((r) => ({ id: r.id, email: r.email, name: r.name, org: r.company, plan: r.plan, status: r.status, mrr_cents: r.mrr_cents, created_at: iso(r.created_at), last_seen_at: iso(r.last_contact_at),
      external: { kind: r.kind, source: r.source, tags: safeJson(r.tags, []), ricorsa_user_id: r.ricorsa_user_id, billing_cycle: r.billing_cycle, messages: r.messages, last_message_at: iso(r.last_message_at) } }));
  },
  async sessions() { return null; },
  async messages(db, q) {
    const where = q.customer ? "WHERE m.customer_id = ?1" : "";
    const stmt = db.prepare(`SELECT m.id, m.customer_id, c.name AS customer, m.kind, m.direction, m.subject, m.to_email, m.status, m.provider, m.at FROM communications m LEFT JOIN customers c ON c.id = m.customer_id ${where} ORDER BY m.at DESC LIMIT 200`);
    return (await (q.customer ? stmt.bind(q.customer) : stmt).all()).results.map((m) => ({ ...m, at: iso(m.at) }));
  },
  async usage() { return []; },
  async plans(db) { return (await db.prepare("SELECT plan, COUNT(*) AS n, SUM(mrr_cents) AS mrr_cents FROM customers GROUP BY plan").all()).results; },
  async setPlan(db, customerId, plan) {
    const r = await db.prepare("UPDATE customers SET plan = ?1, updated_at = ?2 WHERE id = ?3").bind(plan, Date.now(), customerId).run();
    if (!r.meta.changes) throw new Error("no such customer");
    return {};
  },
};

const VDRPROS = {
  describe: "customers with plan, MRR and trial end, signups, an event log by email, invoices",
  sessionsKept: false,
  async summary(db) {
    const r = await db.prepare(`SELECT (SELECT COUNT(*) FROM customers) AS customers,
      (SELECT COUNT(*) FROM customers WHERE status='active') AS active,
      (SELECT COUNT(*) FROM customers WHERE status='trial') AS trials,
      (SELECT COALESCE(SUM(mrr),0) FROM customers WHERE status='active') AS mrr,
      (SELECT COUNT(*) FROM signups WHERE status='pending') AS pending_signups,
      (SELECT COUNT(*) FROM events WHERE ts >= ?1) AS events_7d`).bind(daysAgo(7)).first();
    const plans = (await db.prepare("SELECT plan, COUNT(*) AS n FROM customers GROUP BY plan").all()).results;
    return { ...r, mrr_cents: Math.round((r.mrr || 0) * 100), plans };
  },
  async customers(db, q) {
    const where = q.search ? "WHERE email LIKE ?3 ESCAPE '\\' OR contact LIKE ?3 ESCAPE '\\' OR company LIKE ?3 ESCAPE '\\'" : "";
    const stmt = db.prepare(`SELECT * FROM customers ${where} ORDER BY COALESCE(last_seen, since) DESC LIMIT ?1 OFFSET ?2`);
    const rows = (await (q.search ? stmt.bind(q.limit, q.offset, like(q.search)) : stmt.bind(q.limit, q.offset)).all()).results;
    return rows.map((r) => ({ id: r.id, email: r.email, name: r.contact, org: r.company, plan: r.plan, status: r.status, mrr_cents: Math.round((r.mrr || 0) * 100), created_at: r.since, last_seen_at: r.last_seen,
      external: { acct_id: r.acct_id, workspace: r.workspace, trial_ends: r.trial_ends, notes: r.notes } }));
  },
  async sessions() { return null; },
  async activity(db, q) {
    const where = q.customer ? "WHERE email = (SELECT email FROM customers WHERE id = ?3)" : "";
    const stmt = db.prepare(`SELECT id, ts AS at, type AS kind, acct_id, email, detail FROM events ${where} ORDER BY ts DESC LIMIT ?1 OFFSET ?2`);
    return (await (q.customer ? stmt.bind(q.limit, q.offset, q.customer) : stmt.bind(q.limit, q.offset)).all()).results;
  },
  async usage() { return []; },
  async plans(db) { return (await db.prepare("SELECT plan, COUNT(*) AS n, SUM(mrr) AS mrr FROM customers GROUP BY plan").all()).results; },
  async setPlan(db, customerId, plan) {
    const r = await db.prepare("UPDATE customers SET plan = ?1 WHERE id = ?2").bind(plan, customerId).run();
    if (!r.meta.changes) throw new Error("no such customer");
    return {};
  },
};

/* The platform's own tenants, read the way the overview already does. */
const IGL_API = {
  describe: "platform tenants, identities, keys, projections and audit events (the IGL API production database)",
  sessionsKept: false,
  async summary(db) {
    return await db.prepare(`SELECT (SELECT COUNT(*) FROM tenants) AS customers, (SELECT COUNT(*) FROM tenants WHERE created_at >= ?1) AS new_7d,
      (SELECT COUNT(*) FROM identities) AS identities, (SELECT COUNT(*) FROM api_keys WHERE revoked_at IS NULL) AS active_keys,
      (SELECT COUNT(*) FROM audit_events WHERE occurred_at >= ?1) AS audit_events_7d`).bind(daysAgo(7)).first();
  },
  async customers(db, q) {
    const where = q.search ? "WHERE t.name LIKE ?3 ESCAPE '\\' OR t.id LIKE ?3 ESCAPE '\\'" : "";
    const stmt = db.prepare(`SELECT t.id, t.name, t.jurisdiction, t.settings, t.created_at,
        (SELECT COUNT(*) FROM identities i WHERE i.tenant_id = t.id) AS identities,
        (SELECT COUNT(*) FROM api_keys k WHERE k.tenant_id = t.id AND k.revoked_at IS NULL) AS keys,
        (SELECT MAX(occurred_at) FROM audit_events e WHERE e.tenant_id = t.id) AS last_seen_at
      FROM tenants t ${where} ORDER BY t.created_at DESC LIMIT ?1 OFFSET ?2`);
    const rows = (await (q.search ? stmt.bind(q.limit, q.offset, like(q.search)) : stmt.bind(q.limit, q.offset)).all()).results;
    return rows.map((r) => { const s = safeJson(r.settings, {}); return { id: r.id, email: s.contact || null, name: r.name, org: r.name, plan: s.selfServe ? "sandbox" : "production", status: "active", mrr_cents: null, created_at: r.created_at, last_seen_at: r.last_seen_at, external: { jurisdiction: r.jurisdiction, identities: r.identities, keys: r.keys } }; });
  },
  async sessions() { return null; },
  async usage(db, q) {
    const rows = (await db.prepare(`SELECT tenant_id, substr(occurred_at,1,7) AS period, event_type AS meter, COUNT(*) AS qty FROM audit_events WHERE occurred_at >= ?1 GROUP BY tenant_id, period, event_type ORDER BY period DESC LIMIT 500`).bind(daysAgo(q.days)).all()).results;
    return rows.map((r) => ({ customer_id: r.tenant_id, period: r.period, meter: r.meter, qty: r.qty, cost_usd: null }));
  },
  async plans() { return []; },
  async setPlan() { throw new Error("platform tenants are provisioned through the API, not from this console"); },
};

const ADAPTERS = { TORTGRAPH, RICORSA, RICORSA_CONSOLE, VDRPROS, API_PROD: IGL_API };

/* ---------------- console tables (INTAKE database) ---------------- */

const CONTROL_SCHEMA = `
CREATE TABLE IF NOT EXISTS ops_events (id TEXT PRIMARY KEY, app_id TEXT NOT NULL, customer_ref TEXT, email TEXT, kind TEXT NOT NULL, meter TEXT, qty REAL, at TEXT NOT NULL, received_at TEXT NOT NULL, ip TEXT, detail TEXT);
CREATE INDEX IF NOT EXISTS ops_events_app_at ON ops_events (app_id, at DESC);
CREATE INDEX IF NOT EXISTS ops_events_customer ON ops_events (app_id, customer_ref, at DESC);
CREATE TABLE IF NOT EXISTS ops_notes (id TEXT PRIMARY KEY, app_id TEXT NOT NULL, customer_ref TEXT NOT NULL, body TEXT NOT NULL, by_email TEXT NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ops_plan_changes (id TEXT PRIMARY KEY, app_id TEXT NOT NULL, customer_ref TEXT NOT NULL, from_plan TEXT, to_plan TEXT NOT NULL, reason TEXT, by_email TEXT NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ops_messages (id TEXT PRIMARY KEY, app_id TEXT NOT NULL, customer_ref TEXT NOT NULL, to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, provider TEXT NOT NULL, provider_id TEXT, status TEXT NOT NULL, error TEXT, by_email TEXT NOT NULL, at TEXT NOT NULL);
`;
let controlReady = null;
export async function ensureControl(env) {
  if (!env.INTAKE) return false;
  if (!controlReady) controlReady = (async () => { for (const s of CONTROL_SCHEMA.split(";").map((x) => x.trim()).filter(Boolean)) await env.INTAKE.prepare(s).run(); return true; })().catch((e) => { controlReady = null; throw e; });
  return controlReady;
}

/* ---------------- the portfolio view ---------------- */

/** @param {any} env @param {{ health?: Record<string, any> }} [opts] */
export async function portfolio(env, { health } = {}) {
  const out = [];
  for (const app of APPS) {
    /** @type {any} */
    const row = { ...app, health: health?.[app.id] || null, store: app.store, configured: false };
    const db = app.store ? env[app.store] : null;
    const adapter = app.store ? ADAPTERS[app.store] : null;
    if (!app.store) row.why = "no store is bound for this application yet; health only";
    else if (!db) row.why = `D1 binding ${app.store} is not configured on the ops Worker`;
    else if (!adapter) row.why = `no adapter for ${app.store}`;
    else {
      try { row.summary = await adapter.summary(db); row.configured = true; row.describe = adapter.describe; row.sessionsKept = adapter.sessionsKept; }
      catch (e) { row.why = `store answered with an error: ${e.message}`; }
    }
    if (env.INTAKE) {
      try {
        await ensureControl(env);
        const ev = await env.INTAKE.prepare("SELECT COUNT(*) AS n, MAX(at) AS last_at, SUM(kind='login') AS logins, SUM(kind='logout') AS logouts FROM ops_events WHERE app_id = ?1 AND at >= ?2").bind(app.id, daysAgo(7)).first();
        row.ingest = { events_7d: ev.n, logins_7d: ev.logins || 0, logouts_7d: ev.logouts || 0, last_at: ev.last_at };
      } catch (e) { row.ingest = { error: e.message }; }
    }
    out.push(row);
  }
  return out;
}

export async function appHealth(env) {
  const out = {};
  await Promise.all(APPS.map(async (app) => {
    const url = `https://${app.domain}/`; const t0 = Date.now();
    try {
      const r = await fetch(url, { method: "GET", redirect: "follow", headers: { "user-agent": "igl-ops health" }, signal: AbortSignal.timeout(8000) });
      const server = r.headers.get("server") || ""; const cfErr = r.headers.get("cf-mitigated") || "";
      out[app.id] = { url, ok: r.ok, status: r.status, ms: Date.now() - t0, note: !r.ok && r.status === 530 ? "Cloudflare origin error (tunnel or origin down)" : (cfErr || null), server: server || null };
    } catch (e) { out[app.id] = { url, ok: false, status: 0, ms: Date.now() - t0, error: e.name === "TimeoutError" ? "timeout" : "unreachable" }; }
  }));
  return out;
}

export function query(url) {
  return {
    limit: Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 500),
    offset: Math.max(Number(url.searchParams.get("offset") || 0), 0),
    search: (url.searchParams.get("q") || "").trim().slice(0, 120) || null,
    customer: url.searchParams.get("customer") || null,
    days: Math.min(Math.max(Number(url.searchParams.get("days") || 30), 1), 365),
  };
}

export async function appRead(env, appId, what, q) {
  const app = appById(appId); if (!app) return { error: "unknown application", status: 404 };
  const db = app.store ? env[app.store] : null; const adapter = app.store ? ADAPTERS[app.store] : null;
  if (!db || !adapter) return { error: app.store ? `D1 binding ${app.store} is not configured on the ops Worker` : "no store is bound for this application", status: 503 };
  const fn = adapter[what];
  if (typeof fn !== "function") return { error: `${what} is not available for ${app.name}`, status: 404 };
  const rows = await fn(db, q);
  if (rows === null) return { app: appId, what, rows: [], kept: false, why: `${app.name} keeps no session table; logins and logouts arrive through /ingest/${appId} once the application posts them`, ingest: await ingested(env, appId, q) };
  const extra = what === "sessions" ? { ingest: await ingested(env, appId, q) } : {};
  return { app: appId, what, rows, kept: true, ...extra };
}

async function ingested(env, appId, q) {
  if (!env.INTAKE) return [];
  await ensureControl(env);
  const where = q.customer ? "AND customer_ref = ?3" : "";
  const stmt = env.INTAKE.prepare(`SELECT id, customer_ref, email, kind, meter, qty, at, ip, detail FROM ops_events WHERE app_id = ?1 AND at >= ?2 ${where} ORDER BY at DESC LIMIT 200`);
  return (await (q.customer ? stmt.bind(appId, daysAgo(q.days), q.customer) : stmt.bind(appId, daysAgo(q.days))).all()).results;
}

/* Plan change: the application's own plan column changes, and the console records who did it and why. */
export async function changePlan(env, appId, customerId, plan, reason, byEmail) {
  const app = appById(appId); if (!app) return { error: "unknown application", status: 404 };
  const db = app.store ? env[app.store] : null; const adapter = app.store ? ADAPTERS[app.store] : null;
  if (!db || !adapter) return { error: "store not configured", status: 503 };
  if (!/^[a-z0-9][a-z0-9_.-]{0,40}$/i.test(plan)) return { error: "plan must be a short identifier", status: 422 };
  let fromPlan = null;
  try { const rows = await adapter.customers(db, { limit: 500, offset: 0, search: null }); fromPlan = rows.find((r) => r.id === customerId)?.plan ?? null; } catch {}
  try { await adapter.setPlan(db, customerId, plan); }
  catch (e) { return { error: e.message, status: 422 }; }
  if (env.INTAKE) {
    await ensureControl(env);
    await env.INTAKE.prepare("INSERT INTO ops_plan_changes (id, app_id, customer_ref, from_plan, to_plan, reason, by_email, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
      .bind(uuid(), appId, customerId, fromPlan, plan, reason || null, byEmail, now()).run();
  }
  return { ok: true, app: appId, customer: customerId, from: fromPlan, to: plan };
}

export async function addNote(env, appId, customerId, body, byEmail) {
  if (!env.INTAKE) return { error: "INTAKE binding missing", status: 503 };
  if (!appById(appId)) return { error: "unknown application", status: 404 };
  await ensureControl(env);
  const id = uuid();
  await env.INTAKE.prepare("INSERT INTO ops_notes (id, app_id, customer_ref, body, by_email, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(id, appId, customerId, body.slice(0, 4000), byEmail, now()).run();
  return { ok: true, id };
}

export async function customerRecord(env, appId, customerId, q) {
  const app = appById(appId); if (!app) return { error: "unknown application", status: 404 };
  const db = app.store ? env[app.store] : null; const adapter = app.store ? ADAPTERS[app.store] : null;
  const out = { app: appId, customer: customerId };
  if (db && adapter) {
    try {
      const rows = await adapter.customers(db, { limit: 500, offset: 0, search: null });
      out.customer_row = rows.find((r) => r.id === customerId) || null;
      for (const what of ["sessions", "activity", "usage", "subscriptions", "messages"]) if (typeof adapter[what] === "function") { const r = await adapter[what](db, { ...q, customer: customerId }); if (r !== null) out[what] = r; }
    } catch (e) { out.error = e.message; }
  }
  if (env.INTAKE) {
    await ensureControl(env);
    out.notes = (await env.INTAKE.prepare("SELECT id, body, by_email, at FROM ops_notes WHERE app_id = ?1 AND customer_ref = ?2 ORDER BY at DESC LIMIT 100").bind(appId, customerId).all()).results;
    out.plan_changes = (await env.INTAKE.prepare("SELECT id, from_plan, to_plan, reason, by_email, at FROM ops_plan_changes WHERE app_id = ?1 AND customer_ref = ?2 ORDER BY at DESC LIMIT 100").bind(appId, customerId).all()).results;
    out.ingested = await ingested(env, appId, { ...q, customer: customerId });
    out.outbound = (await env.INTAKE.prepare("SELECT id, to_email, subject, provider, status, by_email, at FROM ops_messages WHERE app_id = ?1 AND customer_ref = ?2 ORDER BY at DESC LIMIT 100").bind(appId, customerId).all()).results;
  }
  return out;
}

/* ---------------- ingest: applications post their own events ----------------
   POST /ingest/{app} with header x-ops-ingest-key. INGEST_KEYS is a JSON
   secret: {"ricorsa":"<key>", ...}. Body: one event or {events:[...]}.
   Event: { customer, email?, kind: login|logout|usage|event, meter?, qty?, at?, detail? } */
export async function ingest(env, request, appId) {
  const app = appById(appId); if (!app) return { error: "unknown application", status: 404 };
  let keys = {}; try { keys = JSON.parse(env.INGEST_KEYS || "{}"); } catch { return { error: "INGEST_KEYS secret is not valid JSON", status: 503 }; }
  const expected = keys[appId]; const given = request.headers.get("x-ops-ingest-key") || "";
  if (!expected) return { error: `no ingest key is configured for ${appId}`, status: 503 };
  if (!constantTimeEqual(given, expected)) return { error: "forbidden", status: 403 };
  if (!env.INTAKE) return { error: "INTAKE binding missing", status: 503 };
  const body = await request.json().catch(() => null);
  const events = Array.isArray(body?.events) ? body.events : (body ? [body] : []);
  if (!events.length || events.length > 500) return { error: "one event, or events: [1..500]", status: 422 };
  await ensureControl(env);
  const ip = request.headers.get("cf-connecting-ip") || null; const received = now(); const stmts = [];
  for (const e of events) {
    if (!e || typeof e !== "object" || !["login", "logout", "usage", "event"].includes(e.kind)) return { error: "each event needs kind login|logout|usage|event", status: 422 };
    if (e.kind === "usage" && (typeof e.meter !== "string" || typeof e.qty !== "number")) return { error: "usage events need meter and numeric qty", status: 422 };
    const at = e.at ? new Date(e.at) : new Date(); if (Number.isNaN(at.getTime())) return { error: "at must be a date", status: 422 };
    stmts.push(env.INTAKE.prepare("INSERT INTO ops_events (id, app_id, customer_ref, email, kind, meter, qty, at, received_at, ip, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)")
      .bind(uuid(), appId, e.customer ? String(e.customer).slice(0, 200) : null, e.email ? String(e.email).slice(0, 254) : null, e.kind, e.meter ? String(e.meter).slice(0, 80) : null, e.qty ?? null, at.toISOString(), received, ip, e.detail === undefined ? null : JSON.stringify(e.detail).slice(0, 4000)));
  }
  await env.INTAKE.batch(stmts);
  return { ok: true, accepted: events.length };
}

/* ---------------- helpers ---------------- */
function daysAgo(d) { return new Date(Date.now() - d * 864e5).toISOString(); }
function safeJson(s, fallback) { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } }
function constantTimeEqual(a, b) {
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  if (x.length !== y.length) return false; let r = 0; for (let i = 0; i < x.length; i++) r |= x[i] ^ y[i]; return r === 0;
}
