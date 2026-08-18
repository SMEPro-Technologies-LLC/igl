/* Persistent identity graphs — hash-chained journal wiring (store.js).

   Two boots, two processes, one chain per actor:

     node examples/run-igl-persistent.mjs seed    — fresh FileJournals, grants
        and observations append as chained graph events, both .igl programs
        execute, traces commit INTO THE SAME CHAIN, head + footprint digests
        are recorded to artifacts/journal-seal.json.

     node examples/run-igl-persistent.mjs replay  — new process. FileJournal
        loads the chain AND REFUSES TO LOAD if any entry was tampered with;
        GraphRuntime folds the footprint out of replayed events; both programs
        re-run: original statements return idempotent against replayed traces
        (or fail identically, deterministically), then one NEW governed
        statement per actor executes live against the replayed footprint —
        including the model, which still runs inside the compiled mask.

   The point: authority is a function of the chain, not of any process. */

import { AutoTokenizer, AutoModelForCausalLM, Tensor } from "@huggingface/transformers";
import { Interpreter, UDMRuntime, AIRuntime, IOSRuntime } from "../src/interpreter.js";
import { Bridge } from "../src/bridge.js";
import { GraphRuntime, DEFAULT_DIMENSIONS } from "../src/graph.js";
import { FileJournal } from "../src/store.js";
import { Signer as TraceSigner } from "../src/sign.js";
import { INTENTS } from "../src/builtins.js";
import { governedStep } from "../src/decode.js";
import { sha256, canonical } from "../src/sign.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODE = process.argv[2];
if (!["seed", "replay"].includes(MODE)) {
  console.error("usage: node run-igl-persistent.mjs seed|replay");
  process.exit(2);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.join(HERE, "..", "artifacts");
const PROGRAMS = path.join(HERE, "..", "programs");
fs.mkdirSync(ARTIFACTS, { recursive: true });
const J_HILCORP = path.join(ARTIFACTS, "journal-hilcorp.jsonl");
const J_AVERY = path.join(ARTIFACTS, "journal-avery.jsonl");
const SEAL = path.join(ARTIFACTS, "journal-seal.json");

if (MODE === "seed") for (const f of [J_HILCORP, J_AVERY, SEAL]) if (fs.existsSync(f)) fs.unlinkSync(f);
if (MODE === "replay" && (!fs.existsSync(J_HILCORP) || !fs.existsSync(J_AVERY))) {
  console.error("replay requested but journals are missing — run seed first");
  process.exit(2);
}

const MODEL_ID = "Xenova/distilgpt2";
const MAX_STEPS = 24;
console.log(`[${MODE}] loading ${MODEL_ID}…`);
const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
const model = await AutoModelForCausalLM.from_pretrained(MODEL_ID);
const VOCAB = []; // id -> string
for (const [tokStr, id] of tokenizer.get_vocab()) VOCAB[id] = tokStr;
console.log(`[${MODE}] model ready — vocab ${VOCAB.length}`);

async function rawNextDist(ids) {
  const input_ids = new Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]);
  const attention_mask = new Tensor("int64", new BigInt64Array(ids.length).fill(1n), [1, ids.length]);
  const position_ids = new Tensor("int64", BigInt64Array.from({ length: ids.length }, (_, i) => BigInt(i)), [1, ids.length]);
  const out = await model({ input_ids, attention_mask, position_ids });
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
    trace.push({ step, allowedSetSize: mask.allowed.length, rawTop: rec.record.rawTop, governedTop: rec.record.governedTop, governedDigest: rec.record.governedDigest });
    generated.push(picked);
  }
  let chain = "";
  for (const r of trace) chain = sha256(chain + (r.governedDigest || sha256(canonical(r))));
  return { text: tokenizer.decode(generated), trace, outcome, decodeDigest: chain };
}

