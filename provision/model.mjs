/* Model provenance (review §4). The runtime attests its own source; the
   model it reasons with has to be attested too, or "which bytes produced
   this inference" is a label rather than a fact.

   Two rules:
     The model is loaded at a PINNED revision (a commit on the Hub), never
     at a moving branch name. IGL_MODEL_REVISION overrides the pin.
     After loading, every cached file of that model is hashed and the
     manifest digest is recorded in the model version string the trace
     carries, so a trace names the bytes, not the label.

   IGL_MODEL_LOCAL_ONLY=1 refuses any network fetch: production hosts load
   from a pre-populated cache and fail closed if a file is missing. */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { AutoTokenizer, AutoModelForCausalLM, env } from "@huggingface/transformers";

export const MODEL_ID = "Xenova/distilgpt2";
/* Hub commit a41c104 of Xenova/distilgpt2, last modified 2025-07-26. */
export const MODEL_REVISION = process.env.IGL_MODEL_REVISION || "a41c10485c18a64b6606729b6a082330cbd8f49e";
export const MODEL_DTYPE = "q8";
export const MODEL_ALIAS = "distilgpt2-local";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/* Hash every file in the local cache for this model. Returns null when the
   cache does not hold the model yet. */
export function modelProvenance({ modelId = MODEL_ID, revision = MODEL_REVISION, cacheDir = env.cacheDir } = {}) {
  const dir = path.join(cacheDir, ...modelId.split("/"));
  if (!existsSync(dir)) return null;
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else files.push({ file: path.relative(dir, p).split(path.sep).join("/"), bytes: statSync(p).size, sha256: sha256(readFileSync(p)) });
    }
  };
  walk(dir);
  const digest = sha256(JSON.stringify(files));
  return { modelId, revision, dtype: MODEL_DTYPE, files, digest, version: `${modelId}@${revision.slice(0, 12)}#${digest.slice(0, 16)}` };
}

/** @param {{ log?: (message: string) => void }} [options] */
export async function loadPinnedModel({ log = () => {} } = {}) {
  const localOnly = process.env.IGL_MODEL_LOCAL_ONLY === "1";
  const opts = /** @type {any} */ ({ revision: MODEL_REVISION, local_files_only: localOnly, dtype: MODEL_DTYPE });
  log(`[model] loading ${MODEL_ID} at revision ${MODEL_REVISION.slice(0, 12)}${localOnly ? " from the local cache only" : ""}`);
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, opts);
  const model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, opts);
  const provenance = modelProvenance();
  if (!provenance) throw new Error(`model ${MODEL_ID} loaded but no cached files were found under ${env.cacheDir}; provenance cannot be recorded`);
  log(`[model] ${provenance.files.length} files, manifest ${provenance.digest.slice(0, 16)}`);
  /* The version string every AI assertion carries: label, pinned revision, bytes. */
  const models = { [MODEL_ALIAS]: { version: provenance.version, provenance: { modelId: provenance.modelId, revision: provenance.revision, dtype: provenance.dtype, digest: provenance.digest } } };
  return { tokenizer, model, provenance, models };
}
