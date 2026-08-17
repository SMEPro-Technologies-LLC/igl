/* LIVE governed decode — two real identity-graph runs through the IGL bridge.

   Run 1 (Boundary):  Hilcorp Energy — company. The graph's prescriptive grant
                      lattice defines the boundary; the bridge's prefix automaton
                      drives the model's per-token mask so only boundary-covered
                      values can ever be emitted.

   Run 2 (Footprint): Jordan Avery — individual DFIR Coordinator. The
                      footprint fold (granted vs observed layers) decides what is
                      reachable; an AI-observed-but-never-granted action is shown
                      refused by authorize() AND unreachable in the decode.

   Model: Xenova/distilgpt2, real forward pass per step (network download on
   first run). Sampler: argmax (deterministic — the trace is recomputable).
   Each step's mask comes from Bridge.maskNext over the bridge automaton; the
   mask is applied as FUSE support restriction (w ∈ {0,1}) using the igl-v1
   governedStep math. Every run seals a hash-chained trace and an Ed25519-signed
   receipt, then re-verifies the receipt from the artifact alone. */

import { AutoTokenizer, AutoModelForCausalLM, Tensor } from "@xenova/transformers";
import { Bridge, ABSTAIN } from "../src/bridge.js";
import { GraphRuntime, DEFAULT_DIMENSIONS } from "../src/graph.js";
import { governedStep } from "../igl-v1/src/decoder.js";
import { Signer, sha256, canonical } from "../igl-v1/src/sign.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.join(HERE, "..", "artifacts");
fs.mkdirSync(ARTIFACTS, { recursive: true });

const MODEL_ID = "Xenova/distilgpt2";
const MAX_STEPS = 24;

const round = (x, n = 6) => Number(x.toFixed(n));
const entropy = (dist) => { let h = 0; for (const p of dist) if (p > 0) h -= p * Math.log2(p); return round(h); };

console.log(`[live] loading ${MODEL_ID} (downloads on first run)…`);
const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
const model = await AutoModelForCausalLM.from_pretrained(MODEL_ID);
const VOCAB = tokenizer.model.vocab; // id -> string
console.log(`[live] model ready — vocab ${VOCAB.length}`);

const signer = Signer.fromSeed("igl-live-demo", Buffer.alloc(32, 7)); // demo-stable key; production seeds come from KMS

/* Forward pass → raw next-token probability distribution. */
async function rawNextDist(ids) {
  const input_ids = new Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]);
  const out = await model({ input_ids });
  const [_, seq, v] = out.logits.dims;
  const row = Array.from(out.logits.data.slice((seq - 1) * v, seq * v));
  const mx = Math.max(...row);
  const exps = row.map((z) => Math.exp(z - mx));
  const s = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / s);
}

/* One governed generation: automaton-driven mask at every step. */
async function governedGenerate({ prompt, automaton, label }) {
  const promptIds = tokenizer.encode(prompt);
  const generated = [];
  const trace = [];
  let outcome = "COMPLIANT";

  for (let step = 0; step < MAX_STEPS; step++) {
    const mask = Bridge.maskNext(automaton, generated);
    if (!mask) { outcome = "HARD_VIOLATION"; trace.push({ step, outcome, prefixLeftLanguage: true }); break; }
    if (mask.accepting && generated.length > 0) break; // a complete admissible value has been emitted

    const raw = await rawNextDist([...promptIds, ...generated]);
    const weights = new Uint8Array(VOCAB.length);
    for (const id of mask.allowed) weights[id] = 1;

    // FUSE support restriction + trace record (igl-v1 governedStep math).
    const rec = governedStep(VOCAB, raw, Array.from(weights), null, step, "HARD");
    if (rec.zeroPartition) { outcome = "HARD_VIOLATION"; trace.push({ step, outcome, zeroPartition: true }); break; }

    const picked = rec.governed.indexOf(Math.max(...rec.governed)); // argmax over governed dist
    trace.push({
      step,
      allowedSetSize: mask.allowed.length,
      rawTop: rec.record.rawTop,
      governedTop: rec.record.governedTop,
      entropyRaw: rec.record.entropyRaw,
      entropyGoverned: rec.record.entropyGoverned,
      rawDigest: rec.record.rawDigest,
      governedDigest: rec.record.governedDigest,
    });
    generated.push(picked);
  }

  const text = tokenizer.decode(generated);
  // hash-chain the per-step digests → one tamper-evident decode digest
  let chain = "";
  for (const r of trace) chain = sha256(chain + (r.governedDigest || sha256(canonical(r))));
  return { text, ids: generated, trace, outcome, decodeDigest: chain, label };
}

