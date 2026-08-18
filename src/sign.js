/* Ed25519 receipts — tamper-evident → load-refusing → ATTRIBUTABLE,
   where attributable means pinned to a key the identity graph vouched for
   at the time of signing, not "signed by someone".

   rev 2, post-review:
     R1  the signature covers the full envelope {traceDigest, signer, alg, at},
         not the bare digest — signer and timestamp are authenticated fields,
         so neither name-swapping nor backdating survives verification.
     R2  verification accepts a graph: `signer` resolves to the key registered
         AT SIGNING TIME (rotation-safe), and an embedded key that does not
         match fails. Without a graph the result is explicit: pinned: false.
     R4  domain separation — trace and head signatures are computed under
         distinct prefixes, so a signature from one context can never be
         replayed into the other. And headReceipt nests caller meta so it can
         never override the verified chain head. */

import { generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, createHash } from "node:crypto";
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
   once per process. Not a trust score and not a self-report — the digest is
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

export class Signer {
  constructor({ id, privateKey, publicKey }) { Object.assign(this, { id, privateKey, publicKey }); }

  static generate(id) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    return new Signer({ id, privateKey, publicKey });
  }

  /* SPKI DER, base64 — what travels inside a receipt and what the graph binds. */
  pub() { return this.publicKey.export({ type: "spki", format: "der" }).toString("base64"); }

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
     fallback to the receipt's `at` would end somewhere the signer controls —
     a revoked key could claim an earlier signing time and nothing would
     contradict it. Refusing here makes the fallback unreachable rather
     than defended. */
  receiptForTrace(trace) {
    if (!trace.finished && !trace.at)
      throw new Error("refusing to sign an undated trace — verification anchors on the trace timestamp, which must sit inside the signed digest");
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
    if (!v.ok) throw new Error(`refusing to sign a broken chain — ${v.reason} at ${v.at}`);
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
     field — the trace body would have to lie too, and the digest covers it. */
  static verifyTraceReceipt(trace, { graph = null, asOf = null } = {}) {
    const r = trace?.receipt;
    if (!r || r.alg !== "Ed25519") return { ok: false, reason: "no Ed25519 receipt on this trace" };
    const body = { ...trace }; delete body.receipt;
    const digest = sha256(canonical(body));
    if (digest !== r.traceDigest) return { ok: false, reason: "trace does not reproduce the signed digest" };
    /* Every field on the receipt except the key material is authenticated —
       including the runtime attestation digest when present. Reconstructing
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
      if (!when) return { ok: false, reason: "trace carries no timestamp — signing time cannot be established, so key validity cannot be checked" };
      const status = graph.keyStatus
        ? graph.keyStatus(r.signer, r.publicKey, { asOf: when })
        : { active: graph.hasKey?.(r.signer, r.publicKey, { asOf: when }) ?? false, compromised: false };
      if (status.compromised)
        return { ok: false, reason: `key compromised — this key is revoked retroactively from before the signing time; signatures made with it are suspect` };
      if (!status.active)
        return { ok: false, reason: `key is not registered to ${r.signer} at signing time — signed, but not by a key the graph vouches for` };
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
      if (!v.ok) return { ok: false, reason: `chain does not verify — ${v.reason} at ${v.at}` };
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
