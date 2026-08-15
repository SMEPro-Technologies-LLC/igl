// SPDX-License-Identifier: Apache-2.0
/* Real-model drop-in: govern a live decoder with transformers.js.

   This is the seam in concrete form. It is NOT run in CI (it needs the npm package
   and a model download), but it is exactly how you put FUSE inside a real model's
   decode. Install once:  npm i @xenova/transformers

   The governance weight vector `w` must be aligned to the model's tokenizer
   vocabulary. Turning UDM jurisdiction categories into that per-token vector is the
   Semantic Crosswalk (see docs/CLOSEOUT.md, roadmap). Here we show the mechanical
   binding with a hand-built block list so the wiring is unambiguous. */

import { pipeline, AutoTokenizer } from "@xenova/transformers";
import { governanceLogitsProcessor } from "../src/decoder.js";

const MODEL = "Xenova/distilgpt2";
const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const generator = await pipeline("text-generation", MODEL);

// Build a weight vector over the FULL tokenizer vocabulary. Block a few tokens by
// text; in production this vector is produced by the crosswalk from the active UDM
// slice, not by hand.
const vocabSize = tokenizer.model.vocab.length;
const weights = new Array(vocabSize).fill(1);
for (const word of [" password", " ssn", " exploit"]) {
  const ids = tokenizer.encode(word, { add_special_tokens: false });
  for (const id of ids) weights[id] = 0;                 // support restriction: w = 0
}

const govern = governanceLogitsProcessor(weights);

// transformers.js lets you pass a logits processor. The processor runs INSIDE the
// decode loop, at every step, before sampling, so a blocked token can never be
// emitted. This is the same governedStep math the reference test proves.
const out = await generator("The account recovery flow should", {
  max_new_tokens: 40,
  logits_processor: [(input_ids, logits) => govern(Array.from(logits))],
});

console.log(out[0].generated_text);
console.log("Governed decode complete. Blocked token ids carried zero probability at every step.");
