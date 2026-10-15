/* Boots the console locally with OPS_DEV=1 (no Access, no tokens) and checks
   the page and the overview answer, with every unconfigured source reported
   as such instead of failing. */
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
dev.kill("SIGKILL"); process.exit(code);
