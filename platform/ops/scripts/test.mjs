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
const dev = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--local", "--var", "OPS_DEV:1", "--var", 'INGEST_KEYS:{"ricorsa":"fixture-key"}'], { env, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; dev.stdout.on("data", (d) => { log += d; }); dev.stderr.on("data", (d) => { log += d; });
let up = false;
for (let i = 0; i < 60 && !up; i++) { await new Promise((r) => setTimeout(r, 1000)); try { up = (await fetch(BASE + "/healthz")).ok; } catch {} }
if (!up) { console.error(log.slice(-3000)); dev.kill("SIGKILL"); process.exit(1); }
let code = 0;
try {
  const page = await fetch(BASE + "/"); if (!page.ok || !(await page.text()).includes("IGL operations")) throw new Error("page did not render");
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
  for (const id of ["tortplus", "tortgraph", "ricorsa", "vdrpros"]) { const a = apps.find((x) => x.id === id); if (!a?.configured) throw new Error(id + " should read its store: " + JSON.stringify(a?.why)); }
  const unbound = apps.find((x) => x.id === "wellsite"); if (unbound.configured || !unbound.why) throw new Error("an application without a store must say so");
  const tg = await (await fetch(BASE + "/api/apps/tortplus/customers")).json();
  if (tg.rows.length !== 1 || tg.rows[0].email !== "reviewer@fixture.law" || tg.rows[0].plan !== "pilot") throw new Error("tortgraph customers: " + JSON.stringify(tg));
  const ss = await (await fetch(BASE + "/api/apps/tortplus/sessions")).json();
  if (ss.rows.length !== 2 || ss.rows[0].ended_at !== null || ss.rows[1].end_reason !== "signed_out") throw new Error("tortgraph sessions: " + JSON.stringify(ss.rows));
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
  console.log("portfolio: 15 applications, four stores read through their adapters, sessions with login and logout, gas meter, search, ingest with per-app keys, plan change with audit, notes");
} catch (e) { console.error("FAIL", e.message); code = 1; }
dev.kill("SIGKILL");
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
