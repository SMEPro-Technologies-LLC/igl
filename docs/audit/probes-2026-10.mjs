import { MemoryJournal, FileJournal } from "../../src/store.js";
import { IOSRuntime } from "../../src/runtime.js";
import { writeFileSync } from "node:fs";

const out = {};
// P1: context reuse mutates a journaled trace and breaks chain verification
{
  const j = new MemoryJournal();
  const ios = new IOSRuntime({ journal: j });
  const trace = { id: "t1", intent: "X", identity: { actor: "A" }, boundary: {}, attestation: "ai", confidence: 0.9, reuseCount: 0, statementKey: "k1", outputs: {} };
  ios.write(trace);
  const before = j.verify();
  const sel = ios.select({ n: 20 }, { identity: { actor: "A" }, boundary: {}, intent: "X" });
  ios.markReused(sel.traces);
  const after = j.verify();
  out.P1_reuse_breaks_chain = { before: before.ok, after: after.ok, reason: after.reason || null, reuseCountNow: j.entries("trace")[0].body.reuseCount };
}
// P2: Traces=None → n=0 → slice(-0) returns the whole pool
{
  const ios = new IOSRuntime({});
  for (let i = 0; i < 3; i++) ios.write({ id: "t" + i, intent: "X", identity: { actor: "A" }, boundary: {}, attestation: "deterministic", statementKey: "s" + i, outputs: {} });
  const sel = ios.select({ n: 0 }, { identity: { actor: "A" }, boundary: {}, intent: "X" });
  out.P2_traces_none_returns = sel.traces.length;
}
// P3: idempotency key ignores compute arguments and context (reconstructed from interpreter.js:134-135)
{
  const hash = s => { let h1 = 0x811c9dc5, h2 = 0x01000193; for (let i = 0; i < s.length; i++) { h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 0x01000193) >>> 0; h2 ^= s.charCodeAt(s.length - 1 - i); h2 = Math.imul(h2, 0x85ebca6b) >>> 0; } return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0"); };
  const key = (computeArgs) => hash(JSON.stringify({ a: "Maria", b: { jurisdiction: "US-TX" }, i: "File_Production_Report", p: { Period: "2026-Q3" }, c: ["UDM.Resolve", "AI.Extract"] }));
  out.P3_same_key_for_different_compute_args = key({ RequiredForms: ["W-3"] }) === key({ RequiredForms: ["P-5"] });
  out.P3_key_bits = 64;
}
// P4: chain truncation passes verify()
{
  const j = new MemoryJournal();
  for (let i = 0; i < 5; i++) j.append("trace", { id: "t" + i });
  const full = j.verify();
  j.list = j.list.slice(0, 3);            // drop a suffix
  const truncated = j.verify();
  out.P4_truncation = { fullLength: full.length, truncatedLength: truncated.length, truncatedStillOk: truncated.ok };
}
// P5: FileJournal replay forgets in-memory reuseCount mutation (state diverges across restart)
{
  const p = new URL("./probe-journal.jsonl", import.meta.url).pathname; writeFileSync(p, "");
  const j = new FileJournal(p); const ios = new IOSRuntime({ journal: j });
  ios.write({ id: "t1", intent: "X", identity: { actor: "A" }, boundary: {}, attestation: "ai", confidence: 0.9, reuseCount: 0, statementKey: "k", outputs: {} });
  ios.markReused(ios.traces);
  const live = ios.traces[0].reuseCount;
  const j2 = new FileJournal(p); const ios2 = new IOSRuntime({ journal: j2 });
  out.P5_reuse_after_restart = { liveReuseCount: live, replayedReuseCount: ios2.traces[0].reuseCount, replayVerifies: j2.verify().ok };
}
// P6: append pushes to memory before persist succeeds
{
  class Failing extends MemoryJournal { persist() { throw new Error("disk full"); } }
  const j = new Failing(); let threw = false;
  try { j.append("trace", { id: "t1" }); } catch { threw = true; }
  out.P6_entry_visible_after_failed_persist = { threw, entriesVisible: j.entries().length };
}
console.log(JSON.stringify(out, null, 2));