class GovernedAI extends AIRuntime {
  constructor({ graph, bridge, prompts, ...rest }) { super(rest); Object.assign(this, { graph, bridge, prompts }); }
  async extract(args, ctx) {
    const pinned = this.models[args.Model];
    if (!pinned) throw new Error(`model ${args.Model} is not registered`);
    const fp = this.graph.footprint(ctx.identity.actor);
    const specs = [];
    for (const name of args.Slots || []) {
      const def = this.slots[name];
      if (!def) throw new Error(`slot ${name} is not in the governed slot registry`);
      const admissible = fp.granted[def.dimension] || [];
      if (!admissible.length)
        throw new Error(`slot ${name}: the granted footprint of ${ctx.identity.actor} covers no value for ${def.dimension} — failing closed`);
      specs.push({ name, kind: def.kind, dimension: def.dimension, admissible });
    }
    const envelope = this.bridge.gamma(ctx.boundary, specs, { model: args.Model, seed: args.Seed ?? null });
    const slots = {}, projections = [];
    let conf = 1, anyAbstain = false;
    for (const spec of specs) {
      const gen = await governedGenerate({ prompt: this.prompts[spec.name](ctx), automaton: envelope.maskPlan[spec.name] });
      const lifted = this.bridge.project(gen.text.trim(), { admissible: spec.admissible, dimension: spec.dimension, kind: spec.kind });
      projections.push({ slot: spec.name, emitted: gen.text, ...lifted, decodeDigest: gen.decodeDigest, outcome: gen.outcome, steps: gen.trace.length });
      slots[spec.name] = { value: lifted.value ?? null, how: lifted.how, valueClass: "ai" };
      if (lifted.abstained) anyAbstain = true;
      const last = gen.trace.filter((t) => t.governedTop).pop();
      if (last) conf = Math.min(conf, last.governedTop[0]?.p ?? 0);
    }
    return {
      assertion: "extraction", model: args.Model, modelVersion: pinned.version, seed: args.Seed ?? null,
      manifest: envelope.manifest, slots, projections, unmapped: [], abstained: anyAbstain,
      verification: { soundness: "alpha(gamma(S)) subset-of downclosure(S) + ABSTAIN", masks: "prefix-automaton per slot" },
      attestation: "ai", confidence: Number(conf.toFixed(4)), depth: 1,
    };
  }
}

const tok = { encode: (s) => tokenizer.encode(s) };
const models = { "distilgpt2-local": { version: "Xenova/distilgpt2@onnx-q8" } };

/* ---------------- builders: identical in both boots ---------------- */

