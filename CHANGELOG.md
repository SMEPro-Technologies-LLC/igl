# Changelog

All notable changes to IGL are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[SemVer](https://semver.org/).

## [Unreleased]

### Added

- `igl/mcp`: `govern(client, options)` wraps any MCP client and
  `governHandler(handler, options)` any server-side `tools/call` handler, with
  no dependency on the MCP SDK. Each call is identified, bounded, intended and
  traced (receipt when a signer is configured) before it is forwarded;
  refusals and failed calls are journaled failures; only the argument digest
  enters the journal. Closes #59

## [1.7.0] (2026-10-17)

`npx igl demo`, the README that leads with it, and a release workflow that
ships assets and publishes to npm.

### Added

- `npx igl demo`: the runtime in ten seconds with no clone, no model and no
  network. An agent acts inside its boundary (committed, Ed25519 receipt),
  tries one step outside it (refused before execution, the refusal journaled),
  then the chain, a Merkle inclusion proof for the refusal and the signed head
  are verified, and an edited copy of the journal is refused. `npx igl verify
  <file>` checks a journal written by `FileJournal`. The package now declares
  `bin`, so the command works once it is published to npm; from a checkout it
  is `npm run demo`
- A CLI test (`test/cli.test.js`) runs the demo and the verifier in the suite

### Changed

- README: the first screen is the demo, the eight-line JavaScript equivalent
  and the primitives (`MemoryJournal`, `Signer`, the bridge) as plain exports;
  the long-form description follows
- Release workflow: the GitHub release is created as a draft with its assets
  (npm tarball, OpenAPI contract, checksums) and published afterwards, which
  is what immutable releases require; 1.6.0's assets had failed to attach.
  The npm publish step tested its own `env` in its `if`, which is never
  visible there, so publishing was skipped on every run; it now tests the
  secret

## [1.6.0] (2026-10-15)

Contract 0.3.0. The Subject service: the controls a person holds over what
is learned about them, the rules Ricorsa is built on, as platform operations.

### Added

- `GET` and `POST /identities/{id}/learning`: pause and resume learning about
  an identity. While paused, context, facts and relationships that would add
  to its record are refused with 409 `learning_paused`; what is known is still
  served under its purposes
- `POST /identities/{id}/forget`: each target (fact, relationship or context
  entry) is emptied in place and marked forgotten, leaving every projection,
  search, path, list and intelligence context at once. A tombstone and the
  audit chain keep the act, the id and a SHA-256 of the record as it was,
  never the content. Tombstones are append-only at the schema
- `POST /identities/{id}/reset`: forgets everything learned in one governed
  action; the identity, its declared attributes, obligations and consents
  remain. The identity id is repeated in the body as confirmation
- `GET /identities/{id}/export`: the whole record with a fingerprint over its
  canonical form, the sentence that says how to recompute it, the lineage of
  every chain event about the identity, and a receipt that signs the
  fingerprint and names the chain head
- Every control is policy-evaluated (allowed by default, a policy can deny or
  escalate), receipted and chained. Conformance test covers all five; the
  suite exercises all 51 operations
- `docs/RICORSA.md`: how Ricorsa's identity graph, regions, provenance chain,
  recursive learning loop and Discover map to the platform, and which rules
  the platform now guarantees
- The served contract has one stable address, `/igl-openapi.yaml`; the
  versioned names redirect to it

### Changed

- `GET /capabilities` lists `subject-controls`; the seven MCP tools are
  unchanged on purpose: a model must not be able to change what is learned
  about a person

## [1.5.0] (2026-10-15)

The five runtime findings left open by the October 2026 security review are
closed, each with a regression test. The repository now runs a linter and a
type check on every pull request. The model the provisioning service reasons
with is loaded at a pinned revision and its bytes are recorded.

### Security

- F-05: the idempotency key is a SHA-256 execution identity over the actor,
  boundary, intent and parameters, the context selection, every compute step
  with its bound arguments and pinned model version, the declared outputs and
  the runtime build digest. Statements that differ in any material input are
  different work. Only a durably committed trace can answer an idempotency
  check. `Interpreter.statementKeys()` previews keys without running
- F-06: journal records are frozen snapshots; runtimes work on copies. Reuse
  of a trace as context is its own `reuse` journal event and the counter is
  derived by replay, so the chain verifies after reuse, receipts stay valid and
  confidence decay survives a restart
- F-07: nothing is visible until it is durable. A failed persist leaves no
  entry; write-behind entries stay pending until `flush()` succeeds and roll
  back when it fails; `entries()` returns durable entries unless asked for
  pending ones; the IOS runtime stages traces until durable; `FileJournal`
  fsyncs every append
- F-08: checkpoints. `journal.checkpoint()`, `verify({ checkpoint })`, a
  `checkpoint` option on `FileJournal` and `D1Journal` that refuses a truncated
  or rewritten history, and `Signer.verifyHeadReceipt(..., { extended: true })`
  so a signed head receipt serves as the anchor
- F-09: `Traces=None` returns no context. Every refusal or failure is journaled
  as a `failure` event with privacy-safe fields before any `OnFail` handler runs
- Model provenance: `provision/model.mjs` loads `Xenova/distilgpt2` at Hub
  commit `a41c1048`, hashes the cached files and records `label@revision#digest`
  as the model version in every AI assertion; `IGL_MODEL_LOCAL_ONLY=1` refuses
  network fetches; health endpoints report the loaded revision and digest
- `UDM.Validate` refuses a named ruleset UDM does not define
  (`IGL_UNKNOWN_RULESET`) instead of validating everything

### Added

- Platform: the refusal record. Every deny, and every escalate on a path that
  cannot park the work, now produces a signed governance receipt and an entry
  in the tenant's hash chain before the 403 leaves, and the 403 names the
  `decisionId` and `receiptId`. Every `AuthorityDecision` carries
  `policiesMatched` (id, name, version, effect and a SHA-256 of the rule as it
  stood) and `subject` (action, resource type and id, identity, organization,
  roles). Every receipt carries `auditHead`, the chain head at issue time, so a
  receipt held outside the system is a checkpoint the database cannot rewrite.
  Policies are immutable at the schema (triggers): a change is a new version.
  Conformance test: a denied investigation is checked the way an auditor would
- `test/audit.test.js`: the review's probes, promoted into the suite (18 tests;
  169 in all). `docs/audit/probes-2026-10.mjs` now prints the properties holding
