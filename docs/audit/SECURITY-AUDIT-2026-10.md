# IGL security audit, October 2026

| | |
|---|---|
| Subject | `SMEPro-Technologies-LLC/igl`, release **v1.2.1** (tag asset), cross-checked against `main` files read on 2026-10-14 |
| Method | Full source read of `src/`, `provision/`, `test/`, workflows and policy files; clean install and test run; **executable probes** against the real modules (`probes-2026-10.mjs`, results below); `npm audit`; lockfile inspection |
| Not done | Dynamic testing of a deployed instance; container build; review of any private enterprise repository; review of the hosted platform at id-me.ai |
| Assurance | Technical review with reproducible evidence. Not a certification or a penetration test. |
| Headline | **The runtime's core idea holds in code (observations never become grants) and the test suite is real (131/131 from a clean clone). The provisioning service as of v1.2.1 was not safe to expose, and three journal-integrity properties the README claims do not hold as stated.** |
| Status (1.3.0) | **F-01 to F-04 remediated** in that release with a regression suite (`test/security.test.js`, 16 tests) and the dependency advisories cleared. |
| Status (1.5.0) | **F-05 to F-09 remediated.** Each has a regression test in `test/audit.test.js` (the probes, promoted and inverted), the probes file now prints the properties holding, model provenance is pinned and recorded (section 4), and lint and type checks run in CI (section 3). All nine findings of this review are closed. What remains is the thing we cannot do ourselves: an independent review. Until one has happened, "audited by its authors" is the honest description, and the README says so. |

Line numbers refer to the v1.2.1 release tree (the tree the findings were made against); the **Remediation** notes refer to 1.3.0. Each finding is labelled **Confirmed in code** (visible in source), **Confirmed by probe** (reproduced by running the module), or **Inferred** (consequence not executed here).

---

## 1. Architecture and trust boundaries

Request flow in the provisioning service:

```
HTTP / MCP caller to authorized() to resolveCaller() to resolveDescription() to graph-builder grants to generated .igl program to Interpreter (identity to boundary to intent to idempotency to context to compute to attest to commit) to journal (Memory | File | D1) to signed receipt to response
```

What is sound. `GraphRuntime.authorize()` (`src/graph.js:339-360`) decides from the **granted** set folded from the journal; observations, however many, never enter it (`src/graph.js:287-305`). The interpreter's two-phase commit awaits `journal.flush()` before releasing outputs (`src/interpreter.js:234-248`, `src/runtime.js:200`). The D1 backend does a head compare-and-set plus a single multi-row insert, and the schema carries triggers that refuse `UPDATE`/`DELETE` (`src/store.js:151-161, 181-205`). Receipts carry a digest of the runtime's own `src/*.js` (`src/sign.js:39-47`). CI pins actions by commit SHA with `contents: read`.

Where the guarantees stop. The language can require an identity, a boundary, an intent and a trace on every statement. It cannot, by itself, establish **who controls the identity**, **who was entitled to issue a grant**, **whether a named signer is a human**, or **whether the journal you hold is complete**. Those live at boundaries the current code leaves open:

| Boundary | Property needed | Status |
|---|---|---|
| Caller to service | authentication | Optional (F-01); required since 1.3.0 |
| Caller to graph | ownership / tenancy | Absent (F-02); enforced since 1.3.0 |
| Description to grant | grants come from an entitled grantor | Absent (F-03); signed envelopes since 1.3.0 |
| Program to signer | attestation implies approval | Not established (F-04); three classes since 1.3.0 |
| Statement to statement | "same work" is well defined | Incomplete (F-05); execution identity since 1.5.0 |
| Runtime to journal | committed records are immutable | Violated by normal operation (F-06); frozen records and reuse events since 1.5.0 |
| Runtime to storage | visible means durable | Not guaranteed (F-07); pending versus durable since 1.5.0 |
| Journal to auditor | completeness detectable | Not without an external anchor (F-08); checkpoints since 1.5.0 |
| Deployment to model | the model bytes are the ones recorded | Unpinned (section 4); pinned revision and digest since 1.5.0 |

