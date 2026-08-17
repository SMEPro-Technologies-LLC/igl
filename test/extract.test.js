/* End-to-end: AI.Extract through the bridge, from inside the language. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Interpreter, Bridge, UDMRuntime, AIRuntime, IOSRuntime, GraphRuntime, SLOTS, DEFAULT_DIMENSIONS } from "../src/index.js";
import { sha256 } from "../src/bridge.js";

const DOC = "Provider 14 statement.\nTotal charges: $1,247,893.00 for the period.\nDate of service: 2019-04-11.";
const source = id => (id === "USSH004120" ? DOC : null);
const MANIFEST = { USSH004120: sha256(DOC) };
const OFFSET = DOC.indexOf("$1,247,893.00");

const udm = () => new UDMRuntime({
  boundaries: { Matter: { values: ["2026-CV-04417"] }, Jurisdiction: { values: ["TX-RRC", "US-TX"] } },
  forms: { "TX-RRC": { forms: ["PR-202", "H-10"] } },
});

const graph = () => {
  const g = new GraphRuntime({ roles: { Hobson: ["Counsel"] }, dimensions: DEFAULT_DIMENSIONS });
  g.grant("Hobson", { Matter: ["2026-CV-04417"] }, { by: "admin", role: "Counsel" });
  return g;
};

/* Adversarial on two axes: a wrong diagnosis phrasing outside the set, and a
   high-confidence span. The transcription attack is exercised separately —
   under R7 an extra property now voids the span at the schema, so the clean
   ref is the payload here. */
const adversarial = async () => ({
  structured: {
    total_charges: { file: "USSH004120", charOffset: OFFSET, length: 13 },
    diagnosis: "mesothelioma of the pleura",
  },
  confidences: { total_charges: 0.83, diagnosis: 0.44 },
  confidence: 0.7,
});

const mkInterp = (invoke = adversarial, strictness = "lattice") => {
  const u = udm();
  const bridge = new Bridge({ udm: u, dimensions: DEFAULT_DIMENSIONS, strictness });
  return new Interpreter({
    identity: graph(), udm: u, ios: new IOSRuntime(),
    ai: new AIRuntime({ models: { "claude-sonnet-5": { version: "2026-05-01" } },
      invoke, bridge, slots: SLOTS, source, manifest: MANIFEST }),
  });
};

const PROG = `ID[Hobson:Counsel | Matter:2026-CV-04417]
  :: Intent[Assess_Production_Integrity]
  => Compute[
       AI.Extract(Slots=[total_charges, diagnosis], Model=claude-sonnet-5, Seed=5),
       IOS.Trace(Channels=[Reasoning, Tools, Context])
     ]
  -> Output[Integrity_Report, TurnTrace_ID];`;

test("AI.Extract reads the quantity from the cited characters, in minor units, with the document digest pinned", async () => {
  const { results } = await mkInterp().run(PROG);
  assert.equal(results[0].status, "committed");
  const ex = results[0].trace.assertions.find(a => a.assertion === "extraction");
  assert.equal(ex.slots.total_charges.value, 124789300);
  assert.equal(ex.slots.total_charges.units, "minor");
  assert.equal(ex.slots.total_charges.valueClass, "deterministic");
  assert.equal(ex.slots.total_charges.evidence.chars, "$1,247,893.00");
  assert.equal(ex.slots.total_charges.evidence.docSha256, MANIFEST.USSH004120);
});

test("a span smuggling a transcription is voided at the schema — the model's number cannot enter at all", async () => {
  const smuggler = async () => ({
    structured: { total_charges: { file: "USSH004120", charOffset: OFFSET, length: 13, value: 999 } },
    confidences: { total_charges: 0.95 },
  });
  const { results } = await mkInterp(smuggler).run(`ID[Hobson:Counsel | Matter:2026-CV-04417]
    :: Intent[Assess_Production_Integrity]
    => Compute[AI.Extract(Slots=[total_charges], Model=claude-sonnet-5), IOS.Trace(Channels=[Reasoning])]
    -> Output[Integrity_Report];`);
  const ex = results[0].trace.assertions.find(a => a.assertion === "extraction");
  assert.equal(ex.slots.total_charges, undefined);
  assert.match(ex.unmapped[0].reason, /unexpected property: value/);
});

test("an out-of-set value is unmapped rather than accepted", async () => {
  const { results } = await mkInterp().run(PROG);
  const ex = results[0].trace.assertions.find(a => a.assertion === "extraction");
  assert.equal(ex.slots.diagnosis, undefined);
  assert.ok(ex.unmapped.some(u => u.slot === "diagnosis"));
});