- ESLint (flat config) and `tsc --checkJs` over `src/`, `provision/`,
  `platform/api/src` and `platform/ops/src`; `npm run lint`, `npm run typecheck`
  and `npm run check`; both run in CI before the tests
- README: a Start Here section that routes runtime users, application builders
  and AI-client integrators to the right quickstart

### Fixed

- `provision/cli.mjs` had called `provisionIdentity` without the owner that
  F-02 made mandatory in 1.3.0, so the documented CLI command failed; it now
  acts as the local operator (`IGL_CLI_TENANT`, `IGL_CLI_PRINCIPAL` to change).
  Found by the type check on its first run
- Dead imports and variables across the runtime, the platform service and the
  tests, found by the linter

### Removed

- `examples/run-vdrpros.js` and `examples/vdrpros-ussh.igl`: the one example
  that ran against stubbed runtimes (canned inference, constraint checks that
  always passed). Every remaining example runs the real runtime against the
  pinned model
- `spec/openapi-v0.1.yaml` and the served copy: superseded by 0.2.0; the file
  is in the repository history
- `OPEN_SOURCE_CHECKLIST.md` and `SECURITY-REVIEW.md`: an internal checklist
  whose items were done, and scan notes that the audit document supersedes
- References in `docs/SPEC.md`, `docs/SCOPE.md` and source comments to design
  documents that are not in the repository now say so instead of linking to them

### Changed

- The README status line no longer says experimental. It says what is true:
  all nine findings of our own review are closed with tests, and an
  independent review has not happened yet
- Attestation notes join clauses with a semicolon instead of a middle dot

## [1.4.0] (2026-10-15)

### Added

