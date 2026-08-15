# ADR 0001: Canonical governance model, runtime, authority, and keys

Status: accepted. Date: 2026-08-13.

## Context

The repository carries more than one governance implementation, and they do not
agree. Verified against the live service on 2026-08-13:

- `udm.igl.dev/health` = `{ service: d1-igl, database: udmcore, tables: 18 }`.
- `GET /udm/matrix/get?jurisdiction=US-TX&agency=RRC` returns a graded numeric
  matrix (cells: path_id, category, value in [0,1]), a version, and a
  service-computed SHA-256 digest (`1252a4e5...`). EU/EDPB is the same shape.

The repo also contains `igl-core` (the deployed service, ~29 tests), `igl-v1`
(the reference runtime, 74 tests), `workers/igl-api` (the surface), `src/d1.js`
(binds a different ~100-table console DB, not deployed), and `src/determination.js`
(an entailment model from the IG_Schema sheets, not deployed). `point-of-inflection.md`
("ground truth") already states probability-space FUSE, the zero-partition guard,
and that fractional weights are steering pressure while ceilings are the boundary
check's job. `architecture.md` already draws `igl-api -> GET /udm/matrix/get ->
d1-igl` with "verify digest, stage constraints".

## Decision

**1. Canonical runtime.** `d1-igl` is the governance authority. `workers/igl-api`
is the execution surface that binds to it. `igl-v1` is the reference and
conformance implementation, not a separate production runtime; it must bind to the
live service through `src/udm.js`, not run its stand-in in production. One
authority, one surface, one reference.

**2. Canonical governance source.** The deployed graded matrix served by
`udm.igl.dev` is the live source, at `GET /udm/matrix/get`. Stated plainly:
`src/d1.js` (100-table console DB) and `src/determination.js` (entailment) are NOT
the live path. They are a newer design, retained but parked; migrating the deployed
service to entailment is a future ADR.

**3. Authority policy. DECIDED (2026-08-13).** The question was INHERITS_FROM
raise-to-max versus delegation min-clamping, which give different results. The
decision, chosen for least privilege, keeps both mechanisms with distinct rules:
INHERITS_FROM raises an identity's effective authority to the max along its
inheritance chain (structural, depth-bounded to 8), and DELEGATE TO runs a
delegated FUSE at the target's own DECLARED authority, clamped so a delegation
edge can never borrow the target's inherited elevation. The two rules only diverge
when a delegated target itself inherits higher, and that divergence is the case
that a raise-to-max reading would have let escalate. Encoded in
`src/iosplus.js` (`AUTHORITY_POLICY`, `effectiveDelegatedAuthority`) and
`src/interpreter.js` (the delegation branch of `evalFuse`), with both sample paths
plus the divergence tested in `test/authority.mjs`. This also closed a real gap:
the prior delegation branch bypassed the authority floor and handed the delegatee
the target's full inherited authority.

**4. Key persistence.** DEPLOY.md 7.1. Production receipts MUST be signed by a
persistent key (`Signer.fromSeed`, seeded from a KMS or secret), public key
published to a directory. The Worker and run scripts already do this. `IOSPlus`'s
per-instance `Signer.generate()` is test-only and must not be used on the live
path; a receipt whose key died with its process undercuts the digest binding.

**5. Receipt integrity.** A governed receipt's `constraintMatrixDigest` must equal
the service-published digest for the matrix used, and must carry
`provenance.digestSource` (`live` or `fixture`) so a committed artifact is
self-describing. A receipt with `fixture` provenance is not a live governed receipt.

## Guardrails adopted with this ADR

- Tests are hermetic: pinned fixtures with the real digests, never a live fetch,
  so CI never goes red for a Worker blip.
- Drift is caught separately: a scheduled workflow fetches the live matrices and
  asserts their digests still equal the pinned fixtures, failing loudly and outside
  the PR-blocking suite.
- Continuous binding: the same scheduled workflow now also produces a fresh receipt
  from a real wire fetch and verifies it, and uploads it as a build artifact. The
  live binding is proven every day on GitHub's runners, not just once.

## Reconciliation state (executed 2026-08-13)

- The one live-bound execution path in this repo is `src/govern.js` over
  `src/udm.js`, exposed by `src/worker.js`. It fetches the deployed matrix, applies
  FUSE then the graded boundary check, and seals a receipt bound to the service
  digest. This is the surface that governs, and it does not touch `src/d1.js` or
  `src/determination.js`.
- `src/d1.js` (100-table console DB) and `src/determination.js` (entailment) remain
  parked and NON-CANONICAL, kept for the future-design ADR, off the live path. Their
  file headers say so.
- The `igl-v1` interpreter is the language reference. Its FUSE runs over the token
  vocabulary of Section 12.03, which is deliberately distinct from the deployed
  matrix's reasoning-path vocabulary; binding the interpreter to the live matrix is
  a vocabulary-crosswalk design item, not a switch, and is not claimed as done.

## Consequences

- The live digest match is a committed, provenance-stamped artifact
  (`artifacts/receipt.live.json`, refreshed by a successful live `run-govern.mjs`
  and by the daily workflow), third-party checkable.
- The authority decision (item 3) is made and tested, so it no longer blocks an
  external audit. Key persistence (item 4) remains the standing production
  requirement: move the signing seed to a KMS or Worker secret and publish the key.
- The `workers/igl-api` surface is now packaged in-repo (deploy entry +
  `wrangler.toml`, proven by `test/worker.mjs`). One infrastructure step remains
  outside this repo: running its three-command deploy on the Cloudflare account so
  the live-bound path answers real traffic.
