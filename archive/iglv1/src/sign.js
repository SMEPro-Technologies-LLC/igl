// SPDX-License-Identifier: Apache-2.0
/* IGL v1.0 reference runtime - Governance Receipt signing and verification.
   Section 3.05: the receipt binds identity, constraint digest, trace reference,
   program hash, graph version, and outcome, with a signature over all preceding
   fields under the Approved Signature Algorithm (Section 1.01). Ed25519 here. */

import { generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, createHash } from "node:crypto";

export const sha256 = s => createHash("sha256").update(typeof s === "string" ? s : canonical(s)).digest("hex");

/* Canonical, sorted-key JSON so equivalent structures digest identically. */
export function canonical(x) {
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  if (x && typeof x === "object")
    return "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}";
  return JSON.stringify(x);
}

export const DOMAIN_RECEIPT = "IGL-v1.0-RECEIPT:";

export class Signer {
  constructor({ id, privateKey, publicKey }) { Object.assign(this, { id, privateKey, publicKey }); }
  static generate(id) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    return new Signer({ id, privateKey, publicKey });
  }
  pub() { return this.publicKey.export({ type: "spki", format: "der" }).toString("base64"); }

  /* Sign the ordered receipt fields (everything except the signature itself). */
  signReceipt(fields) {
    const payload = DOMAIN_RECEIPT + canonical(fields);
    const signature = edSign(null, Buffer.from(payload, "utf8"), this.privateKey).toString("base64");
    return { ...fields, publicKey: this.pub(), algorithm: "Ed25519", signature };
  }

  /* Standalone verification: recompute the payload and check the signature.
     A deployment publishes the public key to its key directory (Section 1.01),
     so a third party holding only the receipt and that key can verify. */
  static verifyReceipt(receipt, { publicKeyB64 = null } = {}) {
    try {
      const { signature, publicKey, algorithm, ...fields } = receipt;
      if (algorithm !== "Ed25519") return { ok: false, reason: "unsupported algorithm" };
      const key = publicKeyB64 || publicKey;
      if (!key) return { ok: false, reason: "no public key available to verify against" };
      const payload = DOMAIN_RECEIPT + canonical(fields);
      const ok = edVerify(null, Buffer.from(payload, "utf8"),
        createPublicKey({ key: Buffer.from(key, "base64"), format: "der", type: "spki" }),
        Buffer.from(signature, "base64"));
      return ok ? { ok: true, signer: fields.boundIdentity, outcome: fields.outcome }
                : { ok: false, reason: "signature does not verify over the receipt fields" };
    } catch (e) { return { ok: false, reason: "verification error: " + e.message }; }
  }
}
