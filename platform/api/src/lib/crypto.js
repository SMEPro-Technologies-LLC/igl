/* Hashing and Ed25519 signatures for the platform service.

   canonical() and sha256() are the same functions as src/store.js and
   src/sign.js in the runtime, so a chain or a receipt produced here can be
   verified by the runtime's own code, or by anyone with a SHA-256 and an
   Ed25519 library. Runs under Cloudflare Workers with nodejs_compat. */

import { createHash, createHmac, generateKeyPairSync, createPrivateKey, createPublicKey, sign as edSign, verify as edVerify, randomBytes, timingSafeEqual } from "node:crypto";

export const DOMAIN_RECEIPT = "IGL-RECEIPT-v0.2:";
export const DOMAIN_TOKEN = "IGL-TOKEN-v0.2:";
export const GENESIS = "0".repeat(64);

/* API keys are stored as sha256(secret). That is deliberate: a key is 40
   characters of random base64url (about 240 bits of entropy), not a password
   a person chose, so a slow password hash buys nothing and would cost every
   request a key-derivation round. Passwords are never stored by this service. */
export const sha256 = (s) => createHash("sha256").update(s).digest("hex");
export const hmacHex = (secret, s) => createHmac("sha256", secret).update(s).digest("hex");

export function canonical(x) {
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  if (x && typeof x === "object")
    return "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}";
  return JSON.stringify(x === undefined ? null : x);
}

export function randomToken(bytes = 24) { return randomBytes(bytes).toString("base64url"); }

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export class ServiceSigner {
  constructor({ id, privateKey, publicKey }) { this.id = id; this.privateKey = privateKey; this.publicKey = publicKey; }
  static generate(id) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    return new ServiceSigner({ id, privateKey, publicKey });
  }
  static fromPem(id, pem) {
    const privateKey = createPrivateKey(pem);
    return new ServiceSigner({ id, privateKey, publicKey: createPublicKey(privateKey) });
  }
  toPem() { return this.privateKey.export({ type: "pkcs8", format: "pem" }); }
  pub() { return this.publicKey.export({ type: "spki", format: "der" }).toString("base64"); }
  /* JWK form of the public key, for /.well-known/jwks.json. Raw Ed25519 key
     is the last 32 bytes of the SPKI DER. */
  jwk() {
    const der = this.publicKey.export({ type: "spki", format: "der" });
    return { kty: "OKP", crv: "Ed25519", kid: this.id, alg: "EdDSA", use: "sig", x: Buffer.from(der.subarray(der.length - 32)).toString("base64url") };
  }
  sign(domain, payload) {
    return edSign(null, Buffer.from(domain + canonical(payload), "utf8"), this.privateKey).toString("base64");
  }
  signRaw(bytes) { return edSign(null, bytes, this.privateKey); }
  static verify(domain, payload, publicKeyB64, signatureB64) {
    try {
      return edVerify(null, Buffer.from(domain + canonical(payload), "utf8"),
        createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" }),
        Buffer.from(signatureB64, "base64"));
    } catch { return false; }
  }
  verifyRaw(bytes, sig) { try { return edVerify(null, bytes, this.publicKey, sig); } catch { return false; } }
}

/* Load the service signer from the SIGNING_KEY_PEM secret, or create one once
   and keep it in the settings table so receipts stay attributable across
   deploys. Rotate by setting the secret; the old key stays verifiable through
   the receipt's embedded public key. */
export async function loadSigner(env, db) {
  const id = env.SIGNER_ID || `igl-${env.IGL_ENV || "production"}`;
  if (env.SIGNING_KEY_PEM) return ServiceSigner.fromPem(id, env.SIGNING_KEY_PEM);
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'signing_key_pem'").first();
  if (row) return ServiceSigner.fromPem(id, row.value);
  const s = ServiceSigner.generate(id);
  await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('signing_key_pem', ?1)").bind(s.toPem()).run();
  const again = await db.prepare("SELECT value FROM settings WHERE key = 'signing_key_pem'").first();
  return ServiceSigner.fromPem(id, again.value);
}
