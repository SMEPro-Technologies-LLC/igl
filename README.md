# IGL — Identity Governed Logic

**Intelligence has to identify itself, declare its boundaries, and state its intent before it thinks. Not after. Not when something goes wrong. Before.**

IGL is a coding language and runtime built around one rule: governance is not a policy document taped to the side of the machine. It is the syntax. Every IGL program binds four things into the computation itself:

- **Identity** — you always know who or what is acting
- **Boundaries** — what it may and may not do, declared up front and enforced while it runs
- **Intent** — the reason for the action, on the record
- **Trace** — a hash-chained, append-only journal of every step taken, so "what happened" is never a debate

An actor that hasn't declared its identity can't execute. An action outside the declared boundary doesn't get a warning — it doesn't run.

This holds for work routed through an IGL runtime: the runtime sits between the caller and the model, makes the calls, and can refuse, scope, and log them. That is the enforcement mechanism, and it is the one this repository implements.

## What's in this repo

| Path | Contents |
|---|---|
| `src/` | Language core — lexer, parser, static checker, interpreter, identity-graph runtime, hash-chained journal (`store.js`), signed receipts (`sign.js`), governed decode bridge (`bridge.js`) |
| `provision/` | Provisioning service — HTTP + MCP endpoint, natural-language attribute resolver, caller recognition (`whoami`), governed AI decode, OpenAPI spec, CLI, Dockerfile |
| `programs/` | Reference IGL programs — a company BOUNDARY graph and an individual FOOTPRINT graph |
| `test/` | 124-test suite: bridge, extract, graph, igl, sign, store |
| `docs/` | Language specification and architecture notes |
| `examples/` | Runnable end-to-end flows, including journal persistence and replay |

## Quick start

```bash
git clone https://github.com/SMEPro-Technologies-LLC/igl.git
cd igl
npm ci
npm test            # 124 tests — bridge, extract, graph, igl, sign, store
```

Run a governed program end to end (model decode inside the compiled footprint mask):

```bash
node examples/run-igl-language-live.mjs
```

Start the provisioning service (HTTP on :8787, MCP at `POST /mcp`):

```bash
npm run provision
```

Provision an identity graph from a plain-language description:

```bash
node provision/cli.mjs "Example Energy, LLC is a Texas oil and gas operator"
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
4. **The trace is tamper-evident — and selectively disclosable.** Journal entries are SHA-256 hash-chained; a chain that was altered after capture fails verification and refuses to load. The chain proves integrity and ordering of what was captured — completeness of capture is a property of the capture layer, which is why grants and observations enter only through attested routes (see below). On top of the chain, Merkle inclusion proofs let an auditor verify a single disclosed entry against a published root **without seeing the rest of the journal**, and every signed receipt carries the digest of the runtime build that produced it — which runtime signed a receipt is settled by re-computation, not confidence.

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

- Code in this repository is licensed under **Apache License 2.0** — see [LICENSE](./LICENSE).
- **IGL**, the IGL logo, and "Identity Governed Logic" are trademarks of SMEPro Technologies LLC — see [TRADEMARK.md](./TRADEMARK.md). The license covers the code, not the name.
- Certain governance mechanisms are the subject of pending patent applications. Apache 2.0's patent grant applies as stated in the license.
- Contributions require a DCO sign-off — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Links

- Language specification: [docs/SPEC.md](./docs/SPEC.md)
- Security reports: [SECURITY.md](./SECURITY.md)

---

*Where the industry is shipping the engines, IGL is the law the engines run under.*
