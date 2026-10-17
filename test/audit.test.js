/* Regression suite for the runtime findings of the October 2026 security
   review (docs/audit/SECURITY-AUDIT-2026-10.md), F-05 to F-09. Each test is
   the probe that reproduced the finding (docs/audit/probes-2026-10.mjs),
   promoted into the suite and inverted: what used to demonstrate the problem
   now demonstrates its absence. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryJournal, FileJournal, D1Journal, IOSRuntime, Interpreter, IdentityRuntime, UDMRuntime, AIRuntime, Signer } from "../src/index.js";

const tmp = () => join(mkdtempSync(join(tmpdir(), "igl-audit-")), "journal.jsonl");

const identity = new IdentityRuntime({ actors: { Allco: { roles: ["Operator"], defaultRole: "Operator" } } });
const udm = () => new UDMRuntime({
  boundaries: { Jurisdiction: { values: ["TX-RRC"] }, Commodity: { values: ["Oil"] }, Period: { values: ["2026-Q3"] } },
  forms: { "TX-RRC": { forms: ["PR-202", "H-10", "W-10"] } },
});
const models = { "claude-sonnet-5": { version: "2026-05-01" }, "claude-sonnet-5-next": { version: "2026-09-01" } };
const mk = (opts = {}) => new Interpreter({
  identity, udm: udm(),
  ai: new AIRuntime({ models, invoke: async () => ({ text: "ok", confidence: 0.9 }) }),
  ios: opts.ios || new IOSRuntime(opts.journal ? { journal: opts.journal } : {}),
  ...opts.extra,
});
const prog = (forms = "PR-202", { context = "Traces=Recent(20)", model = "claude-sonnet-5" } = {}) => `%igl 0.2
ID[Allco:Operator | Jurisdiction:TX-RRC, Commodity:Oil, Period:2026-Q3]
  :: Intent[Generate_Compliance_Packet, Mode=Full]
  => Context[${context}],
     Compute[UDM.Resolve(AgencyCode=TX-RRC, RequiredForms=[${forms}]), AI.Infer(Task=Missing_Fields, Model=${model}), IOS.Trace(Channels=[Reasoning])]
  -> Output[Compliance_Packet];`;

/* ---------------- F-05: execution identity ---------------- */
test("F-05: statements that differ only in compute arguments are different work, not an idempotent replay", async () => {
  const it = mk();
  const a = (await it.run(prog("PR-202"))).results[0];
  const b = (await it.run(prog("H-10"))).results[0];
  assert.equal(a.status, "committed");
  assert.equal(b.status, "committed", "a different RequiredForms list must execute, not replay the first result");
  assert.notEqual(a.trace.statementKey, b.trace.statementKey);
  const again = (await it.run(prog("PR-202"))).results[0];
  assert.equal(again.status, "idempotent", "the exact same work is still recognised");
  assert.equal(again.traceId, a.traceId);
});

test("F-05: the key covers context selection, the pinned model version and the declared outputs, and is SHA-256", async () => {
  const it = mk();
  const base = (await it.run(prog())).results[0].trace.statementKey;
  assert.match(base, /^[0-9a-f]{64}$/, "256-bit key");
  const ctx = (await it.run(prog("PR-202", { context: "Traces=Recent(5)" }))).results[0];
  assert.equal(ctx.status, "committed"); assert.notEqual(ctx.trace.statementKey, base);
  const model = (await it.run(prog("PR-202", { model: "claude-sonnet-5-next" }))).results[0];
  assert.equal(model.status, "committed"); assert.notEqual(model.trace.statementKey, base);
  const keys = it.statementKeys(prog());
  assert.equal(keys[0].statementKey, base, "statementKeys() previews the key the runtime will derive, so an approver can see what they sign");
});

test("F-05: a trace that is not durably committed cannot answer an idempotency check", async () => {
  let fail = true;
  const j = new D1Journal({ exec: async (sql) => { if (sql.trimStart().startsWith("SELECT")) return { results: [] }; if (fail) throw new Error("disk full"); return {}; } });
  const it = mk({ journal: j });
  const first = (await it.run(prog())).results[0];
  assert.equal(first.status, "failed"); assert.equal(first.error.code, "IGL_TRACE_FAILED");
  assert.equal(it.ios.byStatementKey(first.trace?.statementKey || ""), null, "nothing non-durable is findable");
  fail = false;
  const retry = (await it.run(prog())).results[0];
  assert.equal(retry.status, "committed", "the retry executes and commits; it does not get the failed attempt back as idempotent");
});

