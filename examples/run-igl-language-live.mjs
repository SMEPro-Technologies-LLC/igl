/* Execute the generated IGL programs for the two computed identity graphs,
   with a REAL model (Xenova/distilgpt2) bound in as the interpreter's AI
   runtime through the bridge automaton. The model is not adjacent to the
   language — it operates INSIDE it: every AI.Extract step is compiled by
   gamma() into a per-token mask over the model's vocabulary derived from
   the actor's granted footprint, and lifted back by project().

   Artifacts: artifacts/igl-hilcorp-program-run.json, igl-jordan-avery-program-run.json */

import { AutoTokenizer, AutoModelForCausalLM, Tensor } from "@xenova/transformers";
import { Interpreter, UDMRuntime, AIRuntime, IOSRuntime } from "../src/interpreter.js";
import { Bridge } from "../src/bridge.js";
import { GraphRuntime, DEFAULT_DIMENSIONS } from "../src/graph.js";
import { Signer as TraceSigner } from "../src/sign.js";
import { INTENTS } from "../src/builtins.js";
import { governedStep } from "../src/decode.js";
import { sha256, canonical } from "../src/sign.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.join(HERE, "..", "artifacts");
const PROGRAMS = path.join(HERE, "..", "programs");
fs.mkdirSync(ARTIFACTS, { recursive: true });

const MODEL_ID = "Xenova/distilgpt2";
const MAX_STEPS = 24;

console.log(`[igl-live] loading ${MODEL_ID}…`);
const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
const model = await AutoModelForCausalLM.from_pretrained(MODEL_ID);
const VOCAB = tokenizer.model.vocab;
console.log(`[igl-live] model ready — vocab ${VOCAB.length}`);

async function rawNextDist(ids) {
  const input_ids = new Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]);
  const out = await model({ input_ids });
  const [, seq, v] = out.logits.dims;
  const row = Array.from(out.logits.data.slice((seq - 1) * v, seq * v));
  const mx = Math.max(...row);
  const exps = row.map((z) => Math.exp(z - mx));
  const s = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / s);
}

async function governedGenerate({ prompt, automaton }) {
  const promptIds = tokenizer.encode(prompt);
  const generated = [];
  const trace = [];
  let outcome = "COMPLIANT";
  for (let step = 0; step < MAX_STEPS; step++) {
    const mask = Bridge.maskNext(automaton, generated);
    if (!mask) { outcome = "HARD_VIOLATION"; trace.push({ step, outcome, prefixLeftLanguage: true }); break; }
    if (mask.accepting && generated.length > 0) break;
    const raw = await rawNextDist([...promptIds, ...generated]);
    const weights = new Array(VOCAB.length).fill(0);
    for (const id of mask.allowed) weights[id] = 1;
    const rec = governedStep(VOCAB, raw, weights, null, step, "HARD");
    if (rec.zeroPartition) { outcome = "HARD_VIOLATION"; trace.push({ step, outcome, zeroPartition: true }); break; }
    const picked = rec.governed.indexOf(Math.max(...rec.governed));
    trace.push({
      step, allowedSetSize: mask.allowed.length,
      rawTop: rec.record.rawTop, governedTop: rec.record.governedTop,
      entropyRaw: rec.record.entropyRaw, entropyGoverned: rec.record.entropyGoverned,
      rawDigest: rec.record.rawDigest, governedDigest: rec.record.governedDigest,
    });
    generated.push(picked);
  }
  let chain = "";
  for (const r of trace) chain = sha256(chain + (r.governedDigest || sha256(canonical(r))));
  return { text: tokenizer.decode(generated), trace, outcome, decodeDigest: chain };
}

/* The interpreter's AI subsystem, replaced by the live governed model.
   Admissible sets are read from the actor's LIVE granted footprint at the
   moment of execution — not from configuration. */
