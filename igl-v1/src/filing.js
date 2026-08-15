/* WellSite filing pipeline: the first real caller of the governed-decode gateway.

   A production filing is two governed turns, chained. Turn one drafts the PR-202
   compliance packet. Turn two files the production report, chained to turn one by
   prev_receipt_hash so the packet and the filing are one tamper-evident sequence.
   Both turns are governed against the live US-TX/RRC matrix and both seal signed
   receipts. If either turn is refused (a HARD violation), the pipeline stops,
   returns the sealed refusal, and produces NO filing record: a filing that cannot
   be governed is a filing that does not happen.

   The result is a filing record an auditor can verify end to end from the
   artifact alone: both receipts, the chain link between them, the constraint
   digest each was governed under, and the identities involved. */

import { governedCompletion, referenceConnector, verifyCompletionReceipt } from "./gateway.js";
import { sha256, canonical } from "./sign.js";

export async function runFiling({
  facts,                       // { operator, wellId, period, volumes: { oilBbl, gasMcf }, district }
  identities = {
    preparer: "igl://identity/allco/operator-014",     // drafts, cannot file
    filer: "igl://identity/allco/compliance-001",      // files under delegation
  },
  jurisdiction = "US-TX", agency = "RRC",
  base, signer, fetchImpl = globalThis.fetch, connector = referenceConnector(),
}) {
  const steps = [];

  // Turn 1: draft the compliance packet, as the preparer.
  const draft = await governedCompletion({
    base, signer, fetchImpl, connector,
    body: {
      model: "reference",
      messages: [{ role: "user", content: `Prepare the PR-202 production report packet: operator ${facts.operator}, well ${facts.wellId}, period ${facts.period}, district ${facts.district}, oil ${facts.volumes.oilBbl} BBL, gas ${facts.volumes.gasMcf} MCF. Include well identity records.` }],
      igl: { jurisdiction, agency, subject: identities.preparer },
    },
  });
  steps.push({ step: "draft_packet", identity: identities.preparer, outcome: draft.payload.igl.outcome, refused: draft.payload.igl.refused });
  if (draft.payload.igl.refused) return { filed: false, abortedAt: "draft_packet", steps, refusal: draft.payload };

  // Turn 2: file, as the compliance filer, chained to the draft receipt.
  const filing = await governedCompletion({
    base, signer, fetchImpl, connector,
    body: {
      model: "reference",
      messages: [{ role: "user", content: `File the production report for well ${facts.wellId}, period ${facts.period}, from the prepared packet ${draft.payload.igl.receipt.receiptUUID}. Well identity and production report only.` }],
      igl: { jurisdiction, agency, subject: identities.filer, prev: draft.payload.igl.receipt.chain_hash },
    },
  });
  steps.push({ step: "file_report", identity: identities.filer, outcome: filing.payload.igl.outcome, refused: filing.payload.igl.refused });
  if (filing.payload.igl.refused) return { filed: false, abortedAt: "file_report", steps, refusal: filing.payload, draftReceipt: draft.payload.igl.receipt };

  // The filing record: everything an auditor needs, from the artifact alone.
  const record = {
    kind: "wellsite_filing_record",
    jurisdiction, agency, facts, identities,
    constraintMatrixDigest: filing.payload.igl.constraintMatrixDigest,
    draftReceipt: draft.payload.igl.receipt,
    filingReceipt: filing.payload.igl.receipt,
    publicKey: filing.payload.igl.publicKey,
    chainLink: {
      draftChainHash: draft.payload.igl.receipt.chain_hash,
      filingPrev: filing.payload.igl.receipt.prev_receipt_hash,
      linked: filing.payload.igl.receipt.prev_receipt_hash === draft.payload.igl.receipt.chain_hash,
    },
  };
  record.recordDigest = sha256(canonical({ d: record.draftReceipt.chain_hash, f: record.filingReceipt.chain_hash }));
  return { filed: true, steps, record };
}

/* Audit a filing record from the artifact alone: both receipts verify, the chain
   links draft to filing, both bound to the same service digest, neither refused. */
export function auditFilingRecord(record, { publicKeyB64 = null } = {}) {
  const pub = publicKeyB64 || record.publicKey;
  const d = verifyCompletionReceipt(record.draftReceipt, { publicKeyB64: pub });
  const f = verifyCompletionReceipt(record.filingReceipt, { publicKeyB64: pub });
  if (!d.ok) return { ok: false, reason: "draft receipt: " + d.reason };
  if (!f.ok) return { ok: false, reason: "filing receipt: " + f.reason };
  if (record.filingReceipt.prev_receipt_hash !== record.draftReceipt.chain_hash) return { ok: false, reason: "chain broken: filing does not chain to draft" };
  if (record.draftReceipt.constraintMatrixDigest !== record.filingReceipt.constraintMatrixDigest) return { ok: false, reason: "digest mismatch between turns" };
  if (record.draftReceipt.refused || record.filingReceipt.refused) return { ok: false, reason: "a refused turn cannot be part of a filed record" };
  const recordDigest = sha256(canonical({ d: record.draftReceipt.chain_hash, f: record.filingReceipt.chain_hash }));
  if (recordDigest !== record.recordDigest) return { ok: false, reason: "record digest does not reproduce" };
  return { ok: true, digest: record.constraintMatrixDigest, wellId: record.facts?.wellId, period: record.facts?.period };
}
