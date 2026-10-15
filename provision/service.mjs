/* Provisioning service, the intelligence orchestration path behind the
   studio console's Provision button.

   description ──► deterministic attribute resolution (pre-inference)
                ──► graph fold (grants/observations append to the actor's
                    hash-chained FileJournal, one-time boot, replay after)
                ──► orchestration GENERATES the .igl program (IGL is the
                    native language emitted from the computed matrix)
                ──► governed execution with the real model inside the
                    compiled mask (z′ = z + ln(wᵢ))
                ──► receipt verification + footprint digest + journal head

   The service keeps the tokenizer/model warm across requests. */

import { loadPinnedModel, MODEL_ID } from "./model.mjs";
import { FileJournal } from "../src/store.js";
import { Signer as TraceSigner } from "../src/sign.js";
import { sha256, canonical } from "../src/sign.js";
import { makeGovernedGenerate } from "./governed-ai.mjs";
import { buildBoundaryGraph, buildFootprintGraph } from "./graph-builder.mjs";
import { resolveDescription, slugify } from "./resolver.mjs";
import { Registry, assertOwner } from "./registry.mjs";
import { loadOrCreateSigner } from "./keys.mjs";
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
const KEYS_DIR = process.env.IGL_KEYS_DIR || path.join(DATA_ROOT, "keys");
export const registry = new Registry(ARTIFACTS);

/* F-03 / F-04: one persistent governance signer per deployment. It signs
   the grants provisioning seeds (so a replayed graph can prove who widened
   authority) and countersigns traces. Because the SERVICE holds this key,
   attestations it makes are class `service`, never `human`. */
let governance = null;
export function governanceSigner() {
  if (!governance) governance = loadOrCreateSigner("smepro-governance-board", KEYS_DIR).signer;
  return governance;
}
export const GOVERNANCE_SIGNER_NAME = "SMEPro_Governance_Board";

/* The model is loaded at a pinned revision and its cached bytes are hashed;
   the version string in `models` names both (provision/model.mjs). */
let runtime = null;
export async function warmRuntime(log = console.log) {
  if (runtime) return runtime;
  const { tokenizer, model, provenance, models } = await loadPinnedModel({ log });
  const tok = { encode: (s) => tokenizer.encode(s) };
  const governedGenerate = makeGovernedGenerate({ tokenizer, model });
  runtime = { tokenizer, model, tok, governedGenerate, models, provenance, vocabSize: tokenizer.get_vocab().size };
  log(`[provision] model ready, ${MODEL_ID} ${provenance.version}, vocab ${runtime.vocabSize}`);
  return runtime;
}
export { MODEL_ID };
/* What the health endpoints report: the label, the pinned revision and,
   once loaded, the digest of the bytes. */
export function modelInfo() {
  return runtime ? { id: MODEL_ID, version: runtime.provenance.version, revision: runtime.provenance.revision, digest: runtime.provenance.digest, loaded: true }
                 : { id: MODEL_ID, loaded: false };
}

/* Authority-relevant state only, weights decay with wall-clock and `last`
   is an event timestamp; neither changes what an actor may do. */
export function stableFootprint(fp) {
  const strip = (layer) =>
    Object.fromEntries(Object.entries(layer).map(([d, es]) => [d, es.map((e) => ({ value: e.value, count: e.count, anchored: e.anchored }))]));
  return {
    actor: fp.actor, roles: fp.roles, granted: fp.granted,
    observed: { governing: strip(fp.observed.governing), proposed: strip(fp.observed.proposed) },
  };
}

export async function provisionIdentity({ description = "", kind = null, auto = false, owner }) {
  assertOwner(owner);                                   // F-02: no owner, no graph
  const rt = await warmRuntime();
  const resolved = resolveDescription(description, { kind, auto });
  const slug = slugify(resolved.name);
  const paths = registry.pathsFor(owner, slug);         // id-keyed, tenant-namespaced
  const journalPath = paths.journal;
  const boot = fs.existsSync(journalPath) ? "replay" : "seed";

  const signer = governanceSigner();
  const grantors = { [signer.id]: signer.pub() };
  const journal = new FileJournal(journalPath); // refuses a tampered chain
  const chainCheck = journal.verify();
  if (!chainCheck.ok) throw new Error(`journal for ${paths.id} failed chain verification, refusing to provision on top of tampered state`);

  const buildArgs = { resolved, journal, seeded: boot === "seed", tok: rt.tok, models: rt.models, governedGenerate: rt.governedGenerate, signer, grantors, signerName: GOVERNANCE_SIGNER_NAME };
  const { graph, interp, program } = resolved.kind === "BOUNDARY" ? buildBoundaryGraph(buildArgs) : buildFootprintGraph(buildArgs);

  const programPath = paths.program;
  fs.writeFileSync(programPath, program);

  const run = await interp.run(program);

  const fp = graph.footprint(resolved.actor);
  const footprintDigest = sha256(canonical(stableFootprint(fp)));
  const head = journal.verify();

  // Receipt: verify the attested trace straight from the chain, PINNED to the
  // key the graph bound to the signer (F-04: pinned: true or it is not attribution).
  const attested = journal.entries("trace").map((e) => e.body).find((t) => t.receipt);
  const receiptVerification = attested ? TraceSigner.verifyTraceReceipt(attested, { graph }) : null;

  const out = {
    id: paths.id,
    owner: { tenant: owner.tenant, principal: owner.principal },
    slug,
    boot,                          // "seed" on first provision, "replay" thereafter
    kind: resolved.kind,
    actor: resolved.actor,
    period: resolved.period,
    programPath: path.relative(DATA_ROOT, programPath),
    programSource: program,
    journalPath: path.relative(DATA_ROOT, journalPath),
    attestation: attested ? attested.attestation : null,   // "service" for provisioning, the runtime holds the key
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
  fs.writeFileSync(paths.run, JSON.stringify(out, null, 2));
  return { resolved, runtime: out };
}

/* Reads are scoped to the authenticated principal; the service principal sees all. */
export function listProvisioned(auth) { return registry.list(auth); }
export function getProvisioned(auth, id) { return registry.get(auth, id); }
export function searchProvisioned(auth, q) { return registry.search(auth, q); }

/* Recognition: resolve the caller's identity to THEIR graph. First contact
   seeds the graph from the stored profile (one-time boot); every contact
   after that replays the existing hash-chained journal, the graph answers
   instantly because it already exists. */
export async function whoAmI(identity, owner) {
  const { resolved, runtime } = await provisionIdentity({
    description: identity.description,
    kind: identity.kind,
    owner,
  });
  return {
    recognized: true,
    identity: { name: identity.name, actor: identity.actor, kind: identity.kind },
    principal: owner.principal, tenant: owner.tenant,
    firstContact: runtime.boot === "seed",
    graph: {
      id: runtime.id,
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
