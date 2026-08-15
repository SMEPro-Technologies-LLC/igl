# GTM and production readiness: recap and what remains

Honest status as of 2026-08-13. This separates what is built and checkable from
what still has to happen before IGL can be called production and go-to-market
ready. A long remaining list on a young system is normal. The point is that the
list is real, and nothing here is claimed as done that is not.

## What is built and green

These run in the reference tree (igl-v1) and are landed on main, with CI green on
GitHub's runners.

- IGL v1.0 reference runtime: lexer, parser, static checker, interpreter, IOS+.
- Conformance to the five Schedule C sample programs.
- WellSite rebuilt as an IGL v1.0 program. It executes, and its receipt verifies.
- Adversarial suite covering tamper detection, fail-closed behavior, support
  restriction, delegation denial, and static rejection.
- Multi-vendor model layer (OpenAI, Anthropic, Gemini, xAI, Mistral, DeepSeek,
  Llama). Governance is identical across vendors in mock. Live behavior sits
  behind the vendor keys.
- Determination engine: the entailment model, the four-outcome resolution
  contract, and re-verifiable receipts. This is non-canonical per ADR 0001.
- Live service binding. `src/udm.js` and `src/govern.js` bind to the deployed
  `udm.igl.dev` matrix and its digest, with the boundary-ceiling check closed and
  tested against the real US-TX/RRC and EU/EDPB matrices as pinned fixtures.
- Persistent signing keys through `Signer.fromSeed`, so receipts verify across
  sessions and across machines.
- Authority policy decided and encoded: INHERITS_FROM raises to the max along the
  inheritance chain, DELEGATE TO runs at the target's declared authority with a
  least-privilege clamp. Both sample paths and the divergence are tested, and the
  change closed a real gap where delegation bypassed the authority floor.
- Deployed execution surface: the `igl-api` Cloudflare Worker, live and governing
  against the deployed matrix, with a receipt verified from a separate machine.
- Governed decoding: FUSE applied inside a real token-by-token decode loop
  (`src/decoder.js`), with the per-token cognitive trace sealed, signed, and
  recomputable. The model enters through one seam; a committed sample sits at
  `artifacts/decode-trace.sample.json`. The semantic crosswalk from UDM categories
  to a per-model vocabulary vector remains the roadmap item (see CLOSEOUT).
- About 108 checks green across ten test suites.

## The live digest receipt now exists

A governed receipt bound to the live matrix digest is committed at
`artifacts/receipt.live.json`. Its `constraintMatrixDigest` is the real
service-published digest for US-TX/RRC (`1252a4e5...`), its
`provenance.digestSource` is `live`, and the matrix was read off the wire from
`udm.igl.dev`. The artifact verifies from the file alone with
`node verify-governed.mjs`, which now defaults to that committed path so it works
on a fresh clone. `run-govern.mjs` refreshes this same artifact on any host that
can reach the service, and it only writes on a successful fetch, so an offline run
cannot clobber the committed receipt.

The binding is now also proven continuously. The scheduled workflow
(`.github/workflows/matrix-drift.yml`) runs daily on GitHub's runners, fetches the
live matrix off the wire, produces a fresh receipt bound to the service digest,
verifies it, and uploads it as a build artifact. A moved digest or a broken bind
fails that job loudly, outside the PR-blocking suite.

## What is NOT yet true (do not claim these)

- The live-bound surface is packaged and proven, but not yet published to your
  Cloudflare account. `workers/igl-api` now contains the deploy entry and a
  `wrangler.toml` with `nodejs_compat`. `test/worker.mjs` drives real
  Request/Response objects through that exact entry and shows govern binding the
  live digest, verify confirming the receipt, an over-ceiling case reported as
  HARD_VIOLATION, and health keyed. What remains is the three-command deploy in
  `workers/igl-api/README.md` (dry-run, `secret put`, `deploy`), which runs on your
  account and cannot run from this repo's CI.
- The interpreter's own FUSE runs over the Section 12.03 token vocabulary, which is
  distinct from the deployed matrix's reasoning-path vocabulary. Binding the
  interpreter directly to the live matrix is a vocabulary-crosswalk design item and
  is not claimed as done. The live-bound governance path is `govern.js`, not the
  interpreter.

## Remaining before production and GTM

### P0: correctness and truth of the core claims

1. Deploy the live-bound surface. The worker is packaged and proven end to end:
   `workers/igl-api` (entry + `wrangler.toml`), covered by `test/worker.mjs`. The
   only step left is running the three commands in `workers/igl-api/README.md` on
   the Cloudflare account: `wrangler deploy --dry-run` to build the bundle,
   `wrangler secret put IGL_SIGNING_SEED`, then `wrangler deploy`. That publishes
   the surface and is the last P0; it must run on your account, not in this repo.
2. Done. The live binding is now continuous: the daily workflow produces and
   verifies a fresh live-digest receipt on GitHub's runners and publishes it.
3. Done. The authority policy is decided, encoded, and tested (see the built-and-
   green section and ADR 0001 item 3).
4. Done in code and documented. The reconciliation is executed: one live-bound path
   (`govern.js`), the interpreter as the reference, `d1.js` and `determination.js`
   parked and non-canonical. See the reconciliation-state section of ADR 0001. The
   only open piece is the deploy in item 1.

### P1: assurance and operability

5. Key management. Move the signing seed to a KMS or a Worker secret, publish the
   public key to a key directory, and add rotation and revocation. The constant
   dev seed in `run-govern.mjs` is publicly derivable and must never sign a
   production receipt.
6. Independent security review of the crypto and the runtime, plus an external
   read of the written threat model in `docs/THREAT_MODEL.md`.
7. Scale and soak testing of the matrix fetch, the receipt chain, and the audit
   store at production trace volumes.
8. Real model integration behind the vendor seam for any AI rendering step, with
   the boundary check enforced on the generated output.

### P2: product and go-to-market

9. Compliance and evidentiary position by counsel per target jurisdiction: how a
   Governance Receipt is treated as evidence, along with data handling and
   retention.
10. SLAs, a runbook, monitoring, alerting, and backups for the deployed surface.
11. Licensing and ownership cleanup. The tree is still `UNLICENSED`, and the owner
    is named inconsistently across materials.
12. A bounded production pilot with a real filing and a real user, then GA.
13. Reconcile the public materials (whitepaper, site) to the deployed model, so the
    marketing describes the matrix-and-FUSE system that is actually live.

## The one-line GTM status

The runtime is a strong, tested reference with a live-bound governance path, a
closed boundary check, a decided and tested authority policy, and a live-digest
receipt that is verified from the file alone and re-proven daily on CI. The one
remaining P0 is infrastructure rather than code: deploying that path as the surface
that answers real traffic on the Cloudflare account. After that it is the normal
assurance, scale, and commercial work, with key management (KMS or Worker secret,
published key, rotation) as the first P1.