test("fuzzy strictness repairs a normalisable enum and records the repair", async () => {
  const near = async () => ({ structured: { diagnosis: "Asbestosis" }, confidences: { diagnosis: 0.9 } });
  const it = mkInterp(near, "fuzzy");
  const r2 = await it.run(`ID[Hobson:Counsel | Matter:2026-CV-04417]
    :: Intent[Assess_Production_Integrity]
    => Compute[AI.Extract(Slots=[diagnosis], Model=claude-sonnet-5), IOS.Trace(Channels=[Reasoning])]
    -> Output[Integrity_Report];`);
  const ex2 = r2.results[0].trace.assertions.find(a => a.assertion === "extraction");
  assert.equal(ex2.slots.diagnosis.value, "asbestosis");
  assert.equal(ex2.slots.diagnosis.projectedBy, "normalised");
});

test("ANCHOR GATE: read-from-source is deterministic only above the admissible band", async () => {
  const confident = async () => ({
    structured: { total_charges: { file: "USSH004120", charOffset: OFFSET, length: 13 } },
    confidences: { total_charges: 0.9 },
  });
  const r1 = await mkInterp(confident).run(`ID[Hobson:Counsel | Matter:2026-CV-04417]
    :: Intent[Assess_Production_Integrity]
    => Compute[AI.Extract(Slots=[total_charges], Model=claude-sonnet-5), IOS.Trace(Channels=[Reasoning])]
    -> Output[Integrity_Report];`);
  assert.equal(r1.results[0].trace.attestation, "deterministic", "admissible-band location + read value = anchor");
  assert.equal(r1.results[0].trace.depth, 0);

  const unsure = async () => ({
    structured: { total_charges: { file: "USSH004120", charOffset: OFFSET, length: 13 } },
    confidences: { total_charges: 0.5 },
  });
  const r2 = await mkInterp(unsure).run(`ID[Hobson:Counsel | Matter:2026-CV-04417]
    :: Intent[Assess_Production_Integrity]
    => Compute[AI.Extract(Slots=[total_charges], Model=claude-sonnet-5), IOS.Trace(Channels=[Reasoning])]
    -> Output[Integrity_Report];`);
  const t2 = r2.results[0].trace;
  const ex2 = t2.assertions.find(a => a.assertion === "extraction");
  assert.equal(ex2.slots.total_charges.valueClass, "proposed", "a 50%-confident location cannot mint an anchor");
  assert.equal(t2.attestation, "ai", "the trace class falls to ai");
  assert.ok(t2.depth >= 1, "and it enters the drift budget");

  const lost = async () => ({
    structured: { total_charges: { file: "USSH004120", charOffset: OFFSET, length: 13 } },
    confidences: { total_charges: 0.1 },
  });
  const r3 = await mkInterp(lost).run(`ID[Hobson:Counsel | Matter:2026-CV-04417]
    :: Intent[Assess_Production_Integrity]
    => Compute[AI.Extract(Slots=[total_charges], Model=claude-sonnet-5), IOS.Trace(Channels=[Reasoning])]
    -> Output[Integrity_Report];`);
  const ex3 = r3.results[0].trace.assertions.find(a => a.assertion === "extraction");
  assert.equal(ex3.slots.total_charges, undefined, "held means dropped");
});

test("UDM computes the admissible set at the boundary; an empty one fails closed", async () => {
  const u = new UDMRuntime({ boundaries: { Matter: { values: ["2026-CV-04417"] } }, forms: {} });
  const it = new Interpreter({
    identity: graph(), udm: u, ios: new IOSRuntime(),
    ai: new AIRuntime({ models: { "claude-sonnet-5": { version: "2026-05-01" } },
      invoke: adversarial, bridge: new Bridge({ udm: u, dimensions: DEFAULT_DIMENSIONS }), slots: SLOTS, source, manifest: MANIFEST }),
  });
  const { results } = await it.run(`ID[Hobson:Counsel | Matter:2026-CV-04417]
    :: Intent[Assess_Production_Integrity]
    => Compute[AI.Extract(Slots=[form], Model=claude-sonnet-5), IOS.Trace(Channels=[Reasoning])]
    -> Output[Integrity_Report];`);
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].error.code, "IGL_EMPTY_ADMISSIBLE");
});

test("a slot outside the governed registry is refused", async () => {
  const { results } = await mkInterp().run(`ID[Hobson:Counsel | Matter:2026-CV-04417]
    :: Intent[Assess_Production_Integrity]
    => Compute[AI.Extract(Slots=[bank_account], Model=claude-sonnet-5), IOS.Trace(Channels=[Reasoning])]
    -> Output[Integrity_Report];`);
  assert.equal(results[0].error.code, "IGL_UNKNOWN_SLOT");
});

test("the translation manifest is in the trace, so admissibility is auditable", async () => {
  const { results } = await mkInterp().run(PROG);
  const ex = results[0].trace.assertions.find(a => a.assertion === "extraction");
  assert.match(ex.manifest.schemaDigest, /^[0-9a-f]{64}$/);
  assert.equal(ex.manifest.slots.total_charges, "span");
  assert.equal(ex.manifest.strictness, "lattice");
  assert.equal(ex.seed, 5);
  assert.equal(ex.modelVersion, "2026-05-01");
});