## 2. Findings

Severity assumes the provisioning service reachable by more than one party. For a single-user, synthetic-data demo on localhost the practical exposure of F-01/F-02 is nil; the runtime findings (F-05 to F-09) apply regardless.

### F-01 (High): The service runs open unless an environment variable is set, and binds every interface
**Confirmed in code.** `authorized()` returns `true` for every route when `PROVISION_API_KEY` is unset (`provision/server.mjs:58-65`), and `server.listen(PORT)` has no host argument (`:116`), so the default is "no auth, all interfaces". `?key=` is accepted as a credential (`:52-57`), which puts keys into access logs and browser history. CORS allow-listing (`PROVISION_ALLOWED_ORIGINS`) is not authentication.
**Fix.** Bind `127.0.0.1` by default; require `PROVISION_PUBLIC=1` *and* a key to listen elsewhere, and refuse to start otherwise; drop `?key=`; add per-key rate limits and a concurrency cap on inference.

**Remediation (1.3.0).** `provision/auth.mjs`, `listenConfig()` binds `127.0.0.1` unless `PROVISION_PUBLIC=1`, and refuses to start public without `PROVISION_API_KEY`; `credentialFrom()` reads `Authorization: Bearer` or `X-IGL-Caller-Key` only, a `?key=` is ignored; `RateLimiter` (token bucket per principal) and `Semaphore` (inference concurrency cap) are wired into `server.mjs`. CORS is a shared allow-list helper and is not consulted for authorization. Tests: `security.test.js` "F-01".

### F-02 (High): Caller recognition is not used for authorization
**Confirmed in code.** `list_graphs`, `get_graph`, `search`, `fetch` and `GET /api/graphs[/slug]` read the global artifact directory with no caller filter (`provision/mcp.mjs:100-118`, `provision/server.mjs:92-100`). `provision_identity` provisions whatever description is supplied, for any caller (`mcp.mjs:119-131`; `server.mjs:101-111`). Once past the gate, every registered caller sees and can create every graph.
Also: storage is keyed by a slug of the resolved display name (`provision/service.mjs:67-68`, `resolver.mjs:29`), so two people who resolve to the same label share one journal.
**Fix.** Stable principal and tenant ids; every read and write scoped to the caller's tenant; storage namespaced by id, never by name.

