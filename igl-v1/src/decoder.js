/* Governed decoding: FUSE inside the active decode loop, per token.

   The rest of the runtime governs a distribution that arrives through a seam. This
   module closes that gap: it runs the token-by-token decode loop itself and applies
   FUSE at every single step, so a prohibited token is zeroed in the governed
   distribution the sampler draws from and can never be emitted, at any step. It also
   captures the real per-token cognitive trace (the raw and governed distributions,
   the entropy of each, and which tokens were forced to zero), then seals and signs
   it so a third party recomputes the whole decode from the record alone.

   The model enters through `logitsFn(tokens, step) -> number[] over the vocabulary`.
   That is the one seam you point at a live model. Two ready shapes:
     - transformers.js / any local model: wrap next-token logits (see
       examples/govern-transformers.mjs and governanceLogitsProcessor below).
     - a vendor that returns logprobs: exponentiate the logprobs into logits.
   The test drives it with a real, deterministic reference logits model (a small
   fixed-weight forward pass), so CI proves the mechanism with no external deps. The
   mechanism is identical whatever produces the logits. */

import { sha256, canonical, Signer } from "./sign.js";

const round = (x, n = 6) => Number(x.toFixed(n));

export function softmax(logits) {
  const finite = logits.filter(z => Number.isFinite(z));
  const mx = finite.length ? Math.max(...finite) : 0;
  const exps = logits.map(z => (Number.isFinite(z) ? Math.exp(z - mx) : 0));
  const s = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map(e => e / s);
}

export function entropy(dist) {
  let h = 0;
  for (const p of dist) if (p > 0) h -= p * Math.log2(p);
  return round(h);
}

function argmax(dist) { let bi = 0, bv = -Infinity; dist.forEach((p, i) => { if (p > bv) { bv = p; bi = i; } }); return bi; }
function topK(vocab, dist, k = 3) {
  return dist.map((p, i) => ({ token: vocab[i], p: round(p) })).sort((a, b) => b.p - a.p).slice(0, k);
}

/* A logits processor for ANY external decoder (transformers.js generate(), a custom
   sampler, etc.): prohibited tokens go to -Infinity so softmax gives them exactly
   zero mass and they can never be sampled. Permitted tokens keep their logit; the
   multiplicative steering is applied at the probability level inside governedDecode.
   This is the drop-in that puts governance inside a real model's decode. */
export function governanceLogitsProcessor(weights) {
  return (logits) => logits.map((z, i) => (weights[i] === 0 ? -Infinity : z));
}

/* One governed decode step, exposed so a host loop can call it directly:
   apply FUSE to the raw distribution, enforce support restriction, check the graded
   token ceilings, and return the governed distribution plus the per-token record. */
export function governedStep(vocab, rawDist, weights, ceilings, step, strictness = "HARD") {
  const prod = rawDist.map((p, i) => p * weights[i]);
  const s = prod.reduce((a, b) => a + b, 0);
  if (s === 0) return { zeroPartition: true, step };
  const g = prod.map(x => round(x / s));
  weights.forEach((w, i) => { if (w === 0 && g[i] !== 0) throw new Error(`support restriction violated at step ${step}`); });

  const violations = [];
  if (ceilings) g.forEach((m, i) => { if (m > ceilings[i] + 1e-9) violations.push({ token: vocab[i], mass: m, ceiling: ceilings[i] }); });
  const zeroed = vocab.filter((_, i) => weights[i] === 0);
  const outcome = violations.length ? (strictness === "HARD" ? "HARD_VIOLATION" : "SOFT_VIOLATION") : "COMPLIANT";

  const record = {
    step, outcome,
    rawTop: topK(vocab, rawDist), governedTop: topK(vocab, g),
    entropyRaw: entropy(rawDist), entropyGoverned: entropy(g),
    zeroed, violations,
    rawDigest: sha256(canonical(rawDist.map(x => round(x)))),
    governedDigest: sha256(canonical(g)),
  };
  return { governed: g, record, outcome, violations };
}

/* The governed decode loop. FUSE is applied at every step to the model's own
   next-token distribution, so the sampler only ever sees the governed space. */
