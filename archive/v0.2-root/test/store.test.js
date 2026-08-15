import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryJournal, FileJournal, D1Journal, GraphRuntime, IOSRuntime, Interpreter, UDMRuntime, AIRuntime, DEFAULT_DIMENSIONS } from "../src/index.js";

const tmp = () => join(mkdtempSync(join(tmpdir(), "igl-")), "journal.jsonl");

/* ---------------- the chain ---------------- */
test("the journal is a verifiable hash chain", () => {
  const j = new MemoryJournal();
  j.append("graph", { kind: "grant", actor: "Allco" });
  j.append("graph", { kind: "observe", actor: "Allco" });
  j.append("trace", { id: "TRC-000001" });
  const v = j.verify();
  assert.equal(v.ok, true);
  assert.equal(v.length, 3);
  assert.match(v.head, /^[0-9a-f]{64}$/);
});

test("TAMPER EVIDENCE: editing a persisted record breaks the chain at that record", () => {
  const path = tmp();
  const j = new FileJournal(path);
  j.append("graph", { kind: "grant", actor: "Allco", dims: { Jurisdiction: ["TX-RRC"] } });
  j.append("graph", { kind: "observe", actor: "Allco", dims: { Jurisdiction: ["TX-RRC"] } });
  j.append("graph", { kind: "observe", actor: "Allco", dims: { Jurisdiction: ["NM-OCD"] } });

  const lines = readFileSync(path, "utf8").trim().split("\n");
  const doctored = JSON.parse(lines[1]);
  doctored.body.dims.Jurisdiction = ["US"];         // quiet retro-widening
  lines[1] = JSON.stringify(doctored);
  writeFileSync(path, lines.join("\n") + "\n");

  /* tamper-evidence is load-bearing: the doctored journal refuses to LOAD,
     so the widened grant is never live, not merely detectable on request */
  assert.throws(() => new FileJournal(path),
    e => /seq 1/.test(e.message) && /does not reproduce its digest/.test(e.message) && /refusing to load/.test(e.message));
});

test("TAMPER EVIDENCE: deleting a record refuses the load", () => {
  const path = tmp();
  const j = new FileJournal(path);
  j.append("graph", { a: 1 }); j.append("graph", { a: 2 }); j.append("graph", { a: 3 });
  const lines = readFileSync(path, "utf8").trim().split("\n");
  writeFileSync(path, [lines[0], lines[2]].join("\n") + "\n");
  assert.throws(() => new FileJournal(path), /refusing to load a tampered chain/);
});

/* ---------------- persistence across processes ---------------- */
test("PERSISTENCE: a footprint folded in one process is identical after replay in another", () => {
  const path = tmp();
  const g1 = new GraphRuntime({ journal: new FileJournal(path), roles: { Allco: ["Operator"] } });
  g1.grant("Allco", { Jurisdiction: ["US-TX"] }, { by: "admin" });
  for (let i = 0; i < 7; i++) g1.observe("Allco", { Jurisdiction: ["TX-RRC"] }, { cls: i % 2 ? "ai" : "human" });
  const before = JSON.stringify(g1.footprint("Allco"));

  const g2 = new GraphRuntime({ journal: new FileJournal(path), roles: { Allco: ["Operator"] } });
  assert.equal(JSON.stringify(g2.footprint("Allco")), before, "replay must reconstruct the identical projection");
  assert.equal(g2.authorize("Allco", { Jurisdiction: "TX-RRC" }).ok, true, "authority survives the process boundary");
});

test("PERSISTENCE: idempotency holds across a restart — the same statement does not file twice", async () => {
  const path = tmp();
  const udm = () => new UDMRuntime({
    boundaries: { Jurisdiction: { values: ["TX-RRC"] }, Period: { values: ["2026-Q3"] } },
    forms: { "TX-RRC": { forms: ["PR-202"] } },
  });
  const ai = () => new AIRuntime({ models: { "claude-sonnet-5": { version: "2026-05-01" } }, invoke: async () => ({ text: "ok", confidence: 0.9 }) });
  const graph = () => {
    const g = new GraphRuntime({ roles: { Allco: ["Operator"] }, dimensions: DEFAULT_DIMENSIONS });
    g.grant("Allco", { Jurisdiction: ["TX-RRC"], Period: ["2026-Q3"] }, { by: "admin" });
    return g;
  };
  const PROG = `ID[Allco:Operator | Jurisdiction:TX-RRC, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet, Mode=Full]
    => Compute[UDM.Resolve(AgencyCode=TX-RRC, RequiredForms=[PR-202]), IOS.Trace(Channels=[Reasoning])]
    -> Output[Compliance_Packet, TurnTrace_ID];`;

  const a = await new Interpreter({ identity: graph(), udm: udm(), ai: ai(),
    ios: new IOSRuntime({ journal: new FileJournal(path) }) }).run(PROG);
  assert.equal(a.results[0].status, "committed");

  /* new process: fresh interpreter, same journal */
  const b = await new Interpreter({ identity: graph(), udm: udm(), ai: ai(),
    ios: new IOSRuntime({ journal: new FileJournal(path) }) }).run(PROG);
  assert.equal(b.results[0].status, "idempotent", "the journal carries the statement key across the restart");
  assert.equal(b.results[0].traceId, a.results[0].traceId);
});

