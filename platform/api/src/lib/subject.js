/* Subject controls (contract 0.3): the controls a person holds over what is
   learned about them, as governed operations.

     pause / resume   nothing new is recorded about the identity while paused
     forget           a fact, a relationship or a context entry is emptied in
                      place and marked forgotten; a tombstone keeps the act and
                      a hash of the record as it was, never the content
     reset            forget everything learned (facts, relationships, context)
     export           the whole record in one signed document, with a
                      fingerprint and the lineage of chain events behind it

   Forgotten records leave every read at once because every read already
   filters on status: relationships and facts are selected with status IN
   ('proposed', 'certified') for projections, paths, neighbors and
   intelligence, and the list operations exclude 'forgotten' explicitly. The
   identity itself, its declared attributes, its obligations and its consent
   records are declared, not learned, and are not touched. */

import { E, nowIso, parseJson } from "./http.js";
import { sha256, canonical } from "./crypto.js";
import { rowToIdentity, rowToRelationship, rowToObligation, rowToConsent } from "./projection.js";
import { rowToFact } from "./intelligence.js";

export async function learningState(db, tenantId, identityId) {
  const r = await db.prepare("SELECT * FROM learning_state WHERE tenant_id = ?1 AND identity_id = ?2").bind(tenantId, identityId).first();
  if (!r) return { identityId, paused: false, since: null, reason: null };
  return { identityId, paused: !!r.paused, since: r.since, reason: r.reason, changedBy: r.changed_by ? parseJson(r.changed_by, undefined) : undefined };
}

/* Called by every write that would add to an identity's record. */
export async function assertLearning(db, tenantId, ...identityIds) {
  for (const id of identityIds.filter(Boolean)) {
    const st = await learningState(db, tenantId, id);
    if (st.paused) throw E.conflict(`Learning about identity ${id} is paused; nothing new is recorded until it is resumed.`, { code: "learning_paused", identityId: id, since: st.since });
  }
}

export async function setLearning(db, tenantId, identityId, { paused, reason, actor, decisionId }) {
  const now = nowIso();
  await db.prepare(`INSERT INTO learning_state (identity_id, tenant_id, paused, since, reason, changed_by, decision_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    ON CONFLICT(identity_id) DO UPDATE SET paused = excluded.paused, since = excluded.since, reason = excluded.reason, changed_by = excluded.changed_by, decision_id = excluded.decision_id`)
    .bind(identityId, tenantId, paused ? 1 : 0, now, reason ?? null, JSON.stringify(actor), decisionId ?? null).run();
  return learningState(db, tenantId, identityId);
}

/* ---- forget ----
   Each target is read as it stands, hashed, emptied in place and marked
   forgotten, and a tombstone is written. Returns tombstones and the targets
   that did not belong to this identity. */
async function readTarget(db, tenantId, identityId, t) {
  if (t.type === "fact") {
    const r = await db.prepare("SELECT * FROM facts WHERE tenant_id = ?1 AND id = ?2 AND status != 'forgotten'").bind(tenantId, t.id).first();
    if (!r) return null;
    const f = rowToFact(r);
    const objId = f.object && typeof f.object === "object" ? f.object.id : null;
    if (f.subjectId !== identityId && objId !== identityId) return null;
    return { kind: "fact", id: r.id, content: f };
  }
  if (t.type === "relationship") {
    const r = await db.prepare("SELECT * FROM relationships WHERE tenant_id = ?1 AND id = ?2 AND status != 'forgotten'").bind(tenantId, t.id).first();
    if (!r || (r.from_id !== identityId && r.to_id !== identityId)) return null;
    return { kind: "relationship", id: r.id, content: rowToRelationship(r) };
  }
  if (t.type === "context") {
    const r = await db.prepare("SELECT context FROM identities WHERE tenant_id = ?1 AND id = ?2").bind(tenantId, identityId).first();
    const entries = parseJson(r?.context, []);
    const e = entries.find((x) => x.id === t.id && !x.forgotten);
    if (!e) return null;
    return { kind: "context", id: e.id, content: e };
  }
  return null;
}

async function emptyTarget(db, tenantId, identityId, target, forgottenAt) {
  if (target.kind === "fact")
    await db.prepare("UPDATE facts SET status = 'forgotten', object = 'null', qualifiers = '{}', confidence = 0, provenance = NULL, valid_from = NULL, valid_to = NULL WHERE tenant_id = ?1 AND id = ?2").bind(tenantId, target.id).run();
  else if (target.kind === "relationship")
    await db.prepare("UPDATE relationships SET status = 'forgotten', attributes = '{}', confidence = NULL, provenance = NULL, effective_from = NULL, effective_to = NULL WHERE tenant_id = ?1 AND id = ?2").bind(tenantId, target.id).run();
  else if (target.kind === "context") {
    const r = await db.prepare("SELECT context FROM identities WHERE tenant_id = ?1 AND id = ?2").bind(tenantId, identityId).first();
    const entries = parseJson(r?.context, []).map((x) => (x.id === target.id ? { id: x.id, forgotten: true, forgottenAt } : x));
    await db.prepare("UPDATE identities SET context = ?1, updated_at = ?2 WHERE tenant_id = ?3 AND id = ?4").bind(JSON.stringify(entries), forgottenAt, tenantId, identityId).run();
  }
}

