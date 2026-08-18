import { test } from "node:test";
import assert from "node:assert/strict";
import { softmax, governedStep, governedDecode, verifyDecode, governanceLogitsProcessor } from "../src/index.js";

const VOCAB = ["alpha", "beta", "gamma", "delta"];
const ALLOW_ALL = [1, 1, 1, 1];

test("softmax normalizes and is shift-stable", () => {
  const d = softmax([1, 2, 3, 4]);
  assert.ok(Math.abs(d.reduce((a, b) => a + b) - 1) < 1e-9);
  assert.deepEqual(softmax([1, 2, 3, 4]), softmax([11, 12, 13, 14]));
});

test("governedStep: permitted tokens keep mass, prohibited tokens are exactly zero", () => {
  const raw = softmax([2, 1, 0, -1]);
  const step = governedStep(VOCAB, raw, [1, 1, 0, 0], null, 0, "HARD");
  assert.equal(step.outcome, "COMPLIANT");
  assert.equal(step.governed[2], 0);
  assert.equal(step.governed[3], 0);
  assert.ok(step.governed[0] > step.governed[1]);
  assert.match(step.record.governedDigest, /^[0-9a-f]{64}$/);
});

test("governedStep: zero partition when no permitted token can carry mass", () => {
  const raw = softmax([2, 1, 0, -1]);
  const step = governedStep(VOCAB, raw, [0, 0, 0, 0], null, 0, "HARD");
  assert.equal(step.zeroPartition, true);
});

test("governedStep: graded ceilings produce HARD_VIOLATION under HARD strictness", () => {
  const raw = softmax([5, 0, 0, 0]);                  // alpha dominates
  const step = governedStep(VOCAB, raw, ALLOW_ALL, [0.5, 1, 1, 1], 0, "HARD");
  assert.equal(step.outcome, "HARD_VIOLATION");
  assert.equal(step.violations[0].token, "alpha");
});

test("governanceLogitsProcessor sends prohibited tokens to -Infinity", () => {
  const out = governanceLogitsProcessor([1, 0, 1, 0])([0.5, 0.5, 0.5, 0.5]);
  assert.equal(out[1], -Infinity);
  assert.equal(out[3], -Infinity);
  assert.equal(out[0], 0.5);
});

test("governedDecode end-to-end: the sampler only ever sees the governed space", () => {
  /* deterministic 'model': always favors delta, which is prohibited */
  const logitsFn = () => [0, 0, 1, 5];
  const weights = [1, 1, 1, 0];
  const d = governedDecode({ vocab: VOCAB, logitsFn, weights, steps: 3 });
  assert.equal(d.outcome, "COMPLIANT");
  assert.ok(!d.tokens.includes("delta"));
  assert.deepEqual(d.tokens, ["gamma", "gamma", "gamma"]);
  const v = verifyDecode({ vocab: VOCAB, weights, trace: d.trace, sealed: d.sealed });
  assert.equal(v.ok, true);
  assert.equal(v.steps, 3);
});

test("verifyDecode rejects a trace whose step digest was altered after capture", () => {
  const logitsFn = () => [0, 0, 1, 5];
  const weights = [1, 1, 1, 0];
  const d = governedDecode({ vocab: VOCAB, logitsFn, weights, steps: 2 });
  const tampered = d.trace.map(r => ({ ...r }));
  tampered[0] = { ...tampered[0], governedDigest: "f".repeat(64) };
  const v = verifyDecode({ vocab: VOCAB, weights, trace: tampered, sealed: d.sealed });
  assert.equal(v.ok, false);
  assert.match(v.reason, /does not reproduce/);
});
