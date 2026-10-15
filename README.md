# IGL: Identity Governed Logic

IGL is a Node.js language and runtime for running computations under a declared identity, action boundary, and intent. It checks requests before execution and records permitted work in a tamper-evident journal.

Every IGL program binds four things to each computation:

- **Identity:** who or what is acting
- **Boundaries:** what it may and may not do, checked while the program runs
- **Intent:** the reason for the action
- **Trace:** an append-only journal that records each step and links entries with hashes

Programs without a declared identity cannot run. The runtime blocks actions outside the declared boundary before model work starts.

For work sent through IGL, the runtime mediates calls between the caller and the model, checks each request against its declared boundaries, and records the result. This repository implements that enforcement mechanism.

## What's in this repo

| Path | Contents |
|---|---|
| `src/` | Language core: lexer, parser, static checker, interpreter, identity-graph runtime, hash-chained journal (`store.js`), signed receipts (`sign.js`), governed decode bridge (`bridge.js`), and per-token governed decode (`decode.js`) |
| `provision/` | Provisioning service: HTTP and MCP endpoints, attribute resolver, caller recognition (`whoami`), governed AI decode, OpenAPI specification, CLI, and Dockerfile |
| `programs/` | Reference IGL programs: a company BOUNDARY graph and an individual FOOTPRINT graph |
| `test/` | 131-test suite: bridge, decode, extract, graph, igl, sign, store |
| `docs/` | Language specification and architecture notes |
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

## What a program looks like

From `programs/jordan-avery-dfir-footprint.igl`, an individual FOOTPRINT graph:

```igl
ID[Jordan_Avery:DFIR_Coordinator | Action:draft-incident-report]
  :: Intent[Execute_DFIR_Action]
  => Context[Traces=None],
     Compute[
       AI.Extract(Slots=[dfir_action], Model=distilgpt2-local, Seed=9),
       ...
     ]
```

The same file contains a second statement requesting `Action:restore-production-systems`. The graph has *observed* this action five times but never *granted* it. The runtime blocks it during authorization with `IGL_FOOTPRINT_DENIED`, before calling the model. Observation alone does not grant authority.

## The four guarantees

1. **No identity, no execution.** The runtime refuses unidentified work.
2. **Out-of-boundary actions don't run.** Boundary violations are errors at check time and at run time, not warnings.
3. **Intent is part of the record.** Every trace carries the declared purpose it was executing.
4. **The trace is tamper-evident and supports selective disclosure.** Journal entries are linked with SHA-256 hashes. Verification fails if an entry changes after capture. This proves the integrity and order of recorded entries, but not that every event was captured. Grants and observations therefore enter only through attested routes (see below). Merkle inclusion proofs let an auditor verify one disclosed entry against a published root **without seeing the rest of the journal**. Signed receipts also include a digest of the runtime build, which anyone can recompute to identify the build that signed the receipt.

## Governance model

Authority is assigned by how knowledge entered the graph, never by what a payload claims about itself:

| Layer | Meaning | Can become authority? |
|---|---|---|
| `granted` | Signed, prescriptive grant (e.g. by a CISO office) | It **is** authority |
| `observed: governing` | Deterministic tooling attestation, anchored and replayable | Promotion candidate — not yet authority |
| `observed: proposed` | AI-class observation | **Can never promote** — a model's say-so is not ground truth |

The decode automaton is compiled from the granted set only. At trace level, the weakest provenance link governs.

## AI clients

`provision/mcp.mjs` is a Model Context Protocol endpoint. An MCP-capable client (e.g. ChatGPT developer-mode connectors) connects with a caller key and is recognized on contact: first contact seeds the caller's identity graph from the registered profile; every contact after that replays the hash-chained journal. The caller's grants and refusals then govern every tool call in that session.

## Roadmap

Shipped in 1.0.0 is the Node.js reference runtime above. Planned and **not yet in this repository**: a WASM core and browser playground, Python and TypeScript SDKs, and the policy-pack registry. Roadmap items are tracked in issues; the README only describes what exists.

## License and IP

- Code in this repository is licensed under **Apache License 2.0**. See [LICENSE](./LICENSE).
- **IGL**, the IGL logo, and "Identity Governed Logic" are trademarks of SMEPro Technologies LLC. See [TRADEMARK.md](./TRADEMARK.md). The license covers the code, not the name.
- Certain governance mechanisms are the subject of pending patent applications. Apache 2.0's patent grant applies as stated in the license.
- Contributions require a DCO sign-off. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Links

- Language specification: [docs/SPEC.md](./docs/SPEC.md)
- Security reports: [SECURITY.md](./SECURITY.md)

---

*Where the industry is shipping the engines, IGL is the law the engines run under.*
