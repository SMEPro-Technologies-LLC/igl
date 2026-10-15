/* Ed25519 receipts, tamper-evident to load-refusing to ATTRIBUTABLE,
   where attributable means pinned to a key the identity graph vouched for
   at the time of signing, not "signed by someone".

   rev 2, post-review:
     R1  the signature covers the full envelope {traceDigest, signer, alg, at},
         not the bare digest, signer and timestamp are authenticated fields,
         so neither name-swapping nor backdating survives verification.
     R2  verification accepts a graph: `signer` resolves to the key registered
         AT SIGNING TIME (rotation-safe), and an embedded key that does not
         match fails. Without a graph the result is explicit: pinned: false.
     R4  domain separation, trace and head signatures are computed under
         distinct prefixes, so a signature from one context can never be
         replayed into the other. And headReceipt nests caller meta so it can
         never override the verified chain head. */

import { generateKeyPairSync, createPublicKey, createPrivateKey, sign as edSign, verify as edVerify, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const sha256 = s => createHash("sha256").update(s).digest("hex");
export function canonical(x) {
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  if (x && typeof x === "object")
    return "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}";
  return JSON.stringify(x);
}

/* ---- runtime attestation ----
   Every receipt names the runtime that produced it: a SHA-256 over the
   runtime's own source files (sorted manifest of per-file digests), computed
   once per process. Not a trust score and not a self-report, the digest is
   INSIDE the signed envelope, so "which governed runtime produced this
   receipt" is settled by re-computation against a known build, not by
   confidence. A receipt signed by a modified runtime carries a different
   digest; a receipt whose digest field is swapped fails the signature. */
let RUNTIME_DIGEST = null;
export function runtimeDigest() {
  if (RUNTIME_DIGEST) return RUNTIME_DIGEST;
  const here = dirname(fileURLToPath(import.meta.url));
  const manifest = readdirSync(here)
    .filter(f => f.endsWith(".js"))
    .sort()
    .map(f => ({ file: f, digest: sha256(readFileSync(join(here, f), "utf8")) }));
  RUNTIME_DIGEST = sha256(canonical(manifest));
  return RUNTIME_DIGEST;
}

export const DOMAIN_TRACE = "IGL-TRACE-v0.2:";
export const DOMAIN_HEAD = "IGL-HEAD-v0.2:";
/* rev 3 (security fixes F-03 / F-04):
     R5  authority events (grant, revoke, key, keyrevoke) are signed envelopes
         under their own domain, verified against a grantor registry, a
         `by` string is a label, a signature is authority.
     R6  a human approval is a signature by a key the service does NOT hold,
         over the statement it approves, under its own domain. A key the
         service holds can only ever produce a `service` attestation. */
export const DOMAIN_GRANT = "IGL-GRANT-v0.2:";
export const DOMAIN_APPROVAL = "IGL-APPROVAL-v0.2:";

export class Signer {
  constructor({ id, privateKey, publicKey }) { Object.assign(this, { id, privateKey, publicKey }); }

  static generate(id) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    return new Signer({ id, privateKey, publicKey });
  }

  /* SPKI DER, base64, what travels inside a receipt and what the graph binds. */
  pub() { return this.publicKey.export({ type: "spki", format: "der" }).toString("base64"); }

  /* ---- persistence: a signer that is regenerated on every run attests
     nothing, because nothing outlives the process to be attributed to.
     PKCS#8 PEM in, PKCS#8 PEM out; the public key is derived. ---- */
  toPem() { return this.privateKey.export({ type: "pkcs8", format: "pem" }); }
  static fromPem(id, pem) {
    const privateKey = createPrivateKey(pem);
    return new Signer({ id, privateKey, publicKey: createPublicKey(privateKey) });
  }
  /* A registry entry that holds only the public key: the service can VERIFY
     signatures made by this party but can never make one. This is what a
     human signer looks like to the runtime. */
  static publicOnly(id, publicKeyB64) { return { id, publicKey: publicKeyB64, publicOnly: true }; }
  static publicKeyOf(entry) {
    if (!entry) return null;
    if (entry instanceof Signer) return entry.pub();
    return entry.publicKey || null;
  }
  static canSign(entry) { return entry instanceof Signer; }

  /* ---- authority events (R5): the envelope is the event minus its signature ---- */
  signGrant(event) {
    const { signature, ...envelope } = event;
    return this._sign(DOMAIN_GRANT, envelope);
  }
  static verifyGrant(event, publicKeyB64) {
    if (!event || !event.signature || !publicKeyB64) return false;
    const { signature, ...envelope } = event;
    return this._verify(DOMAIN_GRANT, envelope, publicKeyB64, signature);
  }

  /* ---- human approval (R6): binds a signer to ONE statement ----
     The envelope names the actor, intent, boundary and statement key the
     approver saw, so an approval cannot be replayed onto different work. */
  static approvalEnvelope({ signer, statementKey, actor, intent, boundary }) {
    return { signer, statementKey, actor, intent, boundary, alg: "Ed25519" };
  }
  approve(subject) {
    const envelope = Signer.approvalEnvelope({ ...subject, signer: this.id });
    return { ...envelope, signature: this._sign(DOMAIN_APPROVAL, envelope) };
  }
  static verifyApproval(approval, subject, publicKeyB64) {
    if (!approval || !approval.signature || !publicKeyB64) return { ok: false, reason: "no approval signature" };
    const expected = Signer.approvalEnvelope({ ...subject, signer: approval.signer });
    const { signature, ...given } = approval;
    if (canonical(given) !== canonical(expected)) return { ok: false, reason: "approval does not describe this statement" };
    if (!this._verify(DOMAIN_APPROVAL, expected, publicKeyB64, signature)) return { ok: false, reason: "approval signature does not verify" };
    return { ok: true };
  }

  _sign(domain, payload) {
    return edSign(null, Buffer.from(domain + canonical(payload), "utf8"), this.privateKey).toString("base64");
  }
  static _verify(domain, payload, publicKeyB64, signatureB64) {
    try {
      return edVerify(null, Buffer.from(domain + canonical(payload), "utf8"),
        createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" }),
        Buffer.from(signatureB64, "base64"));
    } catch { return false; }
  }

  /* ---- trace receipt: the ENVELOPE is signed, not the bare digest ----
     An undated trace is refused: the signing-time check in verification
     anchors on the trace's own timestamp (inside the signed digest), and a
     fallback to the receipt's `at` would end somewhere the signer controls, a revoked key could claim an earlier signing time and nothing would
     contradict it. Refusing here makes the fallback unreachable rather
     than defended. */
  receiptForTrace(trace) {
    if (!trace.finished && !trace.at)
      throw new Error("refusing to sign an undated trace, verification anchors on the trace timestamp, which must sit inside the signed digest");
    const body = { ...trace }; delete body.receipt;
    const envelope = {
      traceDigest: sha256(canonical(body)),
      signer: this.id, alg: "Ed25519", at: new Date().toISOString(),
      runtime: runtimeDigest(),
    };
    return { ...envelope, publicKey: this.pub(), signature: this._sign(DOMAIN_TRACE, envelope) };
  }

  /* ---- head receipt: meta is NESTED so it cannot shadow the verified head ---- */
  headReceipt(journal, meta = {}) {
    const v = journal.verify();
    if (!v.ok) throw new Error(`refusing to sign a broken chain, ${v.reason} at ${v.at}`);
    const envelope = {
      head: v.head, length: v.length,
      signer: this.id, alg: "Ed25519", at: new Date().toISOString(),
      runtime: runtimeDigest(),
      meta,
    };
    return { ...envelope, publicKey: this.pub(), signature: this._sign(DOMAIN_HEAD, envelope) };
  }

  /* ---- verification ----
     `graph` pins attribution: the embedded key must be registered to `signer`
     at signing time. asOf defaults to the TRACE's own timestamp (which sits
     inside the signed digest) rather than the receipt's `at`, so a signer
     whose key was later revoked cannot extend it by backdating the receipt
     field, the trace body would have to lie too, and the digest covers it. */
  static verifyTraceReceipt(trace, { graph = null, asOf = null } = {}) {
    const r = trace?.receipt;
    if (!r || r.alg !== "Ed25519") return { ok: false, reason: "no Ed25519 receipt on this trace" };
    const body = { ...trace }; delete body.receipt;
    const digest = sha256(canonical(body));
    if (digest !== r.traceDigest) return { ok: false, reason: "trace does not reproduce the signed digest" };
    /* Every field on the receipt except the key material is authenticated, including the runtime attestation digest when present. Reconstructing
       the envelope field-by-field would silently excuse any field added at
       signing time but not listed here; stripping the two verification
       artifacts keeps the signature coverage total. */
    const { publicKey, signature, ...envelope } = r;
    if (!this._verify(DOMAIN_TRACE, envelope, publicKey, signature))
      return { ok: false, reason: "signature does not verify over the envelope" };
    if (graph) {
      /* no fallback to r.at: the signing time must come from the trace body
         (inside the signed digest) or from the verifier. A receipt-supplied
         time is the signer's claim about themselves. */
      const when = asOf || trace.finished || trace.at;
      if (!when) return { ok: false, reason: "trace carries no timestamp, signing time cannot be established, so key validity cannot be checked" };
      const status = graph.keyStatus
        ? graph.keyStatus(r.signer, r.publicKey, { asOf: when })
        : { active: graph.hasKey?.(r.signer, r.publicKey, { asOf: when }) ?? false, compromised: false };
      if (status.compromised)
        return { ok: false, reason: `key compromised, this key is revoked retroactively from before the signing time; signatures made with it are suspect` };
      if (!status.active)
        return { ok: false, reason: `key is not registered to ${r.signer} at signing time, signed, but not by a key the graph vouches for` };
      return { ok: true, signer: r.signer, pinned: true };
    }
    return { ok: true, signer: r.signer, pinned: false };
  }

  static verifyHeadReceipt(receipt, { journal = null, graph = null } = {}) {
    const { publicKey, signature, ...envelope } = receipt;
    if (envelope.alg !== "Ed25519") return { ok: false, reason: "unsupported algorithm" };
    if (!this._verify(DOMAIN_HEAD, envelope, publicKey, signature))
      return { ok: false, reason: "signature does not verify over the envelope" };
    if (journal) {
      const v = journal.verify();
      if (!v.ok) return { ok: false, reason: `chain does not verify, ${v.reason} at ${v.at}` };
      if (v.head !== envelope.head) return { ok: false, reason: "receipt head does not match the journal head" };
    }
    if (graph) {
      const pin = graph.hasKey ? graph.hasKey(envelope.signer, publicKey, { asOf: envelope.at }) : false;
      if (!pin) return { ok: false, reason: `key is not registered to ${envelope.signer} at signing time` };
      return { ok: true, signer: envelope.signer, head: envelope.head, pinned: true };
    }
    return { ok: true, signer: envelope.signer, head: envelope.head, pinned: false };
  }
}