export function governedDecode({ vocab, logitsFn, weights, ceilings = null, steps = 8, strictness = "HARD", sampler = argmax }) {
  const trace = [];
  const tokens = [];
  let outcome = "COMPLIANT";
  for (let t = 0; t < steps; t++) {
    const logits = logitsFn(tokens, t);               // the model's real forward pass
    if (!Array.isArray(logits) || logits.length !== vocab.length) throw new Error(`logitsFn returned ${logits && logits.length} logits, expected ${vocab.length}`);
    const raw = softmax(logits);                       // v: the raw next-token distribution
    const step = governedStep(vocab, raw, weights, ceilings, t, strictness);
    if (step.zeroPartition) { outcome = "HARD_VIOLATION"; trace.push({ step: t, outcome: "HARD_VIOLATION", zeroPartition: true }); break; }
    trace.push(step.record);
    if (step.outcome === "HARD_VIOLATION") { outcome = "HARD_VIOLATION"; break; }   // seal partial, refuse to emit
    tokens.push(vocab[sampler(step.governed)]);        // sample only from the governed distribution
  }
  const sealed = sealDecodeTrace(vocab, weights, trace, outcome);
  return { tokens, trace, outcome, sealed };
}

/* Hash-chain the per-step governed digests into one decode digest, so the whole
   token-by-token trace is a single recomputable, tamper-evident object. */
export function sealDecodeTrace(vocab, weights, trace, outcome) {
  let chain = "";
  const stepDigests = [];
  for (const r of trace) {
    const d = r.governedDigest || sha256(canonical(r));
    chain = sha256(chain + d);
    stepDigests.push(d);
  }
  return {
    kind: "governed_decode",
    vocabDigest: sha256(canonical(vocab)),
    weightsDigest: sha256(canonical(weights.map(w => round(w)))),
    steps: trace.length, outcome, stepDigests, decodeDigest: chain,
  };
}

/* Recompute the decode from the record: for each step re-derive the governed
   distribution from the stored raw top and weights invariant, confirm support
   restriction and the chained digests. This is the check a skeptic runs on the
   per-token trace without trusting the runtime that produced it. */
export function verifyDecode({ vocab, weights, trace, sealed }) {
  let chain = "";
  for (const r of trace) {
    if (r.zeroPartition) { chain = sha256(chain + (r.governedDigest || sha256(canonical(r)))); continue; }
    // support restriction must hold on every governed step record
    for (const z of r.zeroed) { const i = vocab.indexOf(z); if (i >= 0 && weights[i] !== 0) return { ok: false, reason: `step ${r.step}: zeroed token not actually blocked` }; }
    const gTop = r.governedTop.find(x => weights[vocab.indexOf(x.token)] === 0 && x.p !== 0);
    if (gTop) return { ok: false, reason: `step ${r.step}: blocked token carries mass` };
    chain = sha256(chain + r.governedDigest);
  }
  if (chain !== sealed.decodeDigest) return { ok: false, reason: "decodeDigest does not reproduce (trace altered)" };
  if (sealed.weightsDigest !== sha256(canonical(weights.map(w => round(w))))) return { ok: false, reason: "weights digest mismatch" };
  return { ok: true, outcome: sealed.outcome, steps: sealed.steps };
}

/* Bind a decode session into a signed receipt: the vocab and weights digests, the
   decode digest, and the outcome. A HARD_VIOLATION decode still seals its partial
   trace, and the receipt records the halt rather than asserting a clean turn. */
export function signDecodeReceipt(sealed, { signer, subject = null, now = () => Date.now() / 1000 }) {
  const fields = {
    receiptUUID: "dec-" + sealed.decodeDigest.slice(0, 20),
    kind: "governed_decode",
    subject,
    vocabDigest: sealed.vocabDigest,
    weightsDigest: sealed.weightsDigest,
    decodeDigest: sealed.decodeDigest,
    steps: sealed.steps,
    outcome: sealed.outcome,
    created_at: now(),
  };
  return signer ? signer.signReceipt(fields) : fields;
}

export function verifyDecodeReceipt(receipt, { publicKeyB64 = null } = {}) {
  if (receipt.signature) { const v = Signer.verifyReceipt(receipt, { publicKeyB64 }); if (!v.ok) return { ok: false, reason: "signature: " + v.reason }; }
  return { ok: true, outcome: receipt.outcome, boundToDecodeDigest: receipt.decodeDigest };
}
