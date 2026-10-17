/* Boots the console locally twice: with OPS_DEV=1 (no sign-in, no tokens) to
   check the page and the overview answer, with every unconfigured source
   reported as such instead of failing; then with a test password to check the
   built-in sign-in (redirects, wrong password, session cookie, sign out). */
import { spawn } from "node:child_process";
const PORT = 8805, BASE = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" };
function run(args) { return new Promise((res, rej) => { const p = spawn("npx", args, { env, stdio: "inherit" }); p.on("exit", (c) => (c === 0 ? res() : rej(new Error(args.join(" ") + " exited " + c)))); }); }
await run(["wrangler", "d1", "execute", "igl-intake", "--local", "--file=../site/schema/intake.sql"]);
await run(["wrangler", "d1", "execute", "igl-api-sandbox", "--local", "--file=../api/schema.sql"]);
await run(["wrangler", "d1", "execute", "igl-api-production", "--local", "--file=../api/schema.sql"]);
// Application stores: the production table shapes with fixture rows (test/fixtures), so the adapters run the same SQL they run live.
for (const [name, file] of [["tortgraph", "tortgraph.sql"], ["ricorsa", "ricorsa.sql"], ["ricorsa-console", "ricorsa-console.sql"], ["vdrpros", "vdrpros.sql"]]) await run(["wrangler", "d1", "execute", name, "--local", "--file=test/fixtures/" + file]);
// The console's own tables start empty each run (the local state persists between runs otherwise), and the fixture plan change is undone.
await run(["wrangler", "d1", "execute", "igl-intake", "--local", "--command=DROP TABLE IF EXISTS ops_events; DROP TABLE IF EXISTS ops_notes; DROP TABLE IF EXISTS ops_plan_changes; DROP TABLE IF EXISTS ops_messages; DROP TABLE IF EXISTS ops_agent_runs; DROP TABLE IF EXISTS ops_seo; DROP TABLE IF EXISTS ops_content; DROP TABLE IF EXISTS ops_leads; DROP TABLE IF EXISTS ops_insights;"]);
// The sign-in attempts table belongs to the intake schema (applied above), so it is cleared, not dropped: a lockout left by an earlier run would fail phase two.
await run(["wrangler", "d1", "execute", "igl-intake", "--local", "--command=DELETE FROM ops_sign_in_attempts;"]);
await run(["wrangler", "d1", "execute", "ricorsa", "--local", "--command=UPDATE users SET plan = 'free' WHERE id = 'r2';"]);
// A stand-in for TortPlus's management API (projects/tortplus/worker/src/ops.js), the way the console reads applications that keep their data outside D1.
import { createServer } from "node:http";
const TP_PORT = 8807; const tpCalls = [];
const tp = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c; tpCalls.push(req.method + " " + req.url);
  const send = (o, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (req.headers["x-ops-key"] !== "tp-key") return send({ error: "forbidden" }, 403);
  const u = new URL(req.url, "http://x"); const p = u.pathname.replace(/^\/api\/ops\/?/, "");
  if (p === "summary") return send({ customers: 1, active: 1, users: 2, mrr_cents: 19500, month: "2026-10", model_cost_usd: 1.25, imports: 4, plans: [{ plan: "analyst", n: 1 }] });
  if (p === "customers") return send({ rows: (u.searchParams.get("q") || "").includes("zzz") ? [] : [{ id: "a1234567890abcdef", email: "primary@firm.test", name: "Test Law Group", org: "Test Law Group", plan: "analyst", status: "active", mrr_cents: 19500, created_at: "2026-10-01T00:00:00Z", last_seen_at: "2026-10-16T00:00:00Z", external: { users: 2 } }], total: 1 });
  if (p === "sessions") return send({ rows: null, kept: false, why: "TortPlus keeps no session table" });
  if (p === "usage") return send({ rows: [{ customer_id: "a1234567890abcdef", period: "2026-10", meter: "imports", qty: 4, cost_usd: 0 }, { customer_id: "a1234567890abcdef", period: "2026-10", meter: "model_usd", qty: 1.25, cost_usd: 1.63 }] });
  if (p === "subscriptions") return send({ rows: [{ id: "subscription_x", customer_id: "a1234567890abcdef", plan: "analyst", status: "active", amount_cents: 19500, interval: "month", provider: "finix" }] });
  if (p === "plans") return send({ rows: [{ id: "pilot", name: "Pilot", amount_cents: 0 }, { id: "analyst", name: "Analyst", amount_cents: 19500 }, { id: "firm", name: "Firm", amount_cents: 65000 }] });
  if (p === "plan" && req.method === "POST") { const b = JSON.parse(body); return send({ ok: true, customer: b.customer, from: "analyst", to: b.plan, status: "comped" }); }
  send({ error: "not found" }, 404);
});
await new Promise((r) => tp.listen(TP_PORT, r));
const dev = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--local", "--var", "OPS_DEV:1", "--var", 'INGEST_KEYS:{"ricorsa":"fixture-key"}', "--var", 'OPS_KEYS:{"tortplus":"tp-key"}', "--var", `OPS_REMOTE_BASES:{"tortplus":"http://127.0.0.1:${TP_PORT}/api/ops"}`], { env: { ...env, NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost" }, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; dev.stdout.on("data", (d) => { log += d; }); dev.stderr.on("data", (d) => { log += d; });
let up = false;
for (let i = 0; i < 60 && !up; i++) { await new Promise((r) => setTimeout(r, 1000)); try { up = (await fetch(BASE + "/healthz")).ok; } catch {} }
if (!up) { console.error(log.slice(-3000)); dev.kill("SIGKILL"); process.exit(1); }
let code = 0;
try {
  const page = await fetch(BASE + "/"); const pageHtml = await page.text(); if (!page.ok || !pageHtml.includes("IGL operations")) throw new Error("page did not render");
  // The page's inline script must parse: a stray escape in the template once shipped a SyntaxError and the console sat on "Loading".
  for (const [, script] of pageHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)) { try { new Function(script); } catch (e) { throw new Error("the page script does not parse: " + e.message); } }
  const ov = await (await fetch(BASE + "/api/overview?days=7")).json();
  for (const k of ["site", "github", "intake", "platform", "health", "npm"]) if (!(k in ov)) throw new Error("overview missing " + k);
  if (ov.site.configured !== false) throw new Error("site should report unconfigured without a token");
  if (!ov.intake.configured || ov.intake.error) throw new Error("intake binding should work locally: " + JSON.stringify(ov.intake));
  if (!ov.platform.sandbox.configured || ov.platform.sandbox.error) throw new Error("sandbox binding should work locally: " + JSON.stringify(ov.platform.sandbox));
  const bad = await fetch(BASE + "/api/inquiry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "x", status: "nope" }) });
  if (bad.status !== 422) throw new Error("status validation");
  // The portfolio: every application answers; the four bound stores answer from their own tables.
  const apps = (await (await fetch(BASE + "/api/apps")).json()).apps;
  if (apps.length !== 15) throw new Error("expected 15 applications, got " + apps.length);
  for (const id of ["tortplus", "tortgraph", "ricorsa", "vdrpros", "idme"]) { const a = apps.find((x) => x.id === id); if (!a?.configured) throw new Error(id + " should read its store: " + JSON.stringify(a?.why)); }
  const unbound = apps.find((x) => x.id === "wellsite"); if (unbound.configured || !unbound.why) throw new Error("an application without a store must say so");
  const tg = await (await fetch(BASE + "/api/apps/tortgraph/customers")).json();
  if (tg.rows.length !== 1 || tg.rows[0].email !== "reviewer@fixture.law" || tg.rows[0].plan !== "pilot") throw new Error("tortgraph customers: " + JSON.stringify(tg));
  const ss = await (await fetch(BASE + "/api/apps/tortgraph/sessions")).json();
  if (ss.rows.length !== 2 || ss.rows[0].ended_at !== null || ss.rows[1].end_reason !== "signed_out") throw new Error("tortgraph sessions: " + JSON.stringify(ss.rows));
  // TortPlus answers through its own management API with the OPS_KEYS key
  const tpApp = apps.find((x) => x.id === "tortplus"); if (tpApp.summary?.mrr_cents !== 19500 || !/management API/.test(tpApp.describe)) throw new Error("tortplus summary through its API: " + JSON.stringify(tpApp));
  const tpc = await (await fetch(BASE + "/api/apps/tortplus/customers?q=law")).json(); if (tpc.rows.length !== 1 || tpc.rows[0].plan !== "analyst" || !tpCalls.some((c) => c.includes("/customers?") && c.includes("q=law"))) throw new Error("tortplus customers: " + JSON.stringify(tpc));
  const tps = await (await fetch(BASE + "/api/apps/tortplus/sessions")).json(); if (tps.kept !== false || !/ingest\/tortplus/.test(tps.why)) throw new Error("tortplus sessions come through ingest: " + JSON.stringify(tps));
  const tpu = await (await fetch(BASE + "/api/apps/tortplus/usage")).json(); if (!tpu.rows.some((r) => r.meter === "model_usd" && r.cost_usd === 1.63)) throw new Error("tortplus usage: " + JSON.stringify(tpu));
  const tpp = await (await fetch(BASE + "/api/apps/tortplus/plan/a1234567890abcdef", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "firm", reason: "pilot firm" }) })).json();
  if (!tpp.ok || tpp.from !== "analyst" || !tpCalls.some((c) => c === "POST /api/ops/plan")) throw new Error("tortplus plan change through its API: " + JSON.stringify(tpp));
  const ru = await (await fetch(BASE + "/api/apps/ricorsa/usage?customer=r1")).json();
  if (!ru.rows.some((u) => u.meter === "gas" && u.qty === 160)) throw new Error("ricorsa gas meter: " + JSON.stringify(ru.rows));
  const rs = await (await fetch(BASE + "/api/apps/ricorsa/sessions")).json();
  if (rs.kept !== false || !/ingest/.test(rs.why)) throw new Error("ricorsa keeps no sessions and must say so");
  const q = await (await fetch(BASE + "/api/apps/vdrpros/customers?q=dana")).json();
  if (q.rows.length !== 1 || q.rows[0].mrr_cents !== 29900) throw new Error("vdrpros search: " + JSON.stringify(q.rows));
  // Ingest: wrong key refused, right key accepted, the event then shows on the customer.
  const nokey = await fetch(BASE + "/ingest/ricorsa", { method: "POST", headers: { "content-type": "application/json", "x-ops-ingest-key": "wrong" }, body: JSON.stringify({ customer: "r1", kind: "login" }) });
  if (nokey.status !== 403) throw new Error("ingest should refuse a wrong key, got " + nokey.status);
  const nokey2 = await fetch(BASE + "/ingest/tortplus", { method: "POST", headers: { "content-type": "application/json", "x-ops-ingest-key": "fixture-key" }, body: JSON.stringify({ customer: "a1", kind: "login" }) });
  if (nokey2.status !== 503) throw new Error("an application without an ingest key should be 503, got " + nokey2.status);
  const ok = await fetch(BASE + "/ingest/ricorsa", { method: "POST", headers: { "content-type": "application/json", "x-ops-ingest-key": "fixture-key" }, body: JSON.stringify({ events: [{ customer: "r1", email: "maria@fixture.example", kind: "login" }, { customer: "r1", kind: "usage", meter: "gas", qty: 12 }, { customer: "r1", kind: "logout" }] }) });
  if (ok.status !== 200 || (await ok.json()).accepted !== 3) throw new Error("ingest should accept three events");
  const badev = await fetch(BASE + "/ingest/ricorsa", { method: "POST", headers: { "content-type": "application/json", "x-ops-ingest-key": "fixture-key" }, body: JSON.stringify({ customer: "r1", kind: "usage", meter: "gas" }) });
  if (badev.status !== 422) throw new Error("usage without qty should be 422");
  const rec = await (await fetch(BASE + "/api/apps/ricorsa/customer/r1")).json();
  if (rec.customer_row?.plan !== "pro" || rec.ingested.length !== 3 || !rec.subscriptions?.length) throw new Error("customer record: " + JSON.stringify({ plan: rec.customer_row?.plan, ingested: rec.ingested?.length, subs: rec.subscriptions?.length }));
  // Plan change writes the application's own column and is logged with who and why.
  const pc = await fetch(BASE + "/api/apps/ricorsa/plan/r2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "pro", reason: "fixture upgrade" }) });
  if (!pc.ok) throw new Error("plan change: " + await pc.text());
  const rec2 = await (await fetch(BASE + "/api/apps/ricorsa/customer/r2")).json();
  if (rec2.customer_row?.plan !== "pro" || rec2.plan_changes?.[0]?.from_plan !== "free" || rec2.plan_changes?.[0]?.by_email !== "dev@localhost") throw new Error("plan change record: " + JSON.stringify(rec2.plan_changes));
  const badplan = await fetch(BASE + "/api/apps/ricorsa/plan/r2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "not a plan id!" }) });
  if (badplan.status !== 422) throw new Error("plan id validation");
  const note = await fetch(BASE + "/api/apps/vdrpros/note/v1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: "called, renewing in Q1" }) });
  if (!note.ok) throw new Error("note");
  const vrec = await (await fetch(BASE + "/api/apps/vdrpros/customer/v1")).json();
  if (vrec.notes?.length !== 1 || vrec.activity?.length !== 1) throw new Error("vdrpros record: " + JSON.stringify({ notes: vrec.notes?.length, activity: vrec.activity?.length }));
  console.log("ops console: page renders, overview answers, unconfigured sources are reported, inquiry validation holds");
  console.log("portfolio: 15 applications, four stores read through their adapters, TortPlus through its own API, sessions with login and logout, gas meter, search, ingest with per-app keys, plan change with audit, notes");
  // Billing: the catalog is served without Finix; Finix itself reports unconfigured instead of pretending.
  const bill = await (await fetch(BASE + "/api/billing")).json();
  if (bill.configured !== false || !bill.catalog?.tortplus?.plans?.length || !/FINIX_USERNAME/.test(bill.why)) throw new Error("billing should report unconfigured with the catalog: " + JSON.stringify(bill).slice(0, 200));
  const prices = await (await fetch(BASE + "/api/billing/prices/vdrpros")).json();
  if (prices.plans?.[0]?.monthly_usd !== 299 || prices.meters?.[0]?.id !== "gb") throw new Error("price list: " + JSON.stringify(prices));
  const sync = await fetch(BASE + "/api/billing/sync", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (sync.status !== 503) throw new Error("plan sync without Finix should be 503, got " + sync.status);
  // Marketing: the agent audits the application's live page, queues nothing without a model, and says what is off.
  const mkt0 = await (await fetch(BASE + "/api/apps/idme/marketing")).json();
  if (mkt0.postiz?.configured !== false || mkt0.model !== false || !Array.isArray(mkt0.content)) throw new Error("marketing state: " + JSON.stringify(mkt0).slice(0, 200));
  const run = await (await fetch(BASE + "/api/apps/idme/marketing/run", { method: "POST" })).json();
  if (!run.ok || typeof run.seo?.score !== "number" || !/ANTHROPIC_API_KEY/.test(run.detail?.content?.error || "") || !/BRAVE_API_KEY/.test(run.detail?.leads?.error || "")) throw new Error("agent run: " + JSON.stringify(run).slice(0, 300));
  const mkt = await (await fetch(BASE + "/api/apps/idme/marketing")).json();
  if (mkt.runs.length !== 1 || !mkt.seo || mkt.insights.length !== 1 || !/site score/.test(mkt.insights[0].body)) throw new Error("marketing after run: " + JSON.stringify({ runs: mkt.runs.length, seo: !!mkt.seo, insights: mkt.insights.length }));
  const badDecision = await fetch(BASE + "/api/apps/idme/marketing/content/nope", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve" }) });
  if (badDecision.status !== 404) throw new Error("deciding a missing draft should be 404");
  console.log("billing and marketing: catalog and price lists served, Finix and Postiz report unconfigured, the agent audits id-me.ai live and records the run, insights and findings");
} catch (e) { console.error("FAIL", e.message); code = 1; }
dev.kill("SIGKILL"); tp.close();
if (code) process.exit(code);

// Phase two: built-in sign-in
const PORT2 = 8806, BASE2 = `http://127.0.0.1:${PORT2}`;
const dev2 = spawn("npx", ["wrangler", "dev", "--port", String(PORT2), "--local", "--var", "OPS_ADMIN_PASSWORD:correct-horse", "--var", "OPS_ADMIN_USER:ops"], { env, stdio: ["ignore", "pipe", "pipe"] });
let log2 = ""; dev2.stdout.on("data", (d) => { log2 += d; }); dev2.stderr.on("data", (d) => { log2 += d; });
up = false;
for (let i = 0; i < 60 && !up; i++) { await new Promise((r) => setTimeout(r, 1000)); try { up = (await fetch(BASE2 + "/healthz")).ok; } catch {} }
if (!up) { console.error(log2.slice(-3000)); dev2.kill("SIGKILL"); process.exit(1); }
const noFollow = { redirect: "manual" };
try {
  const home = await fetch(BASE2 + "/", noFollow); if (home.status !== 303 || home.headers.get("location") !== "/login") throw new Error("anonymous / should redirect to /login, got " + home.status);
  const api = await fetch(BASE2 + "/api/overview", noFollow); if (api.status !== 401) throw new Error("anonymous API should be 401, got " + api.status);
  const page = await fetch(BASE2 + "/login"); if (!page.ok || !(await page.text()).includes("Sign in")) throw new Error("login page did not render");
  const wrong = await fetch(BASE2 + "/login", { method: "POST", body: new URLSearchParams({ username: "ops", password: "nope" }), ...noFollow });
  if (wrong.status !== 401 || wrong.headers.get("set-cookie")) throw new Error("wrong password should be 401 without a cookie");
  const right = await fetch(BASE2 + "/login", { method: "POST", body: new URLSearchParams({ username: "ops", password: "correct-horse" }), ...noFollow });
  const cookie = (right.headers.get("set-cookie") || "").split(";")[0];
  if (right.status !== 303 || !cookie.startsWith("igl_ops=")) throw new Error("right password should set a session and redirect");
  if (!/HttpOnly/i.test(right.headers.get("set-cookie")) || !/SameSite=Strict/i.test(right.headers.get("set-cookie"))) throw new Error("session cookie flags");
  const signed = await fetch(BASE2 + "/", { headers: { cookie } }); const body = await signed.text();
  if (!signed.ok || !body.includes("IGL operations") || !body.includes("Sign out") || !body.includes(">ops<")) throw new Error("signed-in page did not render with the user and sign-out");
  const ov = await fetch(BASE2 + "/api/overview?days=1", { headers: { cookie } }); if (!ov.ok || (await ov.json()).viewer !== "ops") throw new Error("signed-in overview");
  const tampered = await fetch(BASE2 + "/", { headers: { cookie: cookie.slice(0, -2) + "xx" }, ...noFollow }); if (tampered.status !== 303) throw new Error("tampered cookie should not be accepted");
  const out = await fetch(BASE2 + "/logout", { method: "POST", headers: { cookie }, ...noFollow }); if (out.status !== 303 || !/Max-Age=0/.test(out.headers.get("set-cookie") || "")) throw new Error("sign out should clear the cookie");
  for (let i = 0; i < 5; i++) await fetch(BASE2 + "/login", { method: "POST", body: new URLSearchParams({ username: "ops", password: "guess" + i }), ...noFollow });
  const locked = await fetch(BASE2 + "/login", { method: "POST", body: new URLSearchParams({ username: "ops", password: "correct-horse" }), ...noFollow });
  if (locked.status !== 401 || !(await locked.text()).includes("Too many attempts")) throw new Error("five failures should lock the address out");
  console.log("ops console sign-in: redirects, rejects wrong passwords, issues and verifies the session cookie, signs out, locks out after five failures");
} catch (e) { console.error("FAIL", e.message); code = 1; }
dev2.kill("SIGKILL"); process.exit(code);
