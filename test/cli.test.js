import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileJournal } from "../src/store.js";

const bin = fileURLToPath(new URL("../bin/igl.mjs", import.meta.url));
const run = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" }, timeout: 60000 });

test("npx igl demo: a committed action, a refusal, verifying receipts and a chain that refuses an edit, with no model and no network", () => {
  const r = run("demo", "--fast");
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout;
  assert.match(out, /committed\s+trace TRC-000001/);
  assert.match(out, /receipt\s+Ed25519 by igl-demo-runtime, digest [0-9a-f]{16}…\s+verifies/);
  assert.match(out, /refused\s+IGL_BOUNDARY_REJECTED/);
  assert.match(out, /journal entry #1 type=failure/);
  assert.match(out, /chain intact/);
  assert.match(out, /inclusion proof for the refusal \(entry #1, 1 hashes\) verifies/);
  assert.match(out, /head receipt signed by igl-demo-runtime verifies/);
  assert.match(out, /chain refused: body does not reproduce its digest at entry #0/);
  assert.match(out, /head receipt against the edited journal: refused/);
  assert.doesNotMatch(out, /\(bug\)/);
});

test("igl verify: an intact FileJournal is reported intact, an edited one is refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "igl-cli-"));
  const path = join(dir, "journal.jsonl");
  const j = new FileJournal(path);
  j.append("trace", { id: "TRC-000001", intent: "Generate_Compliance_Packet" });
  j.append("failure", { code: "IGL_BOUNDARY_REJECTED" });
  const good = run("verify", path);
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /intact 2 entries/);
  const lines = j.list.map(e => JSON.stringify(e));
  writeFileSync(path, lines.map((l, i) => (i === 0 ? l.replace("Generate_Compliance_Packet", "File_Production_Report") : l)).join("\n") + "\n");
  const bad = run("verify", path);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stdout, /broken/);
});

test("igl --help exits 0 and an unknown command exits 2", () => {
  assert.equal(run("--help").status, 0);
  assert.equal(run("--version").stdout.trim().length > 0, true);
  assert.equal(run("nope").status, 2);
});