/* Seal + sign a receipt binding identity, footprint digest, boundary, manifest, decode. */
function sealReceipt({ kind, actor, role, footprint, boundary, envelope, gen, extra = {} }) {
  const fields = {
    receiptUUID: "live-" + gen.decodeDigest.slice(0, 20),
    kind,
    subject: actor,
    role,
    footprintDigest: sha256(canonical(footprint)),
    boundary,
    manifestDigest: envelope.manifest.schemaDigest,
    scopeDigest: envelope.manifest.scopeDigest,
    model: MODEL_ID,
    sampler: "argmax",
    emitted: gen.text,
    outcome: gen.outcome,
    decodeDigest: gen.decodeDigest,
    steps: gen.trace.length,
    ...extra,
    created_at: Date.now() / 1000,
  };
  return signer.signReceipt(fields);
}

/* ================================================================
   RUN 1 — Hilcorp Energy · Company · BOUNDARY
   ================================================================ */
async function runHilcorp() {
  const graph = new GraphRuntime();
  const ACTOR = "Hilcorp Energy";

  // Prescriptive grants — the ONLY thing that widens authority.
  graph.grant(ACTOR, { Jurisdiction: ["US-TX", "US-NM", "US-LA"], Commodity: ["Oil", "Gas", "NGL"] },
    { by: "SMEPro Governance Board", role: "operator" });

  // Descriptive observations — including an AI-class sighting in a NON-granted
  // jurisdiction. It accumulates in `proposed` and can never widen authority.
  graph.observe(ACTOR, { Jurisdiction: ["US-TX"], Commodity: ["Gas"] }, { cls: "deterministic" });
  graph.observe(ACTOR, { Jurisdiction: ["US-CA"] }, { cls: "ai" });
  graph.observe(ACTOR, { Jurisdiction: ["US-CA"] }, { cls: "ai" });
  graph.observe(ACTOR, { Jurisdiction: ["US-CA"] }, { cls: "ai" });

  const footprint = graph.footprint(ACTOR);

  // Boundary checks against the granted footprint (prescriptive layer only).
  const okBoundary = { Jurisdiction: ["TX-RRC"], Commodity: ["Gas"] };   // TX-RRC ≤ US-TX on the lattice
  const badBoundary = { Jurisdiction: ["US-CA"] };
  const authzOk = graph.authorize(ACTOR, okBoundary);
  const authzBad = graph.authorize(ACTOR, badBoundary);

  // Bridge: admissible decode set = granted jurisdictions (values the company
  // may operate under). ABSTAIN is always reachable.
  const bridge = new Bridge({
    dimensions: DEFAULT_DIMENSIONS,
    strictness: "lattice",
    tokenizer: { encode: (s) => tokenizer.encode(s) },
  });
  const admissible = footprint.granted.Jurisdiction;
  const envelope = bridge.gamma({ identity: ACTOR, boundary: okBoundary }, [
    { name: "jurisdiction", kind: "enum", admissible, required: true },
  ]);

  const gen = await governedGenerate({
    prompt: "Hilcorp Energy files its gas production report with the regulator in jurisdiction",
    automaton: envelope.maskPlan.jurisdiction,
    label: "hilcorp-boundary",
  });

  // α — lift the emitted text back into governed structure.
  const lifted = bridge.project(gen.text.trim(), { admissible, dimension: "Jurisdiction", kind: "enum" });

  const receipt = sealReceipt({
    kind: "live_boundary_decode",
    actor: ACTOR, role: "operator", footprint, boundary: okBoundary, envelope, gen,
    extra: { lifted, refusedBoundary: { boundary: badBoundary, violations: authzBad.violations } },
  });
  const verification = Signer.verifyReceipt(receipt);

  return {
    run: "Identity Graph — Company (Boundary)",
    actor: ACTOR,
    footprint,
    authorizeCovered: { boundary: okBoundary, ok: authzOk.ok },
    authorizeRefused: { boundary: badBoundary, ok: authzBad.ok, violations: authzBad.violations },
    promotions: graph.promotions(ACTOR),
    envelopeManifest: envelope.manifest,
    decode: gen,
    lifted,
    receipt,
    verification,
  };
}

