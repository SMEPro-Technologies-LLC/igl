/* The governed decode core — extracted from examples/run-igl-persistent.mjs so
   provisioning and any future service share ONE implementation of the sampler
   hook.

   Natural alignment, mechanically: the model's native computation is softmax
   over logits. The bridge compiles the granted footprint into a prefix
   automaton over the model's OWN tokenizer vocabulary, and governedStep
   applies z′ = z + ln(wᵢ) — additive in logit space means multiplicative in
   probability space, i.e. p′ᵢ ∝ pᵢ·wᵢ. Governance is not a filter after the
   fact; it is the same arithmetic the model is bound by natively, evaluated
   at the same step, over the same vocabulary. */

import { Tensor } from "@xenova/transformers";
import { AIRuntime } from "../src/interpreter.js";
import { Bridge } from "../src/bridge.js";
import { governedStep } from "../igl-v1/src/decoder.js";
import { sha256, canonical } from "../igl-v1/src/sign.js";

export function makeRawNextDist(model) {
  return async function rawNextDist(ids) {
    const input_ids = new Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]);
    const out = await model({ input_ids });
    const [, seq, v] = out.logits.dims;
    const row = Array.from(out.logits.data.slice((seq - 1) * v, seq * v));
    const mx = Math.max(...row);
    const exps = row.map((z) => Math.exp(z - mx));
    const s = exps.reduce((a, b) => a + b, 0) || 1;
    return exps.map((e) => e / s);
  };
}

export function makeGovernedGenerate({ tokenizer, model, maxSteps = 24 }) {
  const rawNextDist = makeRawNextDist(model);
  const VOCAB = tokenizer.model.vocab;
  return async function governedGenerate({ prompt, automaton }) {
    const promptIds = tokenizer.encode(prompt);
    const generated = [];
    const trace = [];
    let outcome = "COMPLIANT";
    for (let step = 0; step < maxSteps; step++) {
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
  };
}

export class GovernedAI extends AIRuntime {
  constructor({ graph, bridge, prompts, governedGenerate, ...rest }) {
    super(rest);
    Object.assign(this, { graph, bridge, prompts, governedGenerate });
  }
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
      const gen = await this.governedGenerate({ prompt: this.prompts[spec.name](ctx), automaton: envelope.maskPlan[spec.name] });
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