/* ---------------- async durability gates commit ---------------- */
test("FAIL-CLOSED SURVIVES ASYNC: a failed D1 flush discards staged outputs", async () => {
  const failing = new D1Journal({ exec: async () => { throw new Error("D1 unavailable"); } });
  const g = new GraphRuntime({ roles: { Allco: ["Operator"] }, dimensions: DEFAULT_DIMENSIONS });
  g.grant("Allco", { Jurisdiction: ["TX-RRC"], Period: ["2026-Q3"] }, { by: "admin" });
  const it = new Interpreter({
    identity: g,
    udm: new UDMRuntime({ boundaries: { Jurisdiction: { values: ["TX-RRC"] }, Period: { values: ["2026-Q3"] } }, forms: { "TX-RRC": { forms: ["PR-202"] } } }),
    ai: new AIRuntime({ models: { "claude-sonnet-5": { version: "2026-05-01" } }, invoke: async () => ({ text: "ok", confidence: 0.9 }) }),
    ios: new IOSRuntime({ journal: failing }),
  });
  const { results } = await it.run(`ID[Allco:Operator | Jurisdiction:TX-RRC, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet]
    => Compute[UDM.Resolve(AgencyCode=TX-RRC), IOS.Trace(Channels=[Reasoning])]
    -> Output[Compliance_Packet];`);
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].error.code, "IGL_TRACE_FAILED");
  assert.equal(it.env.has("Compliance_Packet"), false, "no output may survive a failed flush");
});

test("D1Journal flushes as head-CAS + one batched INSERT — no mid-batch partial state", async () => {
  const calls = [];
  const j = new D1Journal({ exec: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.trimStart().startsWith("SELECT")) return { results: [] };   // empty table → head is GENESIS
  } });
  j.append("trace", { id: "TRC-000001" });
  j.append("graph", { kind: "observe" });
  await j.flush();
  assert.equal(calls.length, 2, "exactly one SELECT (CAS) and one INSERT (batch)");
  assert.match(calls[0].sql, /SELECT digest FROM igl_journal/);
  assert.match(calls[1].sql, /INSERT INTO igl_journal .* VALUES \(\?, \?, \?, \?, \?\), \(\?, \?, \?, \?, \?\)/);
  assert.equal(calls[1].params.length, 10, "both rows travel in one statement — all land or none do");
  assert.equal(j.pending.length, 0);
  assert.equal(j.verify().ok, true, "the in-memory chain is intact after flush");
});

test("HEAD-CAS: a concurrent writer having advanced the chain makes this writer lose loudly, not half-commit", async () => {
  const foreignHead = "f".repeat(64);
  const calls = [];
  const j = new D1Journal({ exec: async (sql, params) => {
    calls.push(sql);
    if (sql.trimStart().startsWith("SELECT")) return { results: [{ digest: foreignHead }] };
    throw new Error("INSERT must never be reached when the CAS fails");
  } });
  j.append("trace", { id: "TRC-000001" });
  await assert.rejects(() => j.flush(), /journal head moved/);
  assert.equal(calls.filter(s => s.startsWith("INSERT")).length, 0, "no partial write");
  assert.equal(j.pending.length, 1, "the entry stays pending for re-chain and retry");
});

test("the schema enforces append-only at the engine, not by convention", async () => {
  const { D1_SCHEMA } = await import("../src/store.js");
  assert.match(D1_SCHEMA, /BEFORE UPDATE ON igl_journal[\s\S]*RAISE\(ABORT/);
  assert.match(D1_SCHEMA, /BEFORE DELETE ON igl_journal[\s\S]*RAISE\(ABORT/);
});
