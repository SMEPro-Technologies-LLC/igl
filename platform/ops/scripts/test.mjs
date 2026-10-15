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
const dev = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--local", "--var", "OPS_DEV:1"], { env, stdio: ["ignore", "pipe", "pipe"] });
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
  console.log("ops console: page renders, overview answers, unconfigured sources are reported, inquiry validation holds");
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
