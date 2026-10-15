/* Ed25519 receipts can be checked against the journal and tied to a key that
   the identity graph registered at signing time.

   The signature covers the full envelope. Verification can check that the
   signer's key was registered at signing time. Separate prefixes prevent a
   trace signature from being reused as a journal-head signature. */

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
   Each receipt includes a SHA-256 digest of the runtime's source files. The
   digest is calculated from a sorted file manifest once per process and is
   part of the signed envelope. It can be checked against a known build. A
   modified runtime produces a different digest, and changing the digest in a
   receipt invalidates its signature. */
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

  /* SPKI DER, base64: what travels inside a receipt and what the graph binds. */
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

  /* ---- trace receipt: the envelope is signed, not the bare digest ----
     An undated trace is refused: the signing-time check in verification
     anchors on the trace's own timestamp (inside the signed digest), and a
     Using the receipt's `at` would let the signer claim an earlier time after
     a key was revoked. Require a timestamp on the trace to prevent this. */
  receiptForTrace(trace) {
    if (!trace.finished && !trace.at)
      throw new Error("refusing to sign an undated trace: verification anchors on the trace timestamp, which must sit inside the signed digest");
    const body = { ...trace }; delete body.receipt;
    const envelope = {
      traceDigest: sha256(canonical(body)),
      signer: this.id, alg: "Ed25519", at: new Date().toISOString(),
      runtime: runtimeDigest(),
    };
    return { ...envelope, publicKey: this.pub(), signature: this._sign(DOMAIN_TRACE, envelope) };
  }

  /* ---- head receipt: metadata cannot replace the verified head ---- */
  headReceipt(journal, meta = {}) {
    const v = journal.verify();
    if (!v.ok) throw new Error(`refusing to sign a broken chain: ${v.reason} at ${v.at}`);
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
     field: the trace body would have to lie too, and the digest covers it. */
  static verifyTraceReceipt(trace, { graph = null, asOf = null } = {}) {
    const r = trace?.receipt;
    if (!r || r.alg !== "Ed25519") return { ok: false, reason: "no Ed25519 receipt on this trace" };
    const body = { ...trace }; delete body.receipt;
    const digest = sha256(canonical(body));
    if (digest !== r.traceDigest) return { ok: false, reason: "trace does not reproduce the signed digest" };
    /* The signature authenticates every receipt field except the public key
       and signature, including the runtime digest when present. Verify the
       envelope as a whole so newly added fields are covered too. */
    const { publicKey, signature, ...envelope } = r;
    if (!this._verify(DOMAIN_TRACE, envelope, publicKey, signature))
      return { ok: false, reason: "signature does not verify over the envelope" };
    if (graph) {
      /* no fallback to r.at: the signing time must come from the trace body
         (inside the signed digest) or from the verifier. A receipt-supplied
         time is the signer's claim about themselves. */
      const when = asOf || trace.finished || trace.at;
      if (!when) return { ok: false, reason: "trace carries no timestamp: signing time cannot be established, so key validity cannot be checked" };
      const status = graph.keyStatus
        ? graph.keyStatus(r.signer, r.publicKey, { asOf: when })
        : { active: graph.hasKey?.(r.signer, r.publicKey, { asOf: when }) ?? false, compromised: false };
      if (status.compromised)
        return { ok: false, reason: `key compromised: this key is revoked retroactively from before the signing time; signatures made with it are suspect` };
      if (!status.active)
        return { ok: false, reason: `key is not registered to ${r.signer} at signing time: signed, but not by a key the graph vouches for` };
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
      if (!v.ok) return { ok: false, reason: `chain does not verify: ${v.reason} at ${v.at}` };
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