/* ---------------- F-06: immutable records ---------------- */
test("F-06: context reuse leaves the journaled trace untouched; the chain verifies before and after", () => {
  const j = new MemoryJournal();
  const ios = new IOSRuntime({ journal: j });
  const trace = { id: "t1", intent: "X", identity: { actor: "A" }, boundary: {}, attestation: "ai", confidence: 0.9, reuseCount: 0, statementKey: "k1", outputs: {} };
  ios.write(trace);
  assert.equal(j.verify().ok, true);
  const sel = ios.select({ n: 20 }, { identity: { actor: "A" }, boundary: {}, intent: "X" });
  ios.markReused(sel.traces, { statementTraceId: "t2" });
  ios.markReused(sel.traces, { statementTraceId: "t3" });
  assert.equal(j.verify().ok, true, "verification holds after reuse");
  assert.equal(j.entries("trace")[0].body.reuseCount, 0, "the record did not move");
  assert.equal(j.entries("reuse").length, 2, "reuse is its own journal event");
  assert.equal(ios.reuseCount(trace), 2, "the counter is derived from the events");
  assert.ok(ios.effectiveConfidence(trace) < 0.9, "and confidence decays from the derived counter");
  assert.throws(() => { j.entries("trace")[0].body.reuseCount = 5; }, TypeError, "journaled records are frozen");
});

test("F-06: reuse survives a restart, the live process and the replayed one agree", () => {
  const p = tmp();
  const ios = new IOSRuntime({ journal: new FileJournal(p) });
  const t = { id: "t1", intent: "X", identity: { actor: "A" }, boundary: {}, attestation: "ai", confidence: 0.9, statementKey: "k", outputs: {} };
  ios.write(t);
  ios.markReused([t]); ios.markReused([t]); ios.markReused([t]);
  const live = ios.reuseCount(t);
  const j2 = new FileJournal(p);
  const ios2 = new IOSRuntime({ journal: j2 });
  assert.equal(j2.verify().ok, true);
  assert.equal(ios2.reuseCount(ios2.traces[0]), live, "decay does not reset on restart");
  assert.equal(live, 3);
});

test("F-06: a receipt over a trace still verifies after the trace has been reused", async () => {
  const runtime = Signer.generate("runtime");
  const j = new MemoryJournal();
  const it = mk({ journal: j, extra: { runtimeSigner: runtime } });
  const first = (await it.run(prog())).results[0];
  assert.equal(Signer.verifyTraceReceipt(first.trace).ok, true);
  const second = (await it.run(prog("H-10"))).results[0];
  assert.ok(second.trace.contextTraceIds.includes(first.traceId), "the second statement read the first as context");
  assert.equal(Signer.verifyTraceReceipt(j.entries("trace")[0].body).ok, true, "the journaled record still carries a valid receipt");
  assert.equal(j.verify().ok, true);
});

/* ---------------- F-07: visible means durable ---------------- */
test("F-07: a failed persist leaves nothing behind", () => {
  class Failing extends MemoryJournal { persist() { throw new Error("disk full"); } }
  const j = new Failing();
  assert.throws(() => j.append("trace", { id: "t1" }), /disk full/);
  assert.equal(j.entries().length, 0, "the entry is not visible");
  assert.equal(j.head(), "0".repeat(64), "and the chain did not advance");
});

test("F-07: write-behind entries are pending until flush succeeds, and roll back when it fails", async () => {
  let mode = "ok";
  const inserted = [];
  const j = new D1Journal({ exec: async (sql, params) => {
    if (sql.trimStart().startsWith("SELECT")) return { results: inserted.length ? [{ digest: inserted[inserted.length - 1] }] : [] };
    if (mode === "fail") throw new Error("D1 unavailable");
    for (let i = 4; i < params.length; i += 5) inserted.push(params[i]);
    return {};
  } });
  const e1 = j.append("trace", { id: "t1" });
  assert.equal(j.isDurable(e1), false);
  assert.equal(j.entries().length, 0, "pending entries are invisible to readers");
  assert.equal(j.entries(null, { pending: true }).length, 1, "but a reader who asks for the whole chain sees them");
  await j.flush();
  assert.equal(j.entries().length, 1, "durable after flush");
  mode = "fail";
  j.append("trace", { id: "t2" });
  await assert.rejects(() => j.flush(), /D1 unavailable/);
  assert.equal(j.entries(null, { pending: true }).length, 1, "the entry that never became durable is gone");
  assert.equal(j.head(), e1.digest, "the chain head is back at the last durable entry");
  mode = "ok";
  const e3 = j.append("trace", { id: "t2" });
  assert.equal(e3.prev, e1.digest, "the retry re-chains against the durable head");
  await j.flush();
  assert.equal(j.entries().length, 2);
  assert.equal(j.verify().ok, true);
});

