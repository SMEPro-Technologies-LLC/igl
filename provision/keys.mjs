/* Persistent signing keys for the provisioning service (F-04).

   A key generated at process start attests nothing: it dies with the
   process, so no later verifier can attribute a receipt to anyone. Keys
   here live on disk (0600) under IGL_KEYS_DIR (default <data>/keys), are
   created once, and are loaded by id on every boot. Rotation is a new file
   plus a signed `keyrevoke` in the graph, not a restart. */

import fs from "node:fs";
import path from "node:path";
import { Signer } from "../src/sign.js";

export function loadOrCreateSigner(id, dir) {
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(id)) throw new Error(`signer id ${JSON.stringify(id)} is not a safe file name`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${id}.ed25519.pem`);
  if (fs.existsSync(file)) return { signer: Signer.fromPem(id, fs.readFileSync(file, "utf8")), created: false, file };
  const signer = Signer.generate(id);
  fs.writeFileSync(file, signer.toPem(), { mode: 0o600 });
  return { signer, created: true, file };
}
