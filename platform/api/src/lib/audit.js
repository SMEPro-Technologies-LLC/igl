/* The audit chain, decisions and signed governance receipts.

   One hash chain per tenant:
     eventHash = sha256(previousHash + canonical({ type, body }))
   where body is the AuditEvent without its hashes. The first event's
   previousHash is 64 zeros. This is the same rule as src/store.js, so
   docs/examples/verify-audit-chain.mjs can verify an exported chain with the
   runtime's own code. The table has append-only triggers. */

import { sha256, canonical, GENESIS, DOMAIN_RECEIPT } from "./crypto.js";
import { nowIso, uuid } from "./http.js";

export function eventBody(ev) {
  const { previousHash, eventHash, ...body } = ev;
  return body;
}

/* Append one event. The SELECT and INSERT are two statements, so two writers
   can race; the PRIMARY KEY (tenant_id, seq) makes the loser fail, and we
   retry once against the new head. */
export async function appendAudit(db, tenantId, { eventType, actor, resource, action = null, requestId = null, decisionId = null, details = {} }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const head = await db.prepare("SELECT seq, event_hash FROM audit_events WHERE tenant_id = ?1 ORDER BY seq DESC LIMIT 1").bind(tenantId).first();
    const seq = head ? head.seq + 1 : 0;
    const previousHash = head ? head.event_hash : GENESIS;
    const ev = { id: uuid(), eventType, actor, resource, action, occurredAt: nowIso(), requestId, decisionId, details };
    const eventHash = sha256(previousHash + canonical({ type: eventType, body: ev }));
    try {
      await db.prepare(`INSERT INTO audit_events (tenant_id, seq, id, event_type, actor, resource, action, occurred_at, request_id, decision_id, details, previous_hash, event_hash)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`)
        .bind(tenantId, seq, ev.id, eventType, JSON.stringify(actor), JSON.stringify(resource), action, ev.occurredAt, requestId, decisionId, JSON.stringify(details), previousHash, eventHash).run();
      return { ...ev, previousHash, eventHash };
    } catch (err) {
      if (!/UNIQUE|PRIMARY KEY|constraint/i.test(String(err.message))) throw err;
    }
  }
  throw new Error("audit chain: lost the append race three times");
}

export function rowToEvent(r) {
  return { id: r.id, eventType: r.event_type, actor: JSON.parse(r.actor), resource: JSON.parse(r.resource), action: r.action, occurredAt: r.occurred_at, requestId: r.request_id, decisionId: r.decision_id, details: JSON.parse(r.details || "{}"), previousHash: r.previous_hash, eventHash: r.event_hash };
}

export async function storeDecision(db, tenantId, decision) {
  await db.prepare("INSERT INTO decisions (id, tenant_id, body, created_at) VALUES (?1, ?2, ?3, ?4)").bind(decision.decisionId, tenantId, JSON.stringify(decision), decision.evaluatedAt).run();
  return decision;
}

/* A GovernanceReceipt as the contract defines it, plus a signature over the
   canonical receipt body under DOMAIN_RECEIPT and the signer's public key, so
   anyone can verify it without calling us. */
export async function issueReceipt(db, signer, tenantId, { actor, authorityDecision, policiesEvaluated = [], evidenceIds = [], output = null }) {
  const receipt = {
    receiptId: uuid(), actor, authorityDecision, policiesEvaluated, evidenceIds,
    outputHash: output === null ? null : sha256(canonical(output)),
    createdAt: nowIso(),
  };
  const signed = { ...receipt, signer: signer.id, alg: "Ed25519", publicKey: signer.pub(), signature: signer.sign(DOMAIN_RECEIPT, receipt) };
  await db.prepare("INSERT INTO receipts (id, tenant_id, body, created_at) VALUES (?1, ?2, ?3, ?4)").bind(receipt.receiptId, tenantId, JSON.stringify(signed), receipt.createdAt).run();
  return signed;
}

export function verifyReceipt(ServiceSigner, signed) {
  const { signer, alg, publicKey, signature, ...receipt } = signed;
  if (alg !== "Ed25519") return { ok: false, reason: "not an Ed25519 receipt" };
  return ServiceSigner.verify(DOMAIN_RECEIPT, receipt, publicKey, signature) ? { ok: true, signer } : { ok: false, reason: "signature does not verify" };
}