test("F-07: the IOS runtime shows a trace only once it is durable; a failed flush discards the staged outputs", async () => {
  let fail = true;
  const j = new D1Journal({ exec: async (sql) => { if (sql.trimStart().startsWith("SELECT")) return { results: [] }; if (fail) throw new Error("flush failed"); return {}; } });
  const ios = new IOSRuntime({ journal: j });
  ios.write({ id: "t1", intent: "X", identity: { actor: "A" }, boundary: {}, attestation: "deterministic", statementKey: "k", outputs: {} });
  assert.equal(ios.find("t1"), null, "not visible before flush");
  await assert.rejects(() => ios.flush(), /flush failed/);
  assert.equal(ios.find("t1"), null, "not visible after a failed flush either");
  fail = false;
  ios.write({ id: "t1", intent: "X", identity: { actor: "A" }, boundary: {}, attestation: "deterministic", statementKey: "k", outputs: {} });
  await ios.flush();
  assert.ok(ios.find("t1"), "visible once durable");
});

test("F-07: the file journal persists each entry with fsync and replays it", () => {
  const p = tmp();
  const j = new FileJournal(p);
  j.append("trace", { id: "t1" });
  const onDisk = readFileSync(p, "utf8").trim().split("\n");
  assert.equal(onDisk.length, 1);
  assert.equal(JSON.parse(onDisk[0]).digest, j.head());
  assert.equal(new FileJournal(p).verify().ok, true);
});

/* ---------------- F-08: checkpoints ---------------- */
test("F-08: a truncated chain is refused against a checkpoint, and a rewritten one too", () => {
  const j = new MemoryJournal();
  for (let i = 0; i < 5; i++) j.append("trace", { id: "t" + i });
  const cp = j.checkpoint();
  assert.equal(j.verify({ checkpoint: cp }).ok, true);
  j.list = j.list.slice(0, 3); j.durable = 3;                           // a storage administrator drops a suffix
  assert.equal(j.verify().ok, true, "without an external anchor the shorter chain is self-consistent (the finding)");
  const v = j.verify({ checkpoint: cp });
  assert.equal(v.ok, false); assert.match(v.reason, /truncated/);
  const k = new MemoryJournal();
  for (let i = 0; i < 5; i++) k.append("trace", { id: "x" + i });      // same length, different history
  const w = k.verify({ checkpoint: cp });
  assert.equal(w.ok, false); assert.match(w.reason, /rewritten/);
});

test("F-08: a journal constructed with a checkpoint refuses to load a truncated file", () => {
  const p = tmp();
  const j = new FileJournal(p);
  for (let i = 0; i < 4; i++) j.append("trace", { id: "t" + i });
  const cp = j.checkpoint();
  const lines = readFileSync(p, "utf8").trim().split("\n");
  writeFileSync(p, lines.slice(0, 2).join("\n") + "\n");
  assert.equal(new FileJournal(p).verify().ok, true, "the truncated file verifies on its own");
  assert.throws(() => new FileJournal(p, { checkpoint: cp }), /truncated/);
  const full = new FileJournal(p); full.append("trace", { id: "t2" }); full.append("trace", { id: "t3" });
  assert.equal(new FileJournal(p, { checkpoint: cp }).verify().ok, true, "the same history restored reaches the checkpoint again");
});

test("F-08: a signed head receipt is a checkpoint, and verifies against a chain that has grown since", () => {
  const j = new MemoryJournal();
  for (let i = 0; i < 3; i++) j.append("trace", { id: "t" + i });
  const r = Signer.generate("auditor").headReceipt(j);
  j.append("trace", { id: "t3" });
  assert.equal(Signer.verifyHeadReceipt(r, { journal: j }).ok, false, "the exact-head check still means exact");
  assert.equal(Signer.verifyHeadReceipt(r, { journal: j, extended: true }).ok, true, "as a checkpoint it accepts growth");
  j.list = j.list.slice(0, 2); j.durable = 2;
  const v = Signer.verifyHeadReceipt(r, { journal: j, extended: true });
  assert.equal(v.ok, false); assert.match(v.reason, /truncated/);
});