export async function forget(db, tenantId, identityId, targets, { reason = null, decisionId = null, receiptId = null } = {}) {
  const forgotten = []; const notFound = [];
  const seen = new Set();
  for (const t of targets) {
    const key = `${t.type}:${t.id}`; if (seen.has(key)) continue; seen.add(key);
    const target = await readTarget(db, tenantId, identityId, t);
    if (!target) { notFound.push({ type: t.type, id: t.id }); continue; }
    const forgottenAt = nowIso();
    const contentHash = sha256(canonical(target.content));
    await emptyTarget(db, tenantId, identityId, target, forgottenAt);
    await db.prepare("INSERT INTO tombstones (id, tenant_id, identity_id, kind, content_hash, reason, forgotten_at, decision_id, receipt_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")
      .bind(target.id, tenantId, identityId, target.kind, contentHash, reason, forgottenAt, decisionId, receiptId).run();
    forgotten.push({ type: target.kind, id: target.id, contentHash, forgottenAt });
  }
  return { forgotten, notFound };
}

/* Everything learned about an identity, as forget targets. */
export async function learnedTargets(db, tenantId, identityId) {
  const out = [];
  const facts = await db.prepare("SELECT id FROM facts WHERE tenant_id = ?1 AND status != 'forgotten' AND (subject_id = ?2 OR object LIKE ?3)").bind(tenantId, identityId, `%${identityId}%`).all();
  for (const r of facts.results) out.push({ type: "fact", id: r.id });
  const rels = await db.prepare("SELECT id FROM relationships WHERE tenant_id = ?1 AND status != 'forgotten' AND (from_id = ?2 OR to_id = ?2)").bind(tenantId, identityId).all();
  for (const r of rels.results) out.push({ type: "relationship", id: r.id });
  const row = await db.prepare("SELECT context FROM identities WHERE tenant_id = ?1 AND id = ?2").bind(tenantId, identityId).first();
  for (const e of parseJson(row?.context, [])) if (!e.forgotten) out.push({ type: "context", id: e.id });
  return out;
}

export async function tombstonesFor(db, tenantId, identityId) {
  const { results } = await db.prepare("SELECT * FROM tombstones WHERE tenant_id = ?1 AND identity_id = ?2 ORDER BY forgotten_at ASC").bind(tenantId, identityId).all();
  return results.map((r) => ({ type: r.kind, id: r.id, contentHash: r.content_hash, forgottenAt: r.forgotten_at }));
}

/* ---- export ----
   The record as the tenant holds it, with a fingerprint over the canonical
   form and the lineage of every chain event about the identity. */
export const FINGERPRINT_OF = "SHA-256 over the canonical JSON (keys sorted, no whitespace) of {identity, context, facts, relationships, obligations, consents, tombstones}, where context entries, facts and relationships that were forgotten appear only in tombstones.";

export async function exportRecord(db, tenantId, identityRow) {
  const identityId = identityRow.id;
  const identity = rowToIdentity(identityRow);
  const context = parseJson(identityRow.context, []).filter((e) => !e.forgotten);
  const facts = (await db.prepare("SELECT * FROM facts WHERE tenant_id = ?1 AND status != 'forgotten' AND (subject_id = ?2 OR object LIKE ?3) ORDER BY created_at ASC").bind(tenantId, identityId, `%${identityId}%`).all()).results.map(rowToFact);
  const relationships = (await db.prepare("SELECT * FROM relationships WHERE tenant_id = ?1 AND status != 'forgotten' AND (from_id = ?2 OR to_id = ?2) ORDER BY created_at ASC").bind(tenantId, identityId).all()).results.map(rowToRelationship);
  const obligations = (await db.prepare("SELECT * FROM obligations WHERE tenant_id = ?1 AND subject_id = ?2 ORDER BY due_date ASC").bind(tenantId, identityId).all()).results.map(rowToObligation);
  const consents = (await db.prepare("SELECT * FROM consents WHERE tenant_id = ?1 AND identity_id = ?2 ORDER BY granted_at ASC").bind(tenantId, identityId).all()).results.map(rowToConsent);
  const tombstones = await tombstonesFor(db, tenantId, identityId);
  const learning = await learningState(db, tenantId, identityId);
  /* hashed exactly as the holder receives it: a JSON round trip drops undefined members, so the recomputation matches byte for byte */
  const parts = JSON.parse(JSON.stringify({ identity, context, facts, relationships, obligations, consents, tombstones }));
  const fingerprint = sha256(canonical(parts));
  const { results: events } = await db.prepare("SELECT seq, event_type, occurred_at, decision_id, event_hash FROM audit_events WHERE tenant_id = ?1 AND (resource LIKE ?2 OR details LIKE ?2) ORDER BY seq ASC LIMIT 5000").bind(tenantId, `%${identityId}%`).all();
  const lineage = events.map((e) => ({ seq: e.seq, eventType: e.event_type, occurredAt: e.occurred_at, decisionId: e.decision_id, eventHash: e.event_hash }));
  return { identityId, generatedAt: nowIso(), fingerprint, fingerprintOf: FINGERPRINT_OF, identity, context, facts, relationships, obligations, consents, learning, tombstones, lineage };
}