- `platform/api`: the IGL Governed Identity Platform API, a Cloudflare Worker
  with a D1 database per environment that implements all 46 operations of
  `spec/openapi.yaml`. Routes are generated from the contract; one handler per
  operation; a conformance suite exercises every operation against the running
  service and validates each response against the contract's schemas. API
  keys and OAuth 2.0 client-credentials tokens (EdDSA, JWKS published), tenancy
  on every call, scopes as the contract lists them, purpose-bounded projections
  with the four gates and a per-node explanation, policy evaluation that fails
  closed, governed intelligence that can only answer from records the caller
  may see and must cite them, agents and workflows as runs with approval
  states, a per-tenant SHA-256 audit chain with append-only triggers, signed
  governance receipts, idempotency keys, rate limits, signed webhooks and
  problem+json errors. Deployed by `.github/workflows/deploy-api.yml` to
  sandbox.id-me.ai and api.id-me.ai; the site deploy then asks both hosts what
  they serve and regenerates the API reference before publishing
- `platform/site`: the id-me.ai source, generated API reference, Contact Sales
  intake function, interactive User Center running `provision/resolver.mjs`
- `docs/examples/verify-audit-chain.mjs` and `docs/examples/verify-journals.mjs`
- `platform/ops`: the operator console at ops.id-me.ai behind Cloudflare
  Access: site traffic, page views, Contact Sales inquiries, platform tenants
  and usage, service health, repository activity and public mentions
- Releases can be cut from Actions (Release, Run workflow): the run tags main
  with the package.json version, publishes the GitHub release with notes from
  this file, the npm tarball, the contract and checksums, and publishes to npm
  when an `NPM_TOKEN` secret exists

### Changed

- api, auth, sandbox and ops hostnames are Cloudflare Custom Domains, so the
  first deploy creates their DNS records and certificates
- The npm package now contains only the language and runtime (`src/`, the
  contract and the top-level documents); the platform, provisioning service
  and tests ship with the repository, not the package

## [1.3.1] (2026-10-14)

### Security

- Internal errors no longer echo their message to the caller (CodeQL
  js/stack-trace-exposure). Governed refusals (`IGL_*` codes) and 4xx errors
  are returned verbatim; anything else is logged server-side with its stack
  and reported as `internal error` (`clientError` in `provision/auth.mjs`,
  used by both the HTTP and MCP surfaces; regression test added)

### Changed

- Documentation, comments and messages rewritten in plain language. Typographic
  dashes, arrows and other decorative symbols are gone from prose and comments;
  the IGL language tokens themselves (`=>`, `->`, `⇒`, `→`) are unchanged
- README now documents how to run the provisioning service for other people
  (`PROVISION_PUBLIC`, `PROVISION_API_KEY`, `PROVISION_ALLOWED_ORIGINS`, rate and
  concurrency limits, `IGL_DATA_DIR`, `IGL_KEYS_DIR`) and lists the MCP tools the
  repository actually serves

## [1.3.0] (2026-10-14)

Security release. Closes findings F-01 to F-04 of the October 2026 audit
(`docs/audit/SECURITY-AUDIT-2026-10.md`) and clears every open dependency
advisory. The runtime API grows; nothing that passed before stops passing,
but the provisioning service now refuses the unsafe defaults it used to accept.

### Security

- **F-01** Provisioning service binds `127.0.0.1` by default; `PROVISION_PUBLIC=1`
  requires `PROVISION_API_KEY` or the process refuses to start. Credentials are
  read from `Authorization: Bearer` / `X-IGL-Caller-Key` only, a key in the
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

- `test/security.test.js`, 16 regression tests for F-01 to F-04, part of `npm test`
- `spec/openapi.yaml`, the public OpenAPI 3.1 contract (0.2.0) for the IGL
  Governed Identity Platform at id-me.ai, linted in CI; 0.1.0 kept alongside
- `docs/PLATFORM.md` (runtime and platform mapping, MCP to REST table),
  `docs/adr/` (0001-0003), `docs/audit/` (the audit and its executable probes)
- Project files: `SUPPORT.md`, `GOVERNANCE.md`, `MAINTAINERS.md`,
  `CITATION.cff`, `.editorconfig`, `.nvmrc`
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