class GovernedAI extends AIRuntime {
  constructor({ graph, bridge, prompts, ...rest }) {
    super(rest);
    this.graph = graph;
    this.bridge = bridge;
    this.prompts = prompts;
  }
  async extract(args, ctx) {
    const pinned = this.models[args.Model];
    if (!pinned) throw new Error(`model ${args.Model} is not registered`);
    const actor = ctx.identity.actor;
    const fp = this.graph.footprint(actor);

    const specs = [];
    for (const name of args.Slots || []) {
      const def = this.slots[name];
      if (!def) throw new Error(`slot ${name} is not in the governed slot registry`);
      const admissible = fp.granted[def.dimension] || [];
      if (!admissible.length)
        throw new Error(`slot ${name}: the granted footprint of ${actor} covers no value for ${def.dimension} — failing closed`);
      specs.push({ name, kind: def.kind, dimension: def.dimension, admissible });
    }

    const envelope = this.bridge.gamma(ctx.boundary, specs, { model: args.Model, seed: args.Seed ?? null });

    const slots = {}, projections = [], decodes = {};
    let conf = 1, anyAbstain = false;
    for (const spec of specs) {
      const gen = await governedGenerate({ prompt: this.prompts[spec.name](ctx), automaton: envelope.maskPlan[spec.name] });
      const lifted = this.bridge.project(gen.text.trim(), { admissible: spec.admissible, dimension: spec.dimension, kind: spec.kind });
      decodes[spec.name] = gen;
      projections.push({ slot: spec.name, emitted: gen.text, ...lifted, decodeDigest: gen.decodeDigest, outcome: gen.outcome, steps: gen.trace.length });
      slots[spec.name] = { value: lifted.value ?? null, how: lifted.how, valueClass: "ai" };
      if (lifted.abstained) anyAbstain = true;
      const last = gen.trace.filter((t) => t.governedTop).pop();
      if (last) conf = Math.min(conf, last.governedTop[0]?.p ?? 0);
    }

    return {
      assertion: "extraction",
      model: args.Model, modelVersion: pinned.version, seed: args.Seed ?? null,
      manifest: envelope.manifest,
      slots, projections, decodes,
      unmapped: [], abstained: anyAbstain,
      verification: { soundness: "alpha(gamma(S)) subset-of downclosure(S) + ABSTAIN", masks: "prefix-automaton per slot" },
      attestation: "ai",
      confidence: Number(conf.toFixed(4)),
      depth: 1,
    };
  }
}

/* ---------------- shared graph construction (same folds as the decode runs) ---------------- */
function hilcorpGraph() {
  const g = new GraphRuntime();
  g.grant("Hilcorp_Energy", { Jurisdiction: ["US-TX", "US-NM", "US-LA"], Commodity: ["Oil", "Gas", "NGL"], Period: ["2026-Q3"] },
    { by: "SMEPro Governance Board", role: "Operator" });
  g.observe("Hilcorp_Energy", { Jurisdiction: ["US-TX"], Commodity: ["Gas"] }, { cls: "deterministic" });
  g.observe("Hilcorp_Energy", { Jurisdiction: ["US-CA"] }, { cls: "ai" });
  g.observe("Hilcorp_Energy", { Jurisdiction: ["US-CA"] }, { cls: "ai" });
  g.observe("Hilcorp_Energy", { Jurisdiction: ["US-CA"] }, { cls: "ai" });
  return g;
}
function averyGraph() {
  const dimensions = { ...DEFAULT_DIMENSIONS, Action: { type: "set" } };
  const g = new GraphRuntime({ dimensions });
  g.grant("Jordan_Avery",
    { Action: ["triage-alert", "acquire-disk-image", "preserve-evidence", "draft-incident-report"] },
    { by: "CISO Office", role: "DFIR_Coordinator" });
  for (let i = 0; i < 3; i++) g.observe("Jordan_Avery", { Action: ["capture-volatile-memory"] }, { cls: "deterministic" });
  for (let i = 0; i < 5; i++) g.observe("Jordan_Avery", { Action: ["restore-production-systems"] }, { cls: "ai" });
  return g;
}

const tok = { encode: (s) => tokenizer.encode(s) };
const models = { "distilgpt2-local": { version: "Xenova/distilgpt2@onnx-q8" } };

