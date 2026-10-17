import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const cli = fileURLToPath(new URL("../bin/igl.mjs", import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], {
  cwd: tmpdir(),
  env: { ...process.env, NO_COLOR: "1" },
  encoding: "utf8",
  timeout: 5000,
});

test("CLI demo runs model-free, receipts both outcomes and detects tampering", () => {
  const result = run("demo");
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /ALLOWED draft-incident-report.*ran/);
  assert.match(result.stdout, /REFUSED restore-production-systems.*IGL_FOOTPRINT_DENIED/);
  assert.equal((result.stdout.match(/Receipt DEMO-\d+ \| Ed25519/g) || []).length, 2);
  assert.equal((result.stdout.match(/Journal seq \d+, hash [0-9a-f]{16}/g) || []).length, 2);
  assert.match(result.stdout, /chain verified, \d+ entries/);
  assert.match(result.stdout, /TAMPER DETECTED.*verification failed at sequence 1/);
  assert.match(result.stdout, /README quick start and docs\/SPEC\.md/);
  assert.ok(!result.stdout.includes("\x1b["));
});

test("CLI help and no arguments print usage", () => {
  for (const args of [[], ["--help"]]) {
    const result = run(...args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: igl/);
    assert.match(result.stdout, /demo.*no model or network/);
  }
});

test("CLI version matches the package", () => {
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const result = run("--version");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), version);
});

test("CLI rejects unknown commands and extra arguments", () => {
  for (const args of [["unknown"], ["demo", "unexpected"]]) {
    const result = run(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /use igl --help/);
  }
});
