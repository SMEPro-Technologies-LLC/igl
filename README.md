<p align="center">
  <img src="docs/assets/igl-mark.svg" width="72" alt="">
</p>
<h1 align="center">IGL — Identity Governed Logic</h1>
<p align="center"><strong>The open-source runtime and public API contract behind the IGL Governed Identity Platform.</strong><br><em>Status: experimental. Read the <a href="./docs/audit/SECURITY-AUDIT-2026-10.md">security audit</a> before deploying the provisioning service anywhere but localhost.</em></p>

<p align="center">
  <a href="https://github.com/SMEPro-Technologies-LLC/igl/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/SMEPro-Technologies-LLC/igl/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/SMEPro-Technologies-LLC/igl/actions/workflows/codeql.yml"><img alt="CodeQL" src="https://github.com/SMEPro-Technologies-LLC/igl/actions/workflows/codeql.yml/badge.svg"></a>
  <a href="https://securityscorecards.dev/viewer/?uri=github.com/SMEPro-Technologies-LLC/igl"><img alt="OpenSSF Scorecard" src="https://api.securityscorecards.dev/projects/github.com/SMEPro-Technologies-LLC/igl/badge"></a>
  <a href="./LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <a href="./CHANGELOG.md"><img alt="Version" src="https://img.shields.io/badge/version-1.2.1-informational"></a>
  <a href="https://id-me.ai"><img alt="Platform" src="https://img.shields.io/badge/platform-id--me.ai-a9a4f2"></a>
</p>

**Intelligence has to identify itself, declare its boundaries, and state its intent before it thinks. Not after. Not when something goes wrong. Before.**

IGL binds four things into the computation itself:

- **Identity** — you always know who or what is acting
- **Boundaries** — what it may and may not do, declared up front and enforced while it runs
- **Intent** — the reason for the action, on the record
- **Trace** — a hash-chained, append-only journal of every step taken, so "what happened" is never a debate

An actor that hasn't declared its identity can't execute. An action outside the declared boundary doesn't get a warning — it doesn't run.

## Two things live here

