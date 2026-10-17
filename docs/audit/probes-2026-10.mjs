/* The probes that reproduced findings F-05 to F-09 of the October 2026
   review, kept as a runnable record. They were promoted into the test suite
   as test/audit.test.js, which is the authoritative version; this file prints
   the same properties as JSON so a reader can see them hold (or not) in one
   command:

       node docs/audit/probes-2026-10.mjs

   Against v1.2.1 every property below was false. */

import { MemoryJournal, FileJournal, IOSRuntime, Interpreter, IdentityRuntime, UDMRuntime, AIRuntime } from "../../src/index.js";
import { writeFileSync, unlinkSync } from "node:fs";

const out = {};
const trace = (id, extra = {}) => ({ id, intent: "X", identity: { actor: "A" }, boundary: {}, attestation: "ai", confidence: 0.9, statementKey: "k-" + id, outputs: {}, ...extra });

// P1 (F-06): context reuse must not alter a journaled trace or break the chain
{
  const j = new MemoryJournal();
  const ios = new IOSRuntime({ journal: j });
  ios.write(trace("t1"));
  const before = j.verify().ok;
  const sel = ios.select({ n: 20 }, { identity: { actor: "A" }, boundary: {}, intent: "X" });
  ios.markReused(sel.traces);
  out.P1_reuse_keeps_chain = { before, after: j.verify().ok, journaledReuseCount: j.entries("trace")[0].body.reuseCount ?? 0, derivedReuseCount: ios.reuseCount(sel.traces[0]), reuseEvents: j.entries("reuse").length };
}
// P2 (F-09): Traces=None returns nothing
{
  const ios = new IOSRuntime({});
  for (let i = 0; i < 3; i++) ios.write(trace("t" + i, { attestation: "deterministic" }));
  out.P2_traces_none_returns = ios.select({ n: 0 }, { identity: { actor: "A" }, boundary: {}, intent: "X" }).traces.length;
}
// P3 (F-05): different compute arguments are different work; the key is SHA-256
{
  const it = new Interpreter({
    identity: new IdentityRuntime({ actors: { Allco: { roles: ["Operator"], defaultRole: "Operator" } } }),
    udm: new UDMRuntime({ boundaries: { Jurisdiction: { values: ["TX-RRC"] }, Commodity: { values: ["Oil"] }, Period: { values: ["2026-Q3"] } }, forms: { "TX-RRC": { forms: ["W-3", "P-5"] } } }),
    ai: new AIRuntime({ models: {} }), ios: new IOSRuntime(),
  });
  const p = (f) => `ID[Allco:Operator | Jurisdiction:TX-RRC, Commodity:Oil, Period:2026-Q3] :: Intent[Generate_Compliance_Packet] => Compute[UDM.Resolve(AgencyCode=TX-RRC, RequiredForms=[${f}]), IOS.Trace(Channels=[Reasoning])] -> Output[Compliance_Packet];`;
  const a = (await it.run(p("W-3"))).results[0], b = (await it.run(p("P-5"))).results[0];
  out.P3_different_args_same_key = a.trace.statementKey === b.trace.statementKey;
  out.P3_second_statement_status = b.status;
  out.P3_key_bits = a.trace.statementKey.length * 4;
}
// P4 (F-08): truncation is detected against a checkpoint
{
  const j = new MemoryJournal();
  for (let i = 0; i < 5; i++) j.append("trace", { id: "t" + i });
  const cp = j.checkpoint();
  j.list = j.list.slice(0, 3); j.durable = 3;            // drop a suffix
  out.P4_truncation = { fullLength: cp.length, truncatedLength: j.list.length, verifiesWithoutCheckpoint: j.verify().ok, verifiesAgainstCheckpoint: j.verify({ checkpoint: cp }).ok };
}
// P5 (F-06): reuse survives a restart
{
  const p = new URL("./probe-journal.jsonl", import.meta.url).pathname; writeFileSync(p, "");
  const ios = new IOSRuntime({ journal: new FileJournal(p) });
  ios.write(trace("t1"));
  ios.markReused(ios.traces);
  const ios2 = new IOSRuntime({ journal: new FileJournal(p) });
  out.P5_reuse_after_restart = { liveReuseCount: ios.reuseCount(ios.traces[0]), replayedReuseCount: ios2.reuseCount(ios2.traces[0]), replayVerifies: ios2.journal.verify().ok };
  unlinkSync(p);
}
// P6 (F-07): a failed persist leaves nothing visible
{
  class Failing extends MemoryJournal { persist() { throw new Error("disk full"); } }
  const j = new Failing(); let threw = false;
  try { j.append("trace", { id: "t1" }); } catch { threw = true; }
  out.P6_entry_visible_after_failed_persist = { threw, entriesVisible: j.entries().length };
}
console.log(JSON.stringify(out, null, 2));
