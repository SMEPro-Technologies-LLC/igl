# Changelog

All notable changes to IGL are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[SemVer](https://semver.org/).

## [1.3.1] — 2026-10-14

### Security

- Internal errors no longer echo their message to the caller (CodeQL
  js/stack-trace-exposure). Governed refusals (`IGL_*` codes) and 4xx errors
  are returned verbatim; anything else is logged server-side with its stack
  and reported as `internal error` (`clientError` in `provision/auth.mjs`,
  used by both the HTTP and MCP surfaces; regression test added)

## [1.3.0] — 2026-10-14

Security release. Closes findings F-01 to F-04 of the October 2026 audit
(`docs/audit/SECURITY-AUDIT-2026-10.md`) and clears every open dependency
advisory. The runtime API grows; nothing that passed before stops passing,
but the provisioning service now refuses the unsafe defaults it used to accept.

### Security

- **F-01** Provisioning service binds `127.0.0.1` by default; `PROVISION_PUBLIC=1`
  requires `PROVISION_API_KEY` or the process refuses to start. Credentials are
  read from `Authorization: Bearer` / `X-IGL-Caller-Key` only — a key in the
  query string is ignored. Per-principal token-bucket rate limiting and an
  inference concurrency cap (`provision/auth.mjs`)
- **F-02** Every caller resolves to a stable `{ tenant, principal }`; graphs are
  stored and listed per tenant under a hashed id (`provision/registry.mjs`), so
  callers see only their own graphs and equal display names never share a
  journal. The service key is the only admin
- **F-03** Authority events (`grant`, `revoke`, `bindKey`, `revokeKey`) must be
  Ed25519-signed by a registered grantor (`DOMAIN_GRANT`); unsigned or unknown
  signatures raise `IGL_UNKNOWN_GRANTOR` / `IGL_UNVERIFIED_GRANT`, and replay
  re-verifies the whole journal. The provisioner's governance key persists on
  disk (`provision/keys.mjs`, mode 0600) instead of being minted per run; the
  company template no longer seeds a jurisdiction-wide grant
- **F-04** Attestation classes `ai` / `service` / `human` are recorded in the
  trace. `human` requires an `Approval` envelope (`DOMAIN_APPROVAL`) from a
  registered public-only key, bound to the statement subject; a program cannot
  obtain it by naming a signer (`IGL_APPROVAL_REQUIRED`, `IGL_BAD_APPROVAL`,
  `IGL_SELF_APPROVAL`). Receipts in the service are verified pinned to the graph
- Dependencies: `adm-zip 0.6.1`, `sharp 0.35.5`, `global-agent 4.x`,
  `onnxruntime-node 1.30`, `@huggingface/transformers 4.3.1`;
  `npm audit --omit=dev` reports 0 vulnerabilities and CI fails on any high

### Added

- `test/security.test.js` — 16 regression tests for F-01 to F-04, part of `npm test`
- `spec/openapi.yaml` — the public OpenAPI 3.1 contract (0.2.0) for the IGL
  Governed Identity Platform at id-me.ai, linted in CI; 0.1.0 kept alongside
- `docs/PLATFORM.md` (runtime ↔ platform mapping, MCP → REST table),
  `docs/adr/` (0001–0003), `docs/audit/` (the audit and its executable probes)
- Project files: `SUPPORT.md`, `GOVERNANCE.md`, `MAINTAINERS.md`,
  `CITATION.cff`, `.editorconfig`, `.nvmrc`, `CODEOWNERS`, Dependabot, issue
  and pull request templates
- Workflows: Node 20/22 test matrix with `npm audit`, contract lint, DCO check,
  CodeQL, dependency review, OpenSSF Scorecard, tag-triggered release with
  checksums and npm provenance
- `GraphRuntime` API: `grantors` option, `grantSigned` / `revokeSigned` /
  `bindKeySigned`, `authorityEnvelope`; `Signer` API: `toPem` / `fromPem` /
  `publicOnly`, `signGrant` / `verifyGrant`, `approvalEnvelope` / `approve` /
  `verifyApproval`; interpreter `runtimeSigner` option; `check()` accepts
  `inputs` so bound inputs such as `@Approval` type-check

### Changed

- A key the *service* holds now yields attestation class `service`, not
  `human` (one existing test updated to match)
- MCP server reports version 0.3.0; tools are scoped by the caller's tenant
- README, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `NOTICE`,
  `TRADEMARK.md` realigned with the platform; placeholder contacts replaced
  with security@ / conduct@ / trademarks@id-me.ai
- `Dockerfile.provision` no longer copies a directory that does not exist

## [1.2.1] — 2026-08-18

Dependency security release. No behavioral change.

### Security

- Migrated the model runtime dependency from the unmaintained
  `@xenova/transformers` to `@huggingface/transformers` (v3 line), resolving
  the Dependabot-flagged critical/high transitive vulnerabilities
  (protobufjs, onnxruntime-web)
- Added npm `overrides` pinning `sharp@^0.35.3` (libvips CVEs) and
  `adm-zip@^0.6.0` (zip-bomb DoS) past the vulnerable ranges still permitted
  by upstream. `npm audit` on a clean install reports **0 vulnerabilities**

### Changed

- Tokenizer vocabulary is now derived via `tokenizer.get_vocab()` (inverted
  to an id→string array) and model forward passes carry explicit
  `attention_mask` / `position_ids` — both required by the v3 runtime API.
  Verified after migration: 131/131 tests, the live governed decode example
  (Hilcorp boundary commits + `IGL_FOOTPRINT_DENIED` refusal), and the
  provisioning service boot

## [1.2.0] — 2026-08-18

Clean-clone audit release. Every command in the README quick start now runs
from a fresh clone with no paths outside the repository.

### Added

- **`src/decode.js`** — the per-token governed decode primitive promoted into
  the language core: `governedStep`, `governedDecode`,
  `governanceLogitsProcessor`, `sealDecodeTrace`, `verifyDecode`, `softmax`,
  `entropy`. FUSE is applied inside the decode loop at every step; prohibited
  tokens carry zero mass and can never be emitted. Sealed per-token traces
  recompute independently of the runtime that produced them
- `sha256` / `canonical` are now exported from `src/sign.js`
- `test/decode.test.js` — 7 tests covering the decode primitive (support
  restriction, zero partition, graded ceilings, end-to-end governed decode,
  tampered-trace rejection)

### Fixed

- Examples and the provisioning service imported `governedStep` and hash
  helpers from a legacy `igl-v1/` path that was never shipped — every example
  and `npm run provision` broke on a clean clone. All imports now resolve
  inside the repository
- `live-identity-decode.mjs` adapted to the current `Signer` receipt API
  (`receiptForTrace` / `verifyTraceReceipt`)
- Example program reference corrected to `jordan-avery-dfir-footprint.igl`

### Verified from a clean clone

- 131/131 tests; all four examples run; the provision service boots and
  answers the MCP handshake

## [1.1.0] — 2026-08-18

Audit strengthening, informed by a comparative review of MCP security
frameworks.

### Added

- **Merkle inclusion proofs on the journal** (`store.js`): `merkleRoot()`,
  `inclusionProof(seq)`, and `verifyInclusion()` let an auditor verify a
  single disclosed entry against a published root **without access to the
  rest of the chain** — privacy-preserving audit on top of the linear hash
  chain
- **Runtime attestation in receipts** (`sign.js`): every trace and head
  receipt carries `runtime`, a SHA-256 digest of the runtime's own source
  manifest, inside the signed envelope. Which governed build produced a
  receipt is settled by re-computation, not confidence
- Receipt envelope verification now strips only the key material and
  signature — every other field is authenticated, present or future

### Compatibility

- Receipts signed by 1.0.0 (envelope without `runtime`) still verify

### Tests

- 124/124 (12 new: Merkle determinism, per-entry inclusion, odd-length
  chains, foreign-root and tampered-leaf rejection, disk round trip,
  attestation coverage, forgery rejection, pre-attestation compatibility)

## [1.0.0] — 2026-08-17

First public release.

### Language core (`src/`)

- Lexer, parser, and static checker for the IGL language
- Interpreter with governed execution: identity, boundary, intent, and trace
  bound into every computation
- Identity graph runtime — BOUNDARY graphs (companies) and FOOTPRINT graphs
  (individuals) folded from hash-chained journal events
- Append-only journal (`store.js`) with tamper-evident hash chaining and
  deterministic replay; refuses to load a tampered chain
- Signed receipts (`sign.js`) with digest-bound verification
- Governed decode bridge (`bridge.js`) — the model computes inside the
  compiled footprint mask; boundary violations are refusals, not errors

### Provisioning service (`provision/`)

- HTTP service: provision identity graphs from natural-language descriptions
- MCP endpoint for AI client connections (ChatGPT developer-mode connectors)
- Caller recognition (`whoami`): the caller key binds the session to the
  caller's own graph — first contact seeds, every contact after replays
- Deterministic natural-language → attribute resolver
- Governed AI decode via `@xenova/transformers` (distilgpt2 reference model,
  pluggable)
- OpenAPI specification and CLI
- Dockerfile for the provisioning service

### Tests

- 112-test suite across six files: bridge, extract, graph, igl, sign, store

[1.0.0]: https://github.com/SMEPro-Technologies-LLC/igl/releases/tag/v1.0.0
