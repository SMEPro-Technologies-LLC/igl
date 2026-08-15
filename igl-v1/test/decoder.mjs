/* Governed decoding, proven inside the loop. We stand up a small but real
   reference logits model (a fixed-weight forward pass: token embeddings dotted with
   a context vector, plus a bias that deliberately makes the PROHIBITED tokens the
   ones the raw model wants most). Then we run the governed decode and show that
   across every step the forbidden tokens are zeroed and never emitted, the
   per-token trace recomputes, and the session receipt verifies. Swap the reference
   model for transformers.js or a vendor's logprobs and nothing else changes. */

import { governedDecode, governedStep, governanceLogitsProcessor, softmax, verifyDecode, signDecodeReceipt, verifyDecodeReceipt } from "../src/decoder.js";
import { Signer, sha256 } from "../src/sign.js";

let passed = 0, failed = 0;
const ok = (n, c, extra = "") => { c ? passed++ : failed++; console.log((c ? "  ok   " : "  FAIL ") + n + (c ? "" : "  [" + extra + "]")); };

const VOCAB = ["allow", "deny", "escalate", "report", "summarize", "redact", "file", "ABSTAIN"];
const BLOCK = new Set(["deny", "redact"]);                     // support restriction: w = 0
const weights = VOCAB.map(t => (BLOCK.has(t) ? 0 : 1));

// A real, deterministic reference forward pass. Fixed pseudo-random embeddings and a
// context vector built from the tokens so far, so logits genuinely change step to
// step. The bias pushes the blocked tokens to the TOP of the raw distribution, so
// without governance the model would emit them.
function makeRefModel(dim = 16, seed = 3) {
  const vec = (key) => Array.from({ length: dim }, (_, k) => {
    const h = parseInt(sha256(`${key}|${k}|${seed}`).slice(0, 8), 16);
    return (h % 2000) / 1000 - 1;                              // in [-1, 1]
  });
  const emb = Object.fromEntries(VOCAB.map(t => [t, vec("emb:" + t)]));
  const bias = VOCAB.map(t => (BLOCK.has(t) ? 20 : 0));        // raw model strongly WANTS the blocked tokens
  return (tokens) => {
    const ctx = new Array(dim).fill(0);
    const recent = tokens.slice(-3);
    (recent.length ? recent : ["allow"]).forEach(tok => emb[tok].forEach((x, k) => { ctx[k] += x; }));
    return VOCAB.map((t, i) => emb[t].reduce((a, x, k) => a + x * ctx[k], 0) + bias[i]);
  };
}
const model = makeRefModel();

// The raw model really does prefer a blocked token at step 0.
const rawStep0 = softmax(model([]));
const rawTopToken = VOCAB[rawStep0.indexOf(Math.max(...rawStep0))];
ok("reference model's raw top-1 is a prohibited token (governance has real work to do)", BLOCK.has(rawTopToken), "raw top = " + rawTopToken);

// Govern the decode for 12 steps.
const run = governedDecode({ vocab: VOCAB, logitsFn: model, weights, steps: 12 });

ok("decode ran to COMPLIANT under governance", run.outcome === "COMPLIANT");
ok("no prohibited token was ever emitted", run.tokens.every(t => !BLOCK.has(t)), "tokens = " + run.tokens.join(","));
ok("every step zeroed both blocked tokens", run.trace.every(r => r.zeroed.includes("deny") && r.zeroed.includes("redact")));
ok("no blocked token carries governed mass at any step", run.trace.every(r => !r.governedTop.some(x => BLOCK.has(x.token) && x.p !== 0)));
ok("per-token entropy is captured for raw and governed at every step", run.trace.every(r => Number.isFinite(r.entropyRaw) && Number.isFinite(r.entropyGoverned)));

// Independent recompute of the whole decode from the sealed record.
const v = verifyDecode({ vocab: VOCAB, weights, trace: run.trace, sealed: run.sealed });
ok("the governed decode trace recomputes and verifies", v.ok, v.ok ? "" : v.reason);

// Tamper a step's governed digest -> the chain no longer reproduces.
const tampered = JSON.parse(JSON.stringify(run));
tampered.trace[2].governedDigest = sha256("tamper");
ok("altering a step is caught by the decode digest chain", verifyDecode({ vocab: VOCAB, weights, trace: tampered.trace, sealed: run.sealed }).ok === false);

// A single step: FUSE zeroes the blocked mass and renormalizes to 1.
const raw = softmax(model([]));
const gstep = governedStep(VOCAB, raw, weights, null, 0);
const sum = gstep.governed.reduce((a, b) => a + b, 0);
ok("governed distribution renormalizes to 1", Math.abs(sum - 1) < 1e-6, "sum = " + sum);
ok("blocked tokens are exactly zero after FUSE", VOCAB.every((t, i) => !BLOCK.has(t) || gstep.governed[i] === 0));

// The logits processor puts governance inside ANY external decoder: blocked -> -Inf -> 0 mass.
const proc = governanceLogitsProcessor(weights);
const processed = softmax(proc(model([])));
ok("logits processor drives blocked-token probability to zero for a real sampler", VOCAB.every((t, i) => !BLOCK.has(t) || processed[i] === 0));

// In-decode boundary check: a low ceiling on a permitted token trips HARD_VIOLATION
// and the decode halts and seals its partial trace instead of emitting.
const ceilings = VOCAB.map(t => (t === "allow" ? 0.05 : 1));
const capped = governedDecode({ vocab: VOCAB, logitsFn: model, weights, ceilings, steps: 12 });
ok("a token over its ceiling halts the decode as HARD_VIOLATION", capped.outcome === "HARD_VIOLATION");

// Fully blocking the raw support fails closed (zero partition), no clean turn.
const allBlock = VOCAB.map(() => 0);
const dead = governedDecode({ vocab: VOCAB, logitsFn: model, weights: allBlock, steps: 4 });
ok("blocking every path fails closed (zero partition), not a clean receipt", dead.outcome === "HARD_VIOLATION");

// Sign the decode session and verify it from the receipt alone.
const signer = Signer.fromSeed("decoder", Buffer.alloc(32, 5));
const receipt = signDecodeReceipt(run.sealed, { signer });
ok("decode receipt verifies with the published key", verifyDecodeReceipt(receipt, { publicKeyB64: signer.pub() }).ok);
const badReceipt = JSON.parse(JSON.stringify(receipt)); badReceipt.outcome = "COMPLIANT_FORGED";
ok("altering the sealed outcome breaks the signature", verifyDecodeReceipt(badReceipt, { publicKeyB64: signer.pub() }).ok === false);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