/* ================================================================
   RUN 2 — Jordan Avery · Individual · FOOTPRINT
   ================================================================ */
async function runAvery() {
  const dimensions = { ...DEFAULT_DIMENSIONS, Action: { type: "set" } };
  const graph = new GraphRuntime({ dimensions });
  const ACTOR = "Jordan Avery";

  // Granted footprint — signed, prescriptive.
  graph.grant(ACTOR,
    { Action: ["triage-alert", "acquire-disk-image", "preserve-evidence", "draft-incident-report"] },
    { by: "CISO Office", role: "DFIR Coordinator" });

  // Observed layer: they have REPEATEDLY been seen doing memory forensics
  // (deterministic tooling attestations) and an AI classifier keeps tagging them
  // near production restore work. Neither has been granted.
  for (let i = 0; i < 3; i++) graph.observe(ACTOR, { Action: ["capture-volatile-memory"] }, { cls: "deterministic" });
  for (let i = 0; i < 5; i++) graph.observe(ACTOR, { Action: ["restore-production-systems"] }, { cls: "ai" });

  const footprint = graph.footprint(ACTOR);

  const okBoundary = { Action: ["draft-incident-report"] };
  const observedOnly = { Action: ["capture-volatile-memory"] };  // governing-class, not yet granted
  const aiOnly = { Action: ["restore-production-systems"] };     // AI-class — can never promote
  const authzOk = graph.authorize(ACTOR, okBoundary);
  const authzObserved = graph.authorize(ACTOR, observedOnly);
  const authzAi = graph.authorize(ACTOR, aiOnly);

  const bridge = new Bridge({
    dimensions, strictness: "exact",
    tokenizer: { encode: (s) => tokenizer.encode(s) },
  });
  const admissible = footprint.granted.Action;
  const envelope = bridge.gamma({ identity: ACTOR, boundary: okBoundary }, [
    { name: "action", kind: "enum", admissible, required: true },
  ]);

  const gen = await governedGenerate({
    prompt: "As DFIR Coordinator, the next action Jordan Avery is authorised to take is",
    automaton: envelope.maskPlan.action,
    label: "avery-footprint",
  });

  const lifted = bridge.project(gen.text.trim(), { admissible, kind: "enum" });

  const receipt = sealReceipt({
    kind: "live_footprint_decode",
    actor: ACTOR, role: "DFIR Coordinator", footprint, boundary: okBoundary, envelope, gen,
    extra: {
      lifted,
      refusedBoundaries: [
        { boundary: observedOnly, violations: authzObserved.violations },
        { boundary: aiOnly, violations: authzAi.violations },
      ],
    },
  });
  const verification = Signer.verifyReceipt(receipt);

  return {
    run: "Identity Graph — Individual (Footprint)",
    actor: ACTOR,
    footprint,
    authorizeGranted: { boundary: okBoundary, ok: authzOk.ok },
    authorizeObservedNotGranted: { boundary: observedOnly, ok: authzObserved.ok, violations: authzObserved.violations },
    authorizeAiClassNeverPromotes: { boundary: aiOnly, ok: authzAi.ok, violations: authzAi.violations },
    promotions: graph.promotions(ACTOR),
    envelopeManifest: envelope.manifest,
    decode: gen,
    lifted,
    receipt,
    verification,
  };
}

/* ================================================================ */
const hilcorp = await runHilcorp();
console.log(`\n[Hilcorp] emitted: "${hilcorp.decode.text}" → lifted:`, JSON.stringify(hilcorp.lifted));
console.log(`[Hilcorp] outcome: ${hilcorp.decode.outcome} · receipt ${hilcorp.receipt.receiptUUID} · verify=${hilcorp.verification.ok}`);

const avery = await runAvery();
console.log(`\n[Avery] emitted: "${avery.decode.text}" → lifted:`, JSON.stringify(avery.lifted));
console.log(`[Avery] outcome: ${avery.decode.outcome} · receipt ${avery.receipt.receiptUUID} · verify=${avery.verification.ok}`);

fs.writeFileSync(path.join(ARTIFACTS, "live-hilcorp-boundary.json"), JSON.stringify(hilcorp, null, 2));
fs.writeFileSync(path.join(ARTIFACTS, "live-avery-footprint.json"), JSON.stringify(avery, null, 2));
console.log(`\n[live] artifacts written to ${ARTIFACTS}`);
