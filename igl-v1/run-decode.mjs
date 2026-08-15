/* Produce a committed sample of a real governed decode: run the token-by-token
   loop with a reference forward-pass model, seal the per-token cognitive trace, and
   write it to artifacts/decode-trace.sample.json so the per-token record is a
   concrete, inspectable, recomputable object in the repo. */
import { writeFileSync, mkdirSync } from "node:fs";
import { governedDecode, verifyDecode, signDecodeReceipt, verifyDecodeReceipt } from "./src/decoder.js";
import { Signer, sha256 } from "./src/sign.js";

const VOCAB = ["allow", "deny", "escalate", "report", "summarize", "redact", "file", "ABSTAIN"];
const BLOCK = new Set(["deny", "redact"]);
const weights = VOCAB.map(t => (BLOCK.has(t) ? 0 : 1));

// Reference forward pass: fixed embeddings dotted with the running context, with a
// bias that makes the blocked tokens the raw model's favourites.
const dim = 16, seed = 3;
const emb = Object.fromEntries(VOCAB.map(t => [t, Array.from({ length: dim }, (_, k) => (parseInt(sha256(`emb:${t}|${k}|${seed}`).slice(0, 8), 16) % 2000) / 1000 - 1)]));
const bias = VOCAB.map(t => (BLOCK.has(t) ? 20 : 0));
const model = (tokens) => {
  const ctx = new Array(dim).fill(0);
  (tokens.slice(-3).length ? tokens.slice(-3) : ["allow"]).forEach(tok => emb[tok].forEach((x, k) => { ctx[k] += x; }));
  return VOCAB.map((t, i) => emb[t].reduce((a, x, k) => a + x * ctx[k], 0) + bias[i]);
};

const run = governedDecode({ vocab: VOCAB, logitsFn: model, weights, steps: 12 });
const verified = verifyDecode({ vocab: VOCAB, weights, trace: run.trace, sealed: run.sealed });
const signer = Signer.fromSeed("decoder-DEV-INSECURE", Buffer.alloc(32, 5));   // dev key, not for production
const receipt = signDecodeReceipt(run.sealed, { signer });

mkdirSync(new URL("./artifacts/", import.meta.url), { recursive: true });
writeFileSync(new URL("./artifacts/decode-trace.sample.json", import.meta.url), JSON.stringify({
  note: "Sample governed decode. FUSE applied inside the token-by-token loop; blocked tokens carry zero mass at every step. Recomputable via verifyDecode.",
  vocab: VOCAB, weights, blocked: [...BLOCK],
  emittedTokens: run.tokens,
  outcome: run.outcome,
  sealed: run.sealed,
  trace: run.trace,
  receipt, publicKey: signer.pub(),
}, null, 2));

console.log("emitted tokens        :", run.tokens.join(" "));
console.log("blocked (never emitted):", [...BLOCK].join(", "));
console.log("outcome               :", run.outcome);
console.log("trace recomputes      :", verified.ok);
console.log("receipt verifies      :", verifyDecodeReceipt(receipt, { publicKeyB64: signer.pub() }).ok);
console.log("wrote artifacts/decode-trace.sample.json");
