# ADR 0001 — Canonical governance model, runtime, authority, and keys

Status: accepted. Date: 2026-08-13. §3 resolved by ADR 0002 (2026-08-14).

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

**3. Authority policy.** DECIDED in ADR 0002: authority composes by intersection
(MIN), inheritance never amplifies, explicit delegation switches the acting
identity. Encoded in `IOSPlus.resolveAuthority`, tested in `test/suite.mjs` §K.

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

## Consequences

- The runtime stops governing against the stand-in or the 100-table DB once the
  surface's FUSE path is switched to `src/udm.js`.
- The live digest match becomes a committed, provenance-stamped artifact
  (`out/receipt.live.json` from `run-govern.mjs`), third-party checkable.
- Authority and key-persistence decisions are the gate to an external audit.
