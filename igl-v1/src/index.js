/* IGL v1.0 reference runtime - entry point.
   run(source[, opts]) executes a Program and returns the session result,
   including a signed Governance Receipt. verify(receipt[, publicKey]) checks a
   receipt from the artifact alone. recomputeFuse(trace) re-derives the governed
   distribution so a third party can confirm the FUSE step independently. */

export { parse } from "./parser.js";
export { check } from "./check.js";
export { Interpreter } from "./interpreter.js";
export { IOSPlus, VOCAB } from "./iosplus.js";
export { Signer, sha256, canonical } from "./sign.js";
export { resolveConstraints, pinnedConstraints } from "./resolve.js";
export { MODULES, projectConstraint, crosswalkDigest } from "./crosswalk.js";

import { Interpreter } from "./interpreter.js";
import { Signer, sha256, canonical } from "./sign.js";

export function run(source, opts = {}) {
  const interp = new Interpreter(opts);
  return interp.run(source);
}

/* Independent receipt verification (Section 5.04 / 3.05). */
export function verify(receipt, publicKeyB64 = null) {
  return Signer.verifyReceipt(receipt, { publicKeyB64 });
}

/* Independent FUSE re-computation from a sealed cognitive trace's fuse record:
   recompute normalize(v (x) w) and confirm support restriction and the output
   digest. This is the check a skeptic runs against the one operator they doubt. */
export function recomputeFuse(fuse) {
  const { inputDist, weights, outputDist } = fuse;
  const prod = inputDist.map((p, i) => p * weights[i]);
  const s = prod.reduce((a, b) => a + b, 0);
  const recomputed = prod.map(x => Number((x / s).toFixed(6)));
  const supportOk = weights.every((w, i) => w !== 0 || recomputed[i] === 0);
  const matches = recomputed.every((x, i) => Math.abs(x - outputDist[i]) < 1e-6);
  const digestOk = sha256(canonical(recomputed)) === fuse.outputDigest;
  return { ok: matches && supportOk && digestOk, supportOk, matches, digestOk, recomputed };
}