## [1.2.1] (2026-08-18)

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
  to an id to string array) and model forward passes carry explicit
  `attention_mask` / `position_ids`, both required by the v3 runtime API.
  Verified after migration: 131/131 tests, the live governed decode example
  (Hilcorp boundary commits + `IGL_FOOTPRINT_DENIED` refusal), and the
  provisioning service boot

## [1.2.0] (2026-08-18)

Clean-clone audit release. Every command in the README quick start now runs
from a fresh clone with no paths outside the repository.

### Added

- **`src/decode.js`**, the per-token governed decode primitive promoted into
  the language core: `governedStep`, `governedDecode`,
  `governanceLogitsProcessor`, `sealDecodeTrace`, `verifyDecode`, `softmax`,
  `entropy`. FUSE is applied inside the decode loop at every step; prohibited
  tokens carry zero mass and can never be emitted. Sealed per-token traces
  recompute independently of the runtime that produced them
- `sha256` / `canonical` are now exported from `src/sign.js`
- `test/decode.test.js`, 7 tests covering the decode primitive (support
  restriction, zero partition, graded ceilings, end-to-end governed decode,
  tampered-trace rejection)

### Fixed

- Examples and the provisioning service imported `governedStep` and hash
  helpers from a legacy `igl-v1/` path that was never shipped, every example
  and `npm run provision` broke on a clean clone. All imports now resolve
  inside the repository
- `live-identity-decode.mjs` adapted to the current `Signer` receipt API
  (`receiptForTrace` / `verifyTraceReceipt`)
- Example program reference corrected to `jordan-avery-dfir-footprint.igl`

### Verified from a clean clone

- 131/131 tests; all four examples run; the provision service boots and
  answers the MCP handshake

## [1.1.0] (2026-08-18)

Audit strengthening, informed by a comparative review of MCP security
frameworks.

### Added

- **Merkle inclusion proofs on the journal** (`store.js`): `merkleRoot()`,
  `inclusionProof(seq)`, and `verifyInclusion()` let an auditor verify a
  single disclosed entry against a published root **without access to the
  rest of the chain**, privacy-preserving audit on top of the linear hash
  chain
- **Runtime attestation in receipts** (`sign.js`): every trace and head
  receipt carries `runtime`, a SHA-256 digest of the runtime's own source
  manifest, inside the signed envelope. Which governed build produced a
  receipt is settled by re-computation, not confidence
- Receipt envelope verification now strips only the key material and
  signature, every other field is authenticated, present or future

### Compatibility

- Receipts signed by 1.0.0 (envelope without `runtime`) still verify

### Tests

- 124/124 (12 new: Merkle determinism, per-entry inclusion, odd-length
  chains, foreign-root and tampered-leaf rejection, disk round trip,
  attestation coverage, forgery rejection, pre-attestation compatibility)

## [1.0.0] (2026-08-17)

First public release.

### Language core (`src/`)

- Lexer, parser, and static checker for the IGL language
- Interpreter with governed execution: identity, boundary, intent, and trace
  bound into every computation
- Identity graph runtime, BOUNDARY graphs (companies) and FOOTPRINT graphs
  (individuals) folded from hash-chained journal events
- Append-only journal (`store.js`) with tamper-evident hash chaining and
  deterministic replay; refuses to load a tampered chain
- Signed receipts (`sign.js`) with digest-bound verification
- Governed decode bridge (`bridge.js`), the model computes inside the
  compiled footprint mask; boundary violations are refusals, not errors

### Provisioning service (`provision/`)

- HTTP service: provision identity graphs from natural-language descriptions
- MCP endpoint for AI client connections (ChatGPT developer-mode connectors)
- Caller recognition (`whoami`): the caller key binds the session to the
  caller's own graph, first contact seeds, every contact after replays
- Deterministic natural-language to attribute resolver
- Governed AI decode via `@xenova/transformers` (distilgpt2 reference model,
  pluggable)
- OpenAPI specification and CLI
- Dockerfile for the provisioning service

### Tests

- 112-test suite across six files: bridge, extract, graph, igl, sign, store

[1.0.0]: https://github.com/SMEPro-Technologies-LLC/igl/releases/tag/v1.0.0
