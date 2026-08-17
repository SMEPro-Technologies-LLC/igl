/* Provisioning service — the intelligence orchestration path behind the
   studio console's Provision button.

   description ──► deterministic attribute resolution (pre-inference)
                ──► graph fold (grants/observations append to the actor's
                    hash-chained FileJournal — one-time boot, replay after)
                ──► orchestration GENERATES the .igl program (IGL is the
                    native language emitted from the computed matrix)
                ──► governed execution with the real model inside the
                    compiled mask (z′ = z + ln(wᵢ))
                ──► receipt verification + footprint digest + journal head

   The service keeps the tokenizer/model warm across requests. */

import { AutoTokenizer, AutoModelForCausalLM } from "@xenova/transformers";
import { FileJournal } from "../src/store.js";
import { Signer as TraceSigner } from "../src/sign.js";
import { sha256, canonical } from "../igl-v1/src/sign.js";
import { makeGovernedGenerate } from "./governed-ai.mjs";
import { buildBoundaryGraph, buildFootprintGraph } from "./graph-builder.mjs";
import { resolveDescription, slugify } from "./resolver.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
/* Container deployments set IGL_DATA_DIR to a persistent volume so the
   hash-chained journals and generated programs survive pod restarts.
   Local dev keeps the in-repo layout. */
const DATA_ROOT = process.env.IGL_DATA_DIR || ROOT;
const ARTIFACTS = path.join(DATA_ROOT, "artifacts", "provisioned");
const PROGRAMS = path.join(DATA_ROOT, "programs", "provisioned");
fs.mkdirSync(ARTIFACTS, { recursive: true });
fs.mkdirSync(PROGRAMS, { recursive: true });

const MODEL_ID = "Xenova/distilgpt2";
const MODELS = { "distilgpt2-local": { version: "Xenova/distilgpt2@onnx-q8" } };

let runtime = null;
export async function warmRuntime(log = console.log) {
  if (runtime) return runtime;
  log(`[provision] loading ${MODEL_ID}…`);
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
  const model = await AutoModelForCausalLM.from_pretrained(MODEL_ID);
  const tok = { encode: (s) => tokenizer.encode(s) };
  const governedGenerate = makeGovernedGenerate({ tokenizer, model });
  runtime = { tokenizer, model, tok, governedGenerate, vocabSize: tokenizer.model.vocab.length };
  log(`[provision] model ready — vocab ${runtime.vocabSize}`);
  return runtime;
}

/* Authority-relevant state only — weights decay with wall-clock and `last`
   is an event timestamp; neither changes what an actor may do. */
export function stableFootprint(fp) {
  const strip = (layer) =>
    Object.fromEntries(Object.entries(layer).map(([d, es]) => [d, es.map((e) => ({ value: e.value, count: e.count, anchored: e.anchored }))]));
  return {
    actor: fp.actor, roles: fp.roles, granted: fp.granted,
    observed: { governing: strip(fp.observed.governing), proposed: strip(fp.observed.proposed) },
  };
}

export async function provisionIdentity({ description = "", kind = null, auto = false }) {
  const rt = await warmRuntime();
  const resolved = resolveDescription(description, { kind, auto });
  const slug = slugify(resolved.name);
  const journalPath = path.join(ARTIFACTS, `${slug}.jsonl`);
  const boot = fs.existsSync(journalPath) ? "replay" : "seed";

  const journal = new FileJournal(journalPath); // refuses a tampered chain
  const chainCheck = journal.verify();
  if (!chainCheck.ok) throw new Error(`journal for ${slug} failed chain verification — refusing to provision on top of tampered state`);

  const buildArgs = { resolved, journal, seeded: boot === "seed", tok: rt.tok, models: MODELS, governedGenerate: rt.governedGenerate };
  const { graph, interp, program } = resolved.kind === "BOUNDARY" ? buildBoundaryGraph(buildArgs) : buildFootprintGraph(buildArgs);

  const programPath = path.join(PROGRAMS, `${slug}.igl`);
  fs.writeFileSync(programPath, program);

  const run = await interp.run(program);

  const fp = graph.footprint(resolved.actor);
  const footprintDigest = sha256(canonical(stableFootprint(fp)));
  const head = journal.verify();

  // Receipt: verify the filing/attested trace straight from the chain.
  const attested = journal.entries("trace").map((e) => e.body).find((t) => t.receipt);
  const receiptVerification = attested ? TraceSigner.verifyTraceReceipt(attested) : null;

  const out = {
    slug,
    boot,                          // "seed" on first provision, "replay" thereafter
    kind: resolved.kind,
    actor: resolved.actor,
    period: resolved.period,
    programPath: path.relative(ROOT, programPath),
    programSource: program,
    journalPath: path.relative(ROOT, journalPath),
    journal: { length: head.length, ok: head.ok, head: head.head },
    footprintDigest,
    results: run.results.map((r) => ({
      status: r.status,
      traceId: r.traceId,
      intent: r.trace?.intent ?? null,
      error: r.error ? { code: r.error.code, message: r.error.message.slice(0, 200) } : null,
      projections: (r.trace?.assertions ?? []).flatMap((a) =>
        (a.projections ?? []).map((p) => ({ slot: p.slot, emitted: p.emitted, value: p.value, how: p.how }))),
    })),
    receiptVerification,
    provisionedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(ARTIFACTS, `${slug}.run.json`), JSON.stringify(out, null, 2));
  return { resolved, runtime: out };
}

export function listProvisioned() {
  return fs.readdirSync(ARTIFACTS)
    .filter((f) => f.endsWith(".run.json"))
    .map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(ARTIFACTS, f), "utf8")); }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.provisionedAt.localeCompare(a.provisionedAt));
}

/* Recognition: resolve the caller's identity to THEIR graph. First contact
   seeds the graph from the stored profile (one-time boot); every contact
   after that replays the existing hash-chained journal — the graph answers
   instantly because it already exists. */
export async function whoAmI(identity) {
  const { resolved, runtime } = await provisionIdentity({
    description: identity.description,
    kind: identity.kind,
  });
  return {
    recognized: true,
    identity: { name: identity.name, actor: identity.actor, kind: identity.kind },
    firstContact: runtime.boot === "seed",
    graph: {
      slug: runtime.slug,
      boot: runtime.boot,
      journal: runtime.journal,
      footprintDigest: runtime.footprintDigest,
      results: runtime.results,
      receiptVerification: runtime.receiptVerification,
    },
    resolvedAttributes: resolved.attributes,
  };
}
