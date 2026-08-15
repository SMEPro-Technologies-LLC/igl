/* Governed-decode gateway: the OpenAI-compatible surface.

   One endpoint that any existing client can point at without changing its code:
   POST /v1/chat/completions takes the standard shape (model, messages) plus an
   `igl` block naming the governing identity, jurisdiction, and agency. The gateway
   resolves the live UDM constraint, obtains the model's answer through a labelled
   connector seam, projects that answer onto the governed reasoning paths, applies
   FUSE then the graded boundary check, and returns an OpenAI-shaped response with
   the signed governance receipt attached. A HARD violation returns a refusal with
   the sealed receipt of the refusal, never the violating content.

   Two seams are deliberate and labelled, not hidden:
   - `connector(model, messages)` produces the answer text and, when the upstream
     exposes them, per-path masses. Closed chat APIs plug in here.
   - `classify(text, paths)` projects an answer onto the constraint's reasoning
     paths when the upstream gives text only. The reference implementation is a
     transparent keyword projection; the crosswalk service replaces it. */

import { getMatrix, deriveConstraint, fuseAndCheck, UDM_SERVICE } from "./udm.js";
import { sha256, canonical } from "./sign.js";

/* Reference classifier: transparent, deterministic keyword projection of an
   answer onto the constraint's paths. Every path gets a small floor so mass sums
   to 1 and mandatory paths are representable; keyword hits concentrate mass. This
   is the stand-in the Semantic Crosswalk replaces per model. */
export function referenceClassify(text, paths) {
  const t = (text || "").toLowerCase();
  const hits = paths.map(p => {
    const words = p.replace(/^path-/, "").split("-");
    return words.reduce((a, w) => a + (t.includes(w) ? 1 : 0), 0);
  });
  const total = hits.reduce((a, b) => a + b, 0);
  const floor = 0.02;
  const raw = hits.map(h => floor + (total ? (h / total) * (1 - floor * paths.length) : (1 - floor * paths.length) / paths.length));
  const s = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(paths.map((p, i) => [p, Number((raw[i] / s).toFixed(6))]));
}

/* Reference connector: deterministic echo model so the gateway is fully testable
   with no upstream. A real deployment registers connectors per model name. */
export function referenceConnector() {
  return async (model, messages) => {
    const last = messages[messages.length - 1]?.content || "";
    return { text: `[${model}] governed draft: ${last.slice(0, 200)}` };
  };
}

export async function governedCompletion({
  base = UDM_SERVICE, body, connector, classify = referenceClassify,
  signer = null, fetchImpl = globalThis.fetch, now = () => Date.now() / 1000,
  provenance = { digestSource: "live" },
}) {
  const { model = "reference", messages = [], igl = {} } = body || {};
  const { jurisdiction, agency, subject = null, strictness = "HARD", prev = null } = igl;
  if (!jurisdiction || !agency) return { status: 400, payload: { error: { message: "igl.jurisdiction and igl.agency are required", type: "invalid_request_error" } } };
  if (!Array.isArray(messages) || !messages.length) return { status: 400, payload: { error: { message: "messages are required", type: "invalid_request_error" } } };

  // 1. The governing law, live, with its service digest.
  const matrix = await getMatrix(base, { jurisdiction, agency, fetchImpl });
  const constraint = deriveConstraint(matrix);

  // 2. The model's answer through the connector seam.
  const out = await connector(model, messages);

  // 3. Project onto the governed paths (upstream masses win when provided).
  const distByPath = out.distByPath || classify(out.text, constraint.paths);

  // 4. Apply, then check.
  let result, zeroPartition = false;
  try { result = fuseAndCheck(distByPath, constraint, { strictness }); }
  catch { zeroPartition = true; result = { outcome: "HARD_VIOLATION", governed: [], paths: constraint.paths, violations: [{ reason: "zero partition: every reasoning path blocked" }], missingMandatory: [] }; }

  const refused = result.outcome === "HARD_VIOLATION";
  const content = refused
    ? "REFUSED: this response would cross a governed boundary for " + jurisdiction + "/" + agency + ". The refusal is sealed in the attached receipt."
    : out.text;

  // 5. Seal the receipt over the governed turn, bound to the service digest.
  const answer = { jurisdiction, agency, outcome: result.outcome, paths: result.paths, governed: result.governed, violations: result.violations, missingMandatory: result.missingMandatory, contentDigest: sha256(content) };
  const query_hash = sha256(canonical({ model, messages, jurisdiction, agency, matrixDigest: constraint.digest, matrixVersion: constraint.version }));
  const answer_hash = sha256(canonical(answer));
  const chain_hash = sha256((prev || "") + query_hash + answer_hash);
  const fields = {
    receiptUUID: "gw-" + chain_hash.slice(0, 20),
    kind: "governed_completion", subject, jurisdiction, agency, model,
    constraintMatrixDigest: constraint.digest, matrixVersion: constraint.version, source: constraint.source, matrixId: constraint.matrixId,
    outcome: result.outcome, refused,
    query_hash, answer_hash, prev_receipt_hash: prev || null, chain_hash,
    provenance: { ...provenance, service: base },
    payload: { answer, distByPath },
    created_at: now(),
  };
  const receipt = signer ? signer.signReceipt(fields) : fields;

  // 6. OpenAI-shaped response, receipt attached, honest finish_reason.
  return {
    status: 200,
    payload: {
      id: "chatcmpl-" + chain_hash.slice(0, 24),
      object: "chat.completion",
      created: Math.floor(now()),
      model,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: refused ? "content_filter" : "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      igl: { outcome: result.outcome, refused, constraintMatrixDigest: constraint.digest, receipt, publicKey: signer ? signer.pub() : null, zeroPartition },
    },
  };
}

/* Verify a gateway receipt from the artifact alone. */
export function verifyCompletionReceipt(receipt, { publicKeyB64 = null } = {}) {
  const p = receipt.payload;
  if (!p) return { ok: false, reason: "no payload" };
  const answer_hash = sha256(canonical(p.answer));
  if (answer_hash !== receipt.answer_hash) return { ok: false, reason: "answer altered" };
  const chain_hash = sha256((receipt.prev_receipt_hash || "") + receipt.query_hash + receipt.answer_hash);
  if (chain_hash !== receipt.chain_hash) return { ok: false, reason: "chain_hash does not reproduce" };
  if (receipt.signature) {
    // signature envelope check is the same as govern.js receipts
    const { Signer } = require_sign();
    const v = Signer.verifyReceipt(receipt, { publicKeyB64 });
    if (!v.ok) return { ok: false, reason: "signature: " + v.reason };
  }
  return { ok: true, outcome: receipt.outcome, refused: !!receipt.refused };
}
// tiny indirection so this file stays importable in both Node and Workers bundles
import { Signer as _Signer } from "./sign.js";
function require_sign() { return { Signer: _Signer }; }