**Remediation (1.3.0).** `provision/auth.mjs` `principalOf()` derives a stable principal id from the key hash (or the registry's `id`/`tenant`); `makeGate()` attaches `{ tenant, principal, admin }` to every request. `provision/registry.mjs` stores graphs under `<data>/<tenant>/<id>` where `id = graphIdFor(owner, slug)` (a hash over tenant, principal and slug), so equal display names never share a journal. `listProvisioned`, `getProvisioned`, `searchProvisioned` and every MCP tool take the caller's auth and return only what that tenant may read; the service key is the only admin. Tests: "F-02".

### F-03 (High): Grants are created from untrusted descriptions, and "signed" means "has a `by` field"
**Confirmed in code.** `grant()`, `revoke()`, `bindKey()`, `revokeKey()` require a non-empty `by` and nothing else (`src/graph.js:83-122`); no signature is checked. `graph-builder.mjs` turns resolved description attributes and role templates into grants, including a broad US jurisdiction grant for companies (`:98-108, 205-216`). The enforcement is faithful; the authority it enforces was never authorized by anyone.
**Fix.** Separate sandbox provisioning from authoritative enrollment. Grants enter only as signed envelopes verified against a grantor registry, with scope, expiry and replay protection.

**Remediation (1.3.0).** `src/sign.js` adds `DOMAIN_GRANT`, `signGrant()` / `verifyGrant()`. `GraphRuntime` takes a `grantors` registry; `grant`, `revoke`, `bindKey` and `revokeKey` are rejected with `IGL_UNKNOWN_GRANTOR` / `IGL_UNVERIFIED_GRANT` unless the event carries a signature from a registered grantor, and replay re-verifies every authority event in the journal. The provisioner signs with a persistent governance key (`provision/keys.mjs`, PEM `0600`), and the company template's boundary grant is now the home state only, never a jurisdiction-wide grant. Tests: "F-03".

### F-04 (High): Attestation does not establish human approval
**Confirmed in code.** With no signer registry, a symbolic signer satisfies the gate (`src/interpreter.js:167-186`: "accepts symbolic signers, unkeyed"). With a registry, the *service* signs when the program names a registered signer. The provisioner generates a fresh "governance board" keypair on every run (`provision/graph-builder.mjs:134-138`), so the "human" class receipts prove only that the process held a key it just created. `provision/service.mjs:87-89` verifies receipts without the graph, which `sign.js` reports as `pinned: false`.
**Fix.** A distinct, authenticated approval step bound to the artifact digest; persistent, registered signer keys; different attestation classes for service signatures and human approvals.

**Remediation (1.3.0).** Attestation now has three classes recorded in the trace: `ai` (no registry), `service` (a key the runtime holds) and `human` (a registered public-only key whose holder produced an `Approval` envelope over the statement subject, `DOMAIN_APPROVAL`, bound to `{ statementKey, actor, intent, boundary }`). A program cannot obtain `human` by naming a signer: it needs the approval as an input, and the runtime raises `IGL_APPROVAL_REQUIRED` / `IGL_BAD_APPROVAL` / `IGL_SELF_APPROVAL` otherwise. Signer keys persist across runs. Receipt verification in the service is pinned to the graph. Tests: "F-04".

### F-05 (High): The idempotency key omits the inputs that make work different, and uses a 64-bit non-cryptographic hash
**Confirmed by probe (P3).** The key covers actor, boundary, intent name and parameters, and compute *function names* only (`src/interpreter.js:133-135`); compute arguments, context selection and outputs are excluded. Two statements with different `RequiredForms` produce the same key, so the second silently returns the first's outputs. The hash is FNV-style, 64 bits (`:23-30`), and the lookup does not check that the prior trace was committed (`:137-138`, `runtime.js:239`).
**Fix.** Canonical execution identity over every material input plus model and policy versions, SHA-256, matched only against durably committed traces.

**Remediation (1.5.0).** `Interpreter.executionIdentity()` defines "the same statement" as the actor, boundary, intent and parameters, the context selection, every compute step with its bound arguments and the pinned model version, the declared outputs, and the runtime build digest, hashed with SHA-256 over the canonical form (`EXECUTION_IDENTITY_VERSION = "igl-exec-v1"`). An `Approval` passed to `IOS.Attest` is excluded because it is a signature over this key. Only a trace in state `committed` that is durably visible can answer an idempotency check. `Interpreter.statementKeys(source)` previews the keys without running, so an approver sees what they sign. Tests: `audit.test.js` "F-05".

### F-06 (High): Ordinary context reuse mutates journaled records
**Confirmed by probe (P1, P5).** `journal.append()` stores the trace object by reference (`src/store.js:36-40`, `runtime.js:233`); `markReused()` then increments `reuseCount` on that object (`runtime.js:227-229`, called at `interpreter.js:253`). Probe P1: `verify()` is `ok: true` before reuse and `ok: false, "body does not reproduce its digest"` after one reuse. For `FileJournal` the line was written before the mutation, so the file still verifies, but a restart replays `reuseCount = 0` (P5): the live process and the replayed one disagree about confidence decay, and decay resets on every restart. A receipt over the original trace digest no longer matches the live object.
**Fix.** Treat committed records as immutable snapshots; record reuse as its own journal event and derive counters by replay; add a test that verifies the chain *after* reuse and after restart.

**Remediation (1.5.0).** `journal.append()` stores a deep, frozen copy of the body; runtimes read working copies (`structuredClone`) and can no longer reach the record. Reuse is a `reuse` journal event (`{ traceIds, by, at }`) and `IOSRuntime.reuseCount()` derives the counter by replay, so the chain verifies after reuse, a receipt over the trace still verifies, and decay survives a restart. Tests: "F-06".

### F-07 (High): Entries become visible before they are durable
**Confirmed by probe (P6).** `append()` pushes to the in-memory list before `persist()` runs (`store.js:36-40`); when persist throws, the entry is still returned by `entries()`. `D1Journal` queues to `pending` and flushes later (`:179, 193-210`); `IOSRuntime.write()` pushes to `traces` immediately (`runtime.js:231-236`), and `byStatementKey()` searches those traces with no durability check. **Inferred:** a failed D1 flush blocks the first release of outputs, but a retry on the same runtime can find the non-durable trace and return it as idempotent. `FileJournal` uses `appendFileSync` without `flush: true` (`:125`), so a successful call is not a durability guarantee under power loss.
**Fix.** Pending versus committed states; exclude pending from reads and idempotency; recovery on failed flush; tests for disk-full, interrupted write, retry and concurrent writers.

**Remediation (1.5.0).** `append()` persists before it makes anything visible: a failed persist leaves no entry and the head unchanged. Each journal tracks a durable length; `entries()` returns durable entries only unless `{ pending: true }` is asked for; `D1Journal` keeps write-behind entries pending until `flush()` succeeds and rolls them back when it fails, so the next append re-chains against the durable head. `IOSRuntime.write()` stages a trace until its journal reports it durable, and `byStatementKey()` sees only durable traces. `FileJournal.persist()` writes and `fsync`s before returning. Tests: "F-07", and the existing HEAD-CAS test now asserts the rollback.

### F-08 (Medium): Chain verification cannot detect truncation or a rewritten unsigned chain
**Confirmed by probe (P4).** `verify()` recomputes from the entries it is handed (`store.js:47-55`). Dropping a suffix leaves a valid shorter chain (`fullLength 5 to truncatedLength 3, ok: true`). Merkle inclusion proofs help an auditor check one entry against a root, but only if the root is held somewhere the journal administrator cannot rewrite.
**Fix.** Signed checkpoints (head digest + length + time) stored outside the journal's failure domain; replay verifies against the latest checkpoint.

**Remediation (1.5.0).** `journal.checkpoint()` returns `{ head, length, at }`; `verify({ checkpoint })` and `verifyCheckpoint()` refuse a chain that is shorter than the checkpoint or does not reproduce its head; `FileJournal` and `D1Journal` accept a `checkpoint` option and refuse to load a truncated or rewritten history. `Signer.verifyHeadReceipt(receipt, { journal, extended: true })` treats a signed head receipt as that checkpoint, so the anchor can live anywhere the journal administrator cannot write. Tests: "F-08".

### F-09 (Medium): `Traces=None` returns every trace; failures are not journaled
**Confirmed by probe (P2).** `Traces=None` sets `n = 0` (`interpreter.js:89`); selection does `pool.slice(-Math.max(0, n))` (`runtime.js:218`), and `slice(-0)` is `slice(0)`: all three traces came back in the probe. A statement declared context-free inherits prior context. Separately, `handleFailure()` returns a failure object (`interpreter.js:268-295`) but nothing appends a denial or failure entry to the journal, so refused actions, including the `IGL_FOOTPRINT_DENIED` the README showcases, leave no durable record.
**Fix.** `n === 0` returns `[]` explicitly; journal failures and denials as first-class events with privacy-safe fields.

**Remediation (1.5.0).** `select()` returns `[]` for `n === 0`. Every refusal or failure in `Interpreter.run()` is journaled as a `failure` event (`actor`, `intent`, `code`, `phase`, `line`, a truncated message; no parameters, outputs or model text) before any `OnFail` handler runs, including `IGL_FOOTPRINT_DENIED`. Tests: "F-09".

### Lower-severity observations
`UDM.Validate` treats an unknown ruleset as an empty rule list and reports `ok` (`runtime.js:61-64`); a misspelled ruleset validates everything (fixed in 1.5.0: a named ruleset UDM does not define raises `IGL_UNKNOWN_RULESET`; only the implicit default may be empty). Set-valued boundary entries collapse through `Object.fromEntries` (`runtime.js:49`), keeping the last value. `runtimeDigest()` covers `src/*.js` only (`sign.js:39-47`): provisioning code, dependencies, model weights and configuration are outside the attested build. `Dockerfile.provision:34` copies `igl-v1/src`, which does not exist in the tree, so the image does not build from this commit. `SECURITY.md` and `CODE_OF_CONDUCT.md` carry placeholder contacts; `NOTICE` and `TRADEMARK.md` carry `[LEGAL ENTITY NAME]` (fixed in this PR).

## 3. Code quality and verification

Positive: clean separation of lexer, parser, checker, interpreter and runtime; negative tests for boundary violations, tampered chains, forged receipts and failed persistence; 131/131 tests pass from a clean clone (verified here). The CHANGELOG is honest and specific.

Gaps at the time of review: no tests for the properties in F-05 to F-09 (closed in 1.5.0: `test/audit.test.js`, 18 tests); the CI job label said "112 tests" while the suite is 131 (fixed); no lint or type checking (closed in 1.5.0: ESLint and `tsc --checkJs` over `src/`, `provision/`, `platform/api/src` and `platform/ops/src` run in CI, and the type check found a real defect on its first run, the CLI calling `provisionIdentity` without the owner that F-02 made mandatory); `CONTRIBUTING.md` promised DCO enforcement that CI did not perform (fixed); docs cite files not in the tree (`CRITIQUE.md`, `architecture.md`, `point-of-inflection.md`, `IGL_Specs.docx`).

## 4. Supply chain

Lockfile: 76 packages, every entry carries an integrity hash. Two packages run install scripts (`onnxruntime-node`, `protobufjs`); the tree pulls platform-specific native binaries for `sharp` and ONNX Runtime. `package.json` overrides force `sharp ^0.35.3` and `adm-zip ^0.6.0`, which was sound in August.

**It has aged.** `npm audit --omit=dev` on a clean v1.2.1 install on 2026-10-14 reports **3 high, 4 moderate**, all with fixes available: `sharp ≤0.35.5-rc.1` (libheif GHSA-g89c-p67h-r497 / GHSA-2jg2-4ch7-h545, librsvg CVE-2026-96889), `adm-zip ≤0.6.0` (symlink-following extraction to arbitrary file overwrite; uncontrolled allocation DoS), `onnxruntime-node` through those, `sprintf-js` / `roarr` / `global-agent` (DoS). The CHANGELOG's "0 vulnerabilities" was true at release and was not true on 2026-10-14. **1.3.0 clears them** (`adm-zip 0.6.1`, `sharp 0.35.5`, `global-agent 4.x`, `onnxruntime-node 1.30`, `@huggingface/transformers 4.3.1`; `npm audit --omit=dev` to 0), and CI now fails on any high advisory.

Model provenance: `AutoTokenizer.from_pretrained("Xenova/distilgpt2")` and `AutoModelForCausalLM.from_pretrained(...)` are called without a revision or hash (`provision/service.mjs:37-45`); the recorded `Xenova/distilgpt2@onnx-q8` label does not identify the bytes loaded. Pin a revision, record the artifact hash in the trace, and prefer local-only loading in production. **Closed in 1.5.0:** `provision/model.mjs` loads the model at a pinned Hub commit (`a41c1048`), hashes every cached file after loading, and the version string every AI assertion carries is `label@revision#digest`; `IGL_MODEL_LOCAL_ONLY=1` refuses network fetches, and the health endpoints report the loaded revision and digest. The service, the examples and the CLI all load through it.

Recommended: Dependabot (added), dependency review (added), a weekly `npm audit` in CI (added), an SBOM on release, images pinned by digest, Scorecard (added).

## 5. Threat model

| Adversary | Scenario | Findings |
|---|---|---|
| Unauthenticated network user | Reads every provisioned graph; burns inference | F-01 |
| Registered but malicious caller | Reads, searches and provisions other identities' graphs | F-02 |
| Anyone who can submit a description | Seeds an identity with grants it never received, including a jurisdiction-wide one | F-03 |
| Program author | Names a signer and obtains a "human" receipt without a human | F-04 |
| Repeat caller | Gets stale outputs for changed inputs | F-05 |
| Normal operation | Journal verification fails in memory; decay resets on restart | F-06 |
| Storage failure or crash | Non-durable trace served as idempotent; lost writes | F-07 |
| Storage administrator | Truncates or rewrites history undetected | F-08 |
| Program author | Declares `Traces=None`, inherits context anyway | F-09 |
| Dependency or model supplier | Changes execution outside the attested `src/` digest | section 4 |

Constrained decoding (`src/decode.js`) does what it claims: prohibited tokens get zero mass and cannot be emitted. It says nothing about whether the permitted set was legitimate, whether the emitted value is true, or whether the caller owns the identity.

## 6. Open questions (release gates)

1. Who may create, scope, approve and revoke grants, and how is that enforced cryptographically rather than by a `by` string?
2. How is a caller bound to a stable tenant and principal id, and where is that registry kept?
3. What is a human approval, as distinct from a service signature, and where do signer keys persist, rotate and recover?
4. What is the canonical definition of "the same statement"?
5. What happens to a trace whose flush failed, and how does a restarted runtime know?
6. Where do journal checkpoints live, who signs them, and how often?
7. How are concurrent provisions of the same identity serialized?
8. Which model and tokenizer bytes were loaded, and is that recorded in the trace?
9. What is retained, encrypted, exported and deleted, and under whose policy?
10. Does a clean clone build the container and pass a security regression suite that encodes F-05 to F-09?

Release gate: F-01 to F-04 fixed with tests (done in 1.3.0); F-05 to F-09 fixed with tests and probes promoted into `test/` (done in 1.5.0); container builds; dependency advisories cleared; an independent review before any "audit-grade" claim. The last item is the only one still open.

## 7. Reproduce

```bash
git clone https://github.com/SMEPro-Technologies-LLC/igl && cd igl && npm ci
npm run check                              # lint, type check, 169 tests
node docs/audit/probes-2026-10.mjs         # the F-05 to F-09 properties, as JSON
npm audit --omit=dev                       # dependency advisories
```

---

## Appendix, Getting attention without overclaiming

No one can guarantee overnight virality, and the fastest way to lose a technical audience is to be caught claiming more than the code does. What is credible, and rare, is a runnable demonstration of one sharp idea: **observations never become permissions**. The repo already contains the demo (`programs/jordan-avery-dfir-footprint.igl`: a granted action runs, an action observed five times and never granted is refused with `IGL_FOOTPRINT_DENIED` before any model work is paid for).

Before posting anywhere: fix F-01 (loopback default) and the Dockerfile so a stranger's first ten minutes work; do not put the provisioning service on the Internet to lower demo friction; link this audit from the README and keep the status line honest, because a findings list with remediation dates earns more trust from engineers than a clean marketing page.

Then, in order: a 45-second screen recording of the refusal with the receipt; that recording, the one-sentence claim, the three-command reproduction and the known limitations at the top of the README; five engineers you already know asked to reproduce it and report what confused them; one Show HN post ("Show HN: IGL, a runtime where AI observations never become permissions"), written in the first person, with the author in the thread answering technical questions and conceding the limitations above; one longer piece on id-me.ai that walks the probe results, because "we audited ourselves and here is what we found" travels well in security circles. Measure independent reproductions, time-to-first-result, substantive issues filed and integration requests. Stars are a trailing indicator.