function buildHilcorp(journal) {
  const graph = new GraphRuntime({ journal });
  if (MODE === "seed") {
    graph.grant("Hilcorp_Energy", { Jurisdiction: ["US-TX", "US-NM", "US-LA"], Commodity: ["Oil", "Gas", "NGL"], Period: ["2026-Q3"] },
      { by: "SMEPro Governance Board", role: "Operator" });
    graph.observe("Hilcorp_Energy", { Jurisdiction: ["US-TX"], Commodity: ["Gas"] }, { cls: "deterministic" });
    graph.observe("Hilcorp_Energy", { Jurisdiction: ["US-CA"] }, { cls: "ai" });
    graph.observe("Hilcorp_Energy", { Jurisdiction: ["US-CA"] }, { cls: "ai" });
    graph.observe("Hilcorp_Energy", { Jurisdiction: ["US-CA"] }, { cls: "ai" });
  }
  const udm = new UDMRuntime({
    boundaries: {
      Jurisdiction: { values: ["US", "US-TX", "US-NM", "US-LA", "US-CA", "TX-RRC", "NM-OCD", "LA-DNR"] },
      Commodity: { values: ["Hydrocarbon", "Oil", "Gas", "NGL"] },
      Period: { values: ["2026-Q3", "2026-Q4"] },
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
    identity: graph, udm, ai, ios: new IOSRuntime({ journal }),
    signers: { SMEPro_Governance_Board: attestSigner },
  });
  return { graph, interp };
}

function buildAvery(journal) {
  const dimensions = { ...DEFAULT_DIMENSIONS, Action: { type: "set" } };
  const graph = new GraphRuntime({ dimensions, journal });
  if (MODE === "seed") {
    graph.grant("Jordan_Avery",
      { Action: ["triage-alert", "acquire-disk-image", "preserve-evidence", "draft-incident-report"] },
      { by: "CISO Office", role: "DFIR_Coordinator" });
    for (let i = 0; i < 3; i++) graph.observe("Jordan_Avery", { Action: ["capture-volatile-memory"] }, { cls: "deterministic" });
    for (let i = 0; i < 5; i++) graph.observe("Jordan_Avery", { Action: ["restore-production-systems"] }, { cls: "ai" });
  }
  const udm = new UDMRuntime({
    boundaries: {
      Action: {
        values: ["triage-alert", "acquire-disk-image", "preserve-evidence", "draft-incident-report",
                 "capture-volatile-memory", "restore-production-systems"],
      },
    },
  });
  const bridge = new Bridge({ dimensions, strictness: "exact", tokenizer: tok });
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
  const interp = new Interpreter({ identity: graph, udm, ai, ios: new IOSRuntime({ journal }), intents });
  return { graph, interp };
}

/* New statements for the replay boot — different statementKeys, so they
   EXECUTE against the replayed footprint rather than returning idempotent. */
const HILCORP_REPLAY_STATEMENT = `
ID[Hilcorp_Energy:Operator | Jurisdiction:US-NM, Period:2026-Q3]
  :: Intent[Generate_Compliance_Packet, Mode=DryRun]
  => Context[Traces=None],
     Compute[
       AI.Extract(Slots=[jurisdiction], Model=distilgpt2-local, Seed=21),
       IOS.Trace(Channels=[Reasoning, Context])
     ]
  -> Output[Compliance_Packet, TurnTrace_ID]
  OnFail[Remediate(Notify=compliance_lead)];
`;
const AVERY_REPLAY_STATEMENT = `
ID[Jordan_Avery:DFIR_Coordinator | Action:acquire-disk-image]
  :: Intent[Execute_DFIR_Action]
  => Context[Traces=None],
     Compute[
       AI.Extract(Slots=[dfir_action], Model=distilgpt2-local, Seed=22),
       IOS.Trace(Channels=[Reasoning, Context])
     ]
  -> Output[Action_Record, TurnTrace_ID]
  OnFail[Remediate(Notify=CISO_Office)];
`;

/* ---------------- boot ---------------- */

const jH = new FileJournal(J_HILCORP);   // loads + verifies on replay; refuses a tampered chain
const jM = new FileJournal(J_AVERY);
const vH = jH.verify(), vM = jM.verify();
console.log(`[${MODE}] journals: hilcorp ${vH.length} entries ok=${vH.ok} head=${vH.head.slice(0, 16)}… · avery ${vM.length} entries ok=${vM.ok} head=${vM.head.slice(0, 16)}…`);

const hil = buildHilcorp(jH);
const mk = buildAvery(jM);

/* Stable footprint digest: authority-relevant state only. `weight` decays
   with wall-clock (recency half-life on the DESCRIPTIVE layer) and `last` is
   an event timestamp — neither changes what an actor may do. Granted, roles,
   and observed value/count/anchored are the state a replay must reproduce. */
function stableFootprint(fp) {
  const strip = (layer) =>
    Object.fromEntries(Object.entries(layer).map(([d, es]) => [d, es.map((e) => ({ value: e.value, count: e.count, anchored: e.anchored }))]));
  return {
    actor: fp.actor, roles: fp.roles, granted: fp.granted,
    observed: { governing: strip(fp.observed.governing), proposed: strip(fp.observed.proposed) },
  };
}

const hilFp = hil.graph.footprint("Hilcorp_Energy");
const mkFp = mk.graph.footprint("Jordan_Avery");
const fpDigests = { hilcorp: sha256(canonical(stableFootprint(hilFp))), avery: sha256(canonical(stableFootprint(mkFp))) };
console.log(`[${MODE}] footprint digests — hilcorp ${fpDigests.hilcorp.slice(0, 16)}… avery ${fpDigests.avery.slice(0, 16)}…`);

const hilSrc = fs.readFileSync(path.join(PROGRAMS, "hilcorp-energy-boundary.igl"), "utf8");
const mkSrc = fs.readFileSync(path.join(PROGRAMS, "jordan-avery-dfir-footprint.igl"), "utf8");

const hilRun = await hil.interp.run(hilSrc);
const mkRun = await mk.interp.run(mkSrc);

console.log(`\n[${MODE}] Hilcorp program:`);
for (const r of hilRun.results) console.log(`  ${r.traceId ?? "-"} ${r.status} ${r.trace?.intent ?? r.error?.code ?? ""}`);
console.log(`[${MODE}] Avery program:`);
for (const r of mkRun.results) console.log(`  ${r.traceId ?? "-"} ${r.status} ${r.trace?.intent ?? r.error?.code ?? ""} ${r.error ? "— " + r.error.message.slice(0, 120) : ""}`);

let hilReplayStmt = null, mkReplayStmt = null, replayChecks = null;

if (MODE === "replay") {
  const seal = JSON.parse(fs.readFileSync(SEAL, "utf8"));
  replayChecks = {
    footprintDigestsMatch: fpDigests.hilcorp === seal.footprintDigests.hilcorp && fpDigests.avery === seal.footprintDigests.avery,
    hilcorpIdempotent: hilRun.results.every((r) => r.status === "idempotent"),
    averyStmt1Idempotent: mkRun.results[0]?.status === "idempotent",
    averyStmt2RefusedIdentically: mkRun.results[1]?.status === "failed" && mkRun.results[1]?.error?.code === "IGL_FOOTPRINT_DENIED",
    originalTraceIdsPreserved: {
      hilcorp: hilRun.results.map((r) => r.traceId),
      avery: mkRun.results[0]?.traceId ?? null,
    },
  };
  console.log(`\n[replay] checks:`, JSON.stringify(replayChecks, null, 1));

  // Live governed execution on the replayed footprints.
  hilReplayStmt = await hil.interp.run(HILCORP_REPLAY_STATEMENT, { skipCheck: false });
  mkReplayStmt = await mk.interp.run(AVERY_REPLAY_STATEMENT, { skipCheck: false });
  console.log(`\n[replay] NEW Hilcorp statement (US-NM DryRun):`);
  for (const r of hilReplayStmt.results) console.log(`  ${r.traceId ?? "-"} ${r.status} ${r.trace?.intent ?? r.error?.code ?? ""}`);
  console.log(`[replay] NEW Avery statement (acquire-disk-image):`);
  for (const r of mkReplayStmt.results) console.log(`  ${r.traceId ?? "-"} ${r.status} ${r.trace?.intent ?? r.error?.code ?? ""}`);
}

// Receipt verification from the replayed chain (Hilcorp filing, human-class).
const filingTrace = (MODE === "seed" ? hilRun.traces : jH.entries("trace").map((e) => e.body)).find((t) => t.intent === "File_Production_Report");
const receiptVerification = filingTrace?.receipt ? TraceSigner.verifyTraceReceipt(filingTrace) : null;
console.log(`[${MODE}] filing receipt verifies from ${MODE === "seed" ? "live" : "REPLAYED"} chain: ${JSON.stringify(receiptVerification)}`);

function summarizeResults(run) {
  if (!run) return null;
  return run.results.map((r) => ({
    status: r.status,
    traceId: r.traceId,
    assertions: (r.trace?.assertions ?? []).map((a) => ({
      step: a.step,
      projections: (a.projections ?? []).map((p) => ({ slot: p.slot, emitted: p.emitted, value: p.value, how: p.how })),
    })),
  }));
}

const out = {
  mode: MODE,
  journals: { hilcorp: vH, avery: vM },
  footprintDigests: fpDigests,
  hilcorp: { results: hilRun.results.map((r) => ({ status: r.status, traceId: r.traceId, intent: r.trace?.intent, error: r.error })) },
  avery: { results: mkRun.results.map((r) => ({ status: r.status, traceId: r.traceId, intent: r.trace?.intent, error: r.error })) },
  replayChecks,
  replayStatements: { hilcorp: summarizeResults(hilReplayStmt), avery: summarizeResults(mkReplayStmt) },
  filingReceiptVerification: receiptVerification,
};

/* Seal the POST-RUN footprint: committed traces fold back into the graph as
   observations, so the state a replay must reproduce is the one after both
   programs committed — not the state before they ran. */
if (MODE === "seed") {
  const post = {
    hilcorp: sha256(canonical(stableFootprint(hil.graph.footprint("Hilcorp_Energy")))),
    avery: sha256(canonical(stableFootprint(mk.graph.footprint("Jordan_Avery")))),
  };
  fs.writeFileSync(SEAL, JSON.stringify({ footprintDigests: post, preRunFootprintDigests: fpDigests, heads: { hilcorp: jH.verify().head, avery: jM.verify().head }, sealedAt: new Date().toISOString() }, null, 2));
}
fs.writeFileSync(path.join(ARTIFACTS, `journal-${MODE}-run.json`), JSON.stringify(out, null, 2));
console.log(`\n[${MODE}] artifact: artifacts/journal-${MODE}-run.json${MODE === "seed" ? " · seal: artifacts/journal-seal.json" : ""}`);
