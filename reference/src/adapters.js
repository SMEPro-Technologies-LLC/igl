/* Model adapter seam for the IGL v1.0 reference runtime.

   FUSE needs a probability distribution over the runtime's vocabulary. Where
   that distribution comes from is the seam. This file defines the contract and
   two concrete adapters, so a real model can be attached in place of the seeded
   stand-in without touching the interpreter.

   The contract:  invoke(call) -> { dist: number[] over VOCAB }
                  where call = { fn, prompt, context }

   What is in scope here: turning a real model's token scores into the
   distribution FUSE consumes. What is NOT in scope, and is the open item of
   Section 12.03, is mapping a model's internal attention or latent structure
   onto governance reasoning paths. That crosswalk is deliberately absent. */

import { VOCAB } from "./iosplus.js";

/* Uniform baseline, useful for tests and for a model-free dry run. */
export function uniformAdapter() {
  const p = 1 / VOCAB.length;
  return () => ({ dist: VOCAB.map(() => p) });
}

/* Softmax over caller-supplied logits, one per vocabulary entry. A real
   integration computes these logits from the model's scores for the tokens
   that correspond to each governance option. Temperature defaults to 1. */
export function logitsAdapter(scoreFor, { temperature = 1 } = {}) {
  return (call) => {
    const logits = VOCAB.map(tok => Number(scoreFor(tok, call)) / temperature);
    const mx = Math.max(...logits);
    const exps = logits.map(z => Math.exp(z - mx));
    const s = exps.reduce((a, b) => a + b, 0);
    return { dist: exps.map(e => e / s) };
  };
}

/* Adapter over a hosted model that returns log-probabilities per option. Pass a
   function that, given the call, returns { token: logprob, ... } for the vocab
   options the model was asked to choose among. Missing options get -Infinity,
   which becomes zero probability after softmax. This is the shape most hosted
   APIs expose (top-logprobs on a constrained choice). */
export function logprobsAdapter(getLogprobs) {
  return (call) => {
    const lp = getLogprobs(call) || {};
    const logits = VOCAB.map(tok => (tok in lp ? Number(lp[tok]) : -Infinity));
    const finite = logits.filter(Number.isFinite);
    const mx = finite.length ? Math.max(...finite) : 0;
    const exps = logits.map(z => (Number.isFinite(z) ? Math.exp(z - mx) : 0));
    const s = exps.reduce((a, b) => a + b, 0);
    if (s === 0) return { dist: VOCAB.map(() => 1 / VOCAB.length) };  // no signal: defer to boundary/FUSE
    return { dist: exps.map(e => e / s) };
  };
}

/* Constrained decoding note.
   With open-weight models you can go further than shaping the distribution
   after the fact: mask the logits at generation so forbidden options never
   sample. The governance guarantee does not depend on it, because FUSE re-applies
   support restriction and the boundary check runs after FUSE regardless. Masking
   reduces wasted sampling; FUSE and the receipt carry the guarantee. To wire it,
   compute the per-option allow set from the active constraint matrix (weight > 0)
   and pass it to the decoder's logits processor. */
export const CONSTRAINED_DECODING_NOTE = true;