| | What it is | Where to start |
|---|---|---|
| **The runtime** | The IGL language core and reference runtime (Node.js): lexer, parser, static checker, interpreter, identity-graph runtime, hash-chained journal with Merkle inclusion proofs, signed receipts with runtime attestation, and the governed decode bridge. This is what enforces the four guarantees. | [Quick start](#quick-start) · [`docs/SPEC.md`](./docs/SPEC.md) |
| **The platform contract** | The public OpenAPI 3.1 contract for the **IGL Governed Identity Platform** served at [id-me.ai](https://id-me.ai): identity, authority, knowledge, policy, evidence, outcomes, graph, intelligence, agents, workflows, audit, and purpose-bounded projections. Model-agnostic: Claude, Moonshot or another reasoning model can run beneath it without changing how applications call it. | [`spec/openapi.yaml`](./spec/openapi.yaml) · [`spec/README.md`](./spec/README.md) · [API reference](https://id-me.ai/#docs) |

How the two relate — runtime concepts (BOUNDARY and FOOTPRINT graphs, journal, receipts, grants and observations) to platform concepts (the six graphs, purposes, projections, governance receipts) — is written down once, in [`docs/PLATFORM.md`](./docs/PLATFORM.md). Decisions that shaped either are recorded as [ADRs](./docs/adr/).

## What's in this repo

| Path | Contents |
|---|---|
| `src/` | Language core — lexer, parser, static checker, interpreter, identity-graph runtime, hash-chained journal (`store.js`), signed receipts (`sign.js`), governed decode bridge (`bridge.js`), per-token governed decode (`decode.js`) |
| `provision/` | Provisioning service — HTTP + MCP endpoint, natural-language attribute resolver, caller recognition (`whoami`), governed AI decode, service OpenAPI, CLI, Dockerfile |
| `spec/` | **Platform contract** — `openapi.yaml` (v0.2.0), validated in CI, published at [id-me.ai](https://id-me.ai) |
| `programs/` | Reference IGL programs — a company BOUNDARY graph and an individual FOOTPRINT graph |
| `test/` | 131-test suite: bridge, decode, extract, graph, igl, sign, store |
| `docs/` | Language specification (`SPEC.md`), graph model (`GRAPH.md`), decode bridge (`BRIDGE.md`), deliberate exclusions (`SCOPE.md`), platform mapping (`PLATFORM.md`), architecture decision records (`adr/`) |
| `examples/` | Runnable end-to-end flows, including journal persistence and replay |

## Quick start

```bash
git clone https://github.com/SMEPro-Technologies-LLC/igl.git
cd igl
npm ci
npm test            # 131 tests — bridge, decode, extract, graph, igl, sign, store
```

Run a governed program end to end (model decode inside the compiled footprint mask):

```bash
node examples/run-igl-language-live.mjs
```

Start the provisioning service (HTTP on :8787, MCP at `POST /mcp`):

```bash
npm run provision
```

When exposing the provisioning service to a browser client, set `PROVISION_ALLOWED_ORIGINS` (comma-separated) to explicitly allow trusted Origins for CORS responses.

Provision an identity graph from a plain-language description:

```bash
node provision/cli.mjs "Example Energy, LLC is a Texas oil and gas operator"
```

Validate the platform contract locally (the same check CI runs):

```bash
npx --yes @redocly/cli@1 lint spec/openapi.yaml
```

## What a program looks like

From `programs/jordan-avery-dfir-footprint.igl` — an individual FOOTPRINT graph:

```igl
ID[Jordan_Avery:DFIR_Coordinator | Action:draft-incident-report]
  :: Intent[Execute_DFIR_Action]
  => Context[Traces=None],
     Compute[
       AI.Extract(Slots=[dfir_action], Model=distilgpt2-local, Seed=9),
       ...
     ]
```

The same file contains a second statement asserting `Action:restore-production-systems` — an action the graph has *observed* five times but never *granted*. The runtime refuses it at the authorization phase with `IGL_FOOTPRINT_DENIED`, before any model work is paid for. Observation is not authority.

## The four guarantees

1. **No identity, no execution.** The runtime refuses unidentified work.
2. **Out-of-boundary actions don't run.** Boundary violations are errors at check time and at run time, not warnings.
3. **Intent is part of the record.** Every trace carries the declared purpose it was executing.
4. **The trace is tamper-evident — and selectively disclosable.** Journal entries are SHA-256 hash-chained; a chain that was altered after capture fails verification and refuses to load. Merkle inclusion proofs let an auditor verify a single disclosed entry against a published root without seeing the rest of the journal, and every signed receipt carries the digest of the runtime build that produced it.

## Governance model

Authority is assigned by how knowledge entered the graph, never by what a payload claims about itself:

| Layer | Meaning | Can become authority? |
|---|---|---|
| `granted` | Signed, prescriptive grant (e.g. by a CISO office) | It **is** authority |
| `observed: governing` | Deterministic tooling attestation, anchored and replayable | Promotion candidate — not yet authority |
| `observed: proposed` | AI-class observation | **Can never promote** — a model's say-so is not ground truth |

The decode automaton is compiled from the granted set only. At trace level, the weakest provenance link governs. The platform contract carries the same ladder as `seed → proposed → certified` on facts, evidence and relationships, and `attested | proposed` on obligations.

## AI clients

`provision/mcp.mjs` is a Model Context Protocol endpoint. An MCP-capable client connects with a caller key and is recognized on contact: first contact seeds the caller's identity graph from the registered profile; every contact after that replays the hash-chained journal. The caller's grants and refusals then govern every tool call in that session. The platform's MCP surface (`whoami`, `list_purposes`, `get_identity_context`, `explain_projection`, `list_obligations`, `search_graph`, `record_interaction`) is specified alongside its REST equivalents in [`docs/PLATFORM.md`](./docs/PLATFORM.md).

## Project

- **Platform and documentation:** [id-me.ai](https://id-me.ai)
- **Releases:** tagged and signed; see [CHANGELOG.md](./CHANGELOG.md) and [GitHub Releases](https://github.com/SMEPro-Technologies-LLC/igl/releases)
- **Support:** [SUPPORT.md](./SUPPORT.md) · **Security:** [SECURITY.md](./SECURITY.md) · **Latest security audit:** [docs/audit/SECURITY-AUDIT-2026-10.md](./docs/audit/SECURITY-AUDIT-2026-10.md) · **Governance:** [GOVERNANCE.md](./GOVERNANCE.md) · **Contributing:** [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Roadmap:** tracked in [issues labelled `roadmap`](https://github.com/SMEPro-Technologies-LLC/igl/issues?q=label%3Aroadmap). Planned and not yet in this repository: a WASM core and browser playground, Python and TypeScript SDKs, and the policy-pack registry. The README only describes what exists.

## License and IP

- Code and the platform contract in this repository are licensed under **Apache License 2.0** — see [LICENSE](./LICENSE).
- **IGL**, the IGL logo, and "Identity Governed Logic" are trademarks of SMEPro Technologies LLC — see [TRADEMARK.md](./TRADEMARK.md). The license covers the code, not the name.
- Certain governance mechanisms are the subject of pending patent applications. Apache 2.0's patent grant applies as stated in the license.
- Contributions require a DCO sign-off — see [CONTRIBUTING.md](./CONTRIBUTING.md).

---

*Where the industry is shipping the engines, IGL is the law the engines run under.*
