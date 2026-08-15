/* Governed-decode gateway, end to end and hermetic: real Request/Response objects
   through the Worker entry, live-fixture matrix on the wire seam, reference
   connector as the model. Proves the OpenAI shape, the governed receipt, the
   refusal path, and independent verification. */

import worker from "../src/gateway-worker.js";
import { governedCompletion, referenceClassify, verifyCompletionReceipt } from "../src/gateway.js";
import { Signer } from "../src/sign.js";
import { fixtureFetch, LIVE } from "./fixtures/live-matrices.js";

let passed = 0, failed = 0;
const ok = (n, c, extra = "") => { c ? passed++ : failed++; console.log((c ? "  ok   " : "  FAIL ") + n + (c ? "" : "  [" + extra + "]")); };

const env = { IGL_SIGNING_SEED: "07".repeat(32) };
const realFetch = globalThis.fetch;
globalThis.fetch = fixtureFetch();

try {
  const req = (path, body, method = "POST") =>
    new Request("https://gateway.local" + path, method === "POST"
      ? { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      : { method });

  // 1) A compliant completion in the OpenAI shape.
  const res = await worker.fetch(req("/v1/chat/completions", {
    model: "reference",
    messages: [{ role: "user", content: "Prepare the production report summary for the well identity records." }],
    igl: { jurisdiction: "US-TX", agency: "RRC" },
  }), env);
  ok("returns 200", res.status === 200, "status " + res.status);
  const body = await res.json();
  ok("OpenAI shape: chat.completion with one choice", body.object === "chat.completion" && body.choices?.length === 1);
  ok("igl block carries the live service digest", body.igl.constraintMatrixDigest === LIVE["US-TX|RRC"].digest);
  ok("compliant turn is not refused", body.igl.refused === false && body.choices[0].finish_reason === "stop");
  ok("receipt kind is governed_completion", body.igl.receipt.kind === "governed_completion");

  // 2) The receipt verifies through the verify endpoint and from the artifact alone.
  const vres = await worker.fetch(req("/v1/verify", { receipt: body.igl.receipt, publicKey: body.igl.publicKey }), env);
  const v = await vres.json();
  ok("/v1/verify confirms the receipt", v.ok === true, JSON.stringify(v));
  ok("verifies offline from the artifact", verifyCompletionReceipt(body.igl.receipt, { publicKeyB64: body.igl.publicKey }).ok);

  // 3) Tampering with the sealed answer is caught.
  const tampered = JSON.parse(JSON.stringify(body.igl.receipt));
  tampered.payload.answer.outcome = "COMPLIANT_FORGED";
  ok("altering the sealed answer is caught", verifyCompletionReceipt(tampered).ok === false);

  // 4) A violating projection refuses and still seals a receipt. Force it by
  //    supplying upstream masses over the 0.8 production-report ceiling.
  const signer = Signer.fromSeed("t", Buffer.alloc(32, 9));
  const bad = await governedCompletion({
    base: "https://udm.igl.dev",
    body: { model: "reference", messages: [{ role: "user", content: "x" }], igl: { jurisdiction: "US-TX", agency: "RRC" } },
    connector: async () => ({ text: "over-cap draft", distByPath: { "path-production-report": 0.95, "path-well-identity": 0.01, "path-financial-detail": 0.01, "path-pii-disclosure": 0.03 } }),
    signer, fetchImpl: fixtureFetch(),
  });
  ok("HARD violation refuses with content_filter", bad.payload.igl.refused === true && bad.payload.choices[0].finish_reason === "content_filter");
  ok("refused content is the refusal, not the draft", bad.payload.choices[0].message.content.startsWith("REFUSED"));
  ok("refusal receipt still verifies", verifyCompletionReceipt(bad.payload.igl.receipt, { publicKeyB64: signer.pub() }).ok);

  // 5) Fully blocked projection fails closed, sealed as a violation.
  const dead = await governedCompletion({
    base: "https://udm.igl.dev",
    body: { model: "reference", messages: [{ role: "user", content: "x" }], igl: { jurisdiction: "US-TX", agency: "RRC" } },
    connector: async () => ({ text: "pii only", distByPath: { "path-pii-disclosure": 1 } }),
    signer, fetchImpl: fixtureFetch(),
  });
  ok("zero partition fails closed as HARD_VIOLATION", dead.payload.igl.zeroPartition === true && dead.payload.igl.refused === true);

  // 6) Missing igl block is a 400, and the classifier normalizes to 1.
  const noIgl = await worker.fetch(req("/v1/chat/completions", { model: "reference", messages: [{ role: "user", content: "x" }] }), env);
  ok("missing igl.jurisdiction/agency is a 400", noIgl.status === 400);
  const d = referenceClassify("production report and well identity", ["path-a", "path-b", "path-production-report", "path-well-identity"]);
  const sum = Object.values(d).reduce((a, b) => a + b, 0);
  ok("reference classifier normalizes to 1", Math.abs(sum - 1) < 1e-4, "sum " + sum);

  // 7) Health names the surface.
  const h = await (await worker.fetch(req("/health", null, "GET"), env)).json();
  ok("health reports the gateway keyed", h.service === "igl-gateway" && h.keyed === true);
} finally {
  globalThis.fetch = realFetch;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
