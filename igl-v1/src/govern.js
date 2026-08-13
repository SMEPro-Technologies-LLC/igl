/* A governed turn against the DEPLOYED matrix.

   This is the production path: fetch the live constraint matrix from the UDM
   service, apply FUSE (support restriction) then the boundary check (graded
   ceilings), and seal a receipt whose constraintMatrixDigest IS the digest the
   service published. Run it where the network reaches udm.igl.dev (a Worker, or
   any host with egress); the receipt then binds to the live governance state. */

import { getMatrix, deriveConstraint, fuseAndCheck, UDM_SERVICE } from "./udm.js";
import { sha256, canonical, Signer } from "./sign.js";

export async function governedTurn({
  base = UDM_SERVICE, jurisdiction, agency, distByPath, strictness = "HARD",
  signer = null, fetchImpl = globalThis.fetch, subject = null, prev = null, now = () => Date.now() / 1000,
  provenance = { digestSource: "unknown" },
} = {}) {
  const matrix = await getMatrix(base, { jurisdiction, agency, fetchImpl });
  const constraint = deriveConstraint(matrix);
  const result = fuseAndCheck(distByPath, constraint, { strictness });

  const answer = { jurisdiction, agency, outcome: result.outcome, paths: result.paths, governed: result.governed, violations: result.violations, missingMandatory: result.missingMandatory };
  const query_hash = sha256(canonical({ jurisdiction, agency, distByPath, matrixDigest: constraint.digest, matrixVersion: constraint.version }));
  const answer_hash = sha256(canonical(answer));
  const prev_receipt_hash = prev || null;
  const chain_hash = sha256((prev_receipt_hash || "") + query_hash + answer_hash);

  const fields = {
    receiptUUID: "gov-" + chain_hash.slice(0, 20),
    kind: "governed_turn",
    subject, jurisdiction, agency,
    constraintMatrixDigest: constraint.digest,   // the SERVICE-computed digest
    matrixVersion: constraint.version, source: constraint.source, matrixId: constraint.matrixId,
    outcome: result.outcome,
    query_hash, answer_hash, prev_receipt_hash, chain_hash,
    /* provenance is signed, so a committed receipt is self-describing: a reader
       can tell whether the matrix digest came off the wire or from a fixture. */
    provenance: { ...provenance },
    payload: { answer, distByPath },
    created_at: now(),
  };
  const receipt = signer ? signer.signReceipt(fields) : fields;
  return { matrix, constraint, result, receipt };
}

/* Verify a governed-turn receipt from the artifact alone: recompute the two
   hashes and the chain from the payload, then check the Ed25519 signature. */
export function verifyGovernedReceipt(receipt, { publicKeyB64 = null } = {}) {
  const p = receipt.payload;
  if (!p) return { ok: false, reason: "no payload" };
  const query_hash = sha256(canonical({ jurisdiction: receipt.jurisdiction, agency: receipt.agency, distByPath: p.distByPath, matrixDigest: receipt.constraintMatrixDigest, matrixVersion: receipt.matrixVersion }));
  const answer_hash = sha256(canonical(p.answer));
  if (query_hash !== receipt.query_hash) return { ok: false, reason: "query_hash does not reproduce" };
  if (answer_hash !== receipt.answer_hash) return { ok: false, reason: "answer altered" };
  const chain_hash = sha256((receipt.prev_receipt_hash || "") + query_hash + answer_hash);
  if (chain_hash !== receipt.chain_hash) return { ok: false, reason: "chain_hash does not reproduce" };
  if (receipt.signature) { const v = Signer.verifyReceipt(receipt, { publicKeyB64 }); if (!v.ok) return { ok: false, reason: "signature: " + v.reason }; }
  return { ok: true, outcome: receipt.outcome, boundToServiceDigest: receipt.constraintMatrixDigest };
}
