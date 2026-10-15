/* Starts the service locally (wrangler dev, local D1, sandbox mode), runs the
   conformance suite against it, stops it. Exit code is the suite's. */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const PORT = Number(process.env.PORT || 8801);
const BASE = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" };
rmSync(".wrangler/state", { recursive: true, force: true });

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", env, ...opts });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

await run("npx", ["wrangler", "d1", "execute", "igl-api-local", "--local", "--file=schema.sql"]);
const dev = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--local", "--var", "IGL_ENV:sandbox", "--var", "RATE_BURST:100000", "--var", "BOOTSTRAP_TOKEN:test-bootstrap"], { env, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; dev.stdout.on("data", (d) => { log += d; }); dev.stderr.on("data", (d) => { log += d; });

let up = false;
for (let i = 0; i < 60 && !up; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try { const r = await fetch(BASE + "/v1/health"); up = r.ok; } catch {}
}
if (!up) { console.error(log.slice(-4000)); dev.kill("SIGKILL"); process.exit(1); }

let code = 0;
try { await run("node", ["--test", "test/conformance.test.mjs"], { env: { ...env, IGL_API_BASE: BASE } }); }
catch { code = 1; }
dev.kill("SIGKILL");
process.exit(code);