/* ---------------- F-09: Traces=None, and failures are journaled ---------------- */
test("F-09: Traces=None returns no context", async () => {
  const ios = new IOSRuntime({});
  for (let i = 0; i < 3; i++) ios.write({ id: "t" + i, intent: "X", identity: { actor: "A" }, boundary: {}, attestation: "deterministic", statementKey: "s" + i, outputs: {} });
  assert.equal(ios.select({ n: 0 }, { identity: { actor: "A" }, boundary: {}, intent: "X" }).traces.length, 0);
  const it = mk();
  await it.run(prog());
  const r = (await it.run(prog("H-10", { context: "Traces=None" }))).results[0];
  assert.equal(r.status, "committed");
  assert.deepEqual(r.trace.contextTraceIds, [], "a statement declared context-free inherits nothing");
  assert.equal(r.trace.contextPredicate.n, 0);
});

test("F-09: a refused statement leaves a durable failure record with privacy-safe fields", async () => {
  const j = new MemoryJournal();
  const it = mk({ journal: j });
  const r = (await it.run(prog("NOT-A-FORM"))).results[0];
  assert.equal(r.status, "failed"); assert.equal(r.error.code, "IGL_UNKNOWN_FORM");
  const failures = j.entries("failure");
  assert.equal(failures.length, 1);
  const f = failures[0].body;
  assert.equal(f.code, "IGL_UNKNOWN_FORM"); assert.equal(f.actor, "Allco"); assert.equal(f.intent, "Generate_Compliance_Packet"); assert.equal(f.phase, "udm");
  assert.ok(!("params" in f) && !("outputs" in f), "no parameters or outputs in the record");
  assert.equal(j.verify().ok, true);
});

test("F-09: a denial before any model work is journaled as a first-class event", async () => {
  const j = new MemoryJournal();
  const denying = new IdentityRuntime({ actors: { Allco: { roles: ["Operator"], defaultRole: "Operator" } } });
  denying.authorize = () => ({ ok: false, violations: [{ reason: "Jurisdiction=TX-RRC is not granted", note: "observed 5 times, granted never" }] });
  const it = new Interpreter({ identity: denying, udm: udm(), ai: new AIRuntime({ models, invoke: async () => { throw new Error("the model must not be called"); } }), ios: new IOSRuntime({ journal: j }) });
  const r = (await it.run(prog())).results[0];
  assert.equal(r.error.code, "IGL_FOOTPRINT_DENIED");
  assert.equal(j.entries("failure")[0].body.code, "IGL_FOOTPRINT_DENIED");
  assert.equal(j.entries("trace").length, 0, "no trace, no outputs, one denial record");
});

/* ---------------- lower-severity observations ---------------- */
test("an unknown ruleset is refused instead of validating everything", () => {
  const u = new UDMRuntime({ constraints: { production_integrity: [{ name: "nonempty", test: (t) => !!t }] } });
  assert.equal(u.Validate({ Target: "x", Ruleset: "production_integrity" }).ok, true);
  assert.throws(() => u.Validate({ Target: "x", Ruleset: "produktion_integrity" }), /IGL_UNKNOWN_RULESET|not defined/);
  assert.equal(u.Validate({ Target: "x" }).ok, true, "the implicit default may be empty");
});

/* ---------------- model provenance (review section 4) ---------------- */
test("model provenance: the pinned revision is a commit, and the cached bytes are hashed into the version string", async () => {
  const { modelProvenance, MODEL_REVISION, MODEL_ID } = await import("../provision/model.mjs");
  assert.match(MODEL_REVISION, /^[0-9a-f]{40}$/, "a commit hash, not a branch name");
  const cache = mkdtempSync(join(tmpdir(), "igl-model-"));
  const dir = join(cache, ...MODEL_ID.split("/"));
  const { mkdirSync } = await import("node:fs");
  mkdirSync(join(dir, "onnx"), { recursive: true });
  writeFileSync(join(dir, "config.json"), "{}"); writeFileSync(join(dir, "onnx", "decoder_model_merged_quantized.onnx"), "bytes-v1");
  const a = modelProvenance({ cacheDir: cache });
  assert.equal(a.files.length, 2);
  assert.match(a.version, new RegExp(`^${MODEL_ID}@${MODEL_REVISION.slice(0, 12)}#[0-9a-f]{16}$`));
  writeFileSync(join(dir, "onnx", "decoder_model_merged_quantized.onnx"), "bytes-v2");
  const b = modelProvenance({ cacheDir: cache });
  assert.notEqual(a.digest, b.digest, "different bytes, different version, even under the same label and revision");
  assert.equal(modelProvenance({ cacheDir: join(cache, "empty") }), null, "no cache, no provenance, and the loader refuses to proceed");
});