/* ================= RUN 1 — Hilcorp program ================= */
async function runHilcorpProgram() {
  const graph = hilcorpGraph();
  const udm = new UDMRuntime({
    boundaries: {
      Jurisdiction: { values: ["US", "US-TX", "US-NM", "US-LA", "US-CA", "TX-RRC", "NM-OCD", "LA-DNR"] },
      Commodity: { values: ["Hydrocarbon", "Oil", "Gas", "NGL"] },
      Period: { values: ["2026-Q3"] },
    },
    forms: { "TX-RRC": { forms: ["PR-202", "PR-203"] } },
    constraints: { production_integrity: [{ name: "packet-produced", test: (t) => !!t && t.produced === true }] },
  });
  const bridge = new Bridge({ dimensions: DEFAULT_DIMENSIONS, strictness: "lattice", tokenizer: tok });
  const ai = new GovernedAI({
    graph, bridge, models,
    slots: { jurisdiction: { kind: "code", dimension: "Jurisdiction" }, commodity: { kind: "code", dimension: "Commodity" } },
    prompts: {
      jurisdiction: () => "Hilcorp Energy files its gas production report with the regulator in jurisdiction",
      commodity: () => "The primary commodity Hilcorp Energy produces is",
    },
  });
  const attestSigner = TraceSigner.generate("smepro-governance-board");
  const interp = new Interpreter({
    identity: graph, udm, ai, ios: new IOSRuntime(),
    signers: { SMEPro_Governance_Board: attestSigner },
  });
  const source = fs.readFileSync(path.join(PROGRAMS, "hilcorp-energy-boundary.igl"), "utf8");
  const result = await interp.run(source);
  const filingTrace = result.traces.find((t) => t.intent === "File_Production_Report");
  const receiptVerification = filingTrace?.receipt ? TraceSigner.verifyTraceReceipt(filingTrace) : null;
  return { program: source, graph: graph.footprint("Hilcorp_Energy"), result, receiptVerification };
}

/* ================= RUN 2 — Avery program ================= */
async function runAveryProgram() {
  const graph = averyGraph();
  const udm = new UDMRuntime({
    boundaries: {
      Action: {
        values: ["triage-alert", "acquire-disk-image", "preserve-evidence", "draft-incident-report",
                 "capture-volatile-memory", "restore-production-systems"],
      },
    },
  });
  const bridge = new Bridge({ dimensions: { ...DEFAULT_DIMENSIONS, Action: { type: "set" } }, strictness: "exact", tokenizer: tok });
  const ai = new GovernedAI({
    graph, bridge, models,
    slots: { dfir_action: { kind: "enum", dimension: "Action" } },
    prompts: { dfir_action: () => "As DFIR Coordinator, the next action Jordan Avery is authorised to take is" },
  });
  const intents = {
    ...INTENTS,
    Execute_DFIR_Action: {
      roles: ["DFIR_Coordinator"],
      requiresBoundary: ["Action"],
      outputs: { Action_Record: "artifact", TurnTrace_ID: "code" },
      requiresAttestation: false,
      params: {},
    },
  };
  const interp = new Interpreter({ identity: graph, udm, ai, ios: new IOSRuntime(), intents });
  const source = fs.readFileSync(path.join(PROGRAMS, "jordan-avery-dfir-footprint.igl"), "utf8");
  const result = await interp.run(source);
  return { program: source, graph: graph.footprint("Jordan_Avery"), promotions: graph.promotions("Jordan_Avery"), result };
}

const hilcorp = await runHilcorpProgram();
console.log("\n[Hilcorp program] statements:");
for (const r of hilcorp.result.results) console.log(`  ${r.traceId ?? "-"} ${r.status} ${r.trace?.intent ?? r.error?.code ?? ""}`);
console.log(`[Hilcorp] filing receipt verifies: ${JSON.stringify(hilcorp.receiptVerification)}`);

const avery = await runAveryProgram();
console.log("\n[Avery program] statements:");
for (const r of avery.result.results) console.log(`  ${r.traceId ?? "-"} ${r.status} ${r.trace?.intent ?? r.error?.code ?? ""} ${r.error ? "— " + r.error.message.slice(0, 140) : ""}`);

fs.writeFileSync(path.join(ARTIFACTS, "igl-hilcorp-program-run.json"), JSON.stringify(hilcorp, null, 2));
fs.writeFileSync(path.join(ARTIFACTS, "igl-jordan-avery-program-run.json"), JSON.stringify(avery, null, 2));
console.log(`\n[igl-live] artifacts written to ${ARTIFACTS}`);
