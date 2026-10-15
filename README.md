# IGL: Identity Governed Logic

IGL is a language and runtime for programs that declare who is acting, what the action may affect, and why it is being taken before execution begins.

Each IGL program records four things as part of the computation:

- **Identity**: who or what is acting
- **Boundary**: what the actor is allowed to do
- **Intent**: why the action is being taken
- **Trace**: an append-only, hash-chained record of the steps taken

The runtime rejects work without an identity and stops actions outside the declared boundary.

For work routed through IGL, the runtime sits between the caller and the model. It makes the calls, checks their scope, and records or rejects them. This repository contains that runtime.

## What's in this repo

| Path | Contents |
|---|---|
| `src/` | Language core: lexer, parser, checker, interpreter, graph runtime, journal, signed receipts, and governed decoding |
| `provision/` | Provisioning service with HTTP and MCP endpoints, an attribute resolver, caller recognition, CLI, and OpenAPI specification |
| `programs/` | Example company BOUNDARY and individual FOOTPRINT programs |
| `test/` | Tests for the bridge, decoding, extraction, graph, language, signing, and journal |
| `docs/` | Language specification and architecture notes |
| `examples/` | Runnable end-to-end flows, including journal persistence and replay |

## Quick start

Requires Node.js 20 or later.

```bash
git clone https://github.com/SMEPro-Technologies-LLC/igl.git
cd igl
npm ci
npm test
```

The first example or service run downloads the model if it is not already
cached, so an internet connection is needed for that initial download.

Run an end-to-end program that decodes model output inside the compiled footprint:

```bash
node examples/run-igl-language-live.mjs
```

Start the provisioning service. It listens on port 8787 and provides the MCP endpoint at `POST /mcp`:

```bash
npm run provision
```

Open <http://localhost:8787> in a browser to use the Studio.

If a browser client will connect to the service, set `PROVISION_ALLOWED_ORIGINS` to a comma-separated list of allowed origins.

Provision an identity graph from a plain-language description:

```bash
node provision/cli.mjs "Example Energy, LLC is a Texas oil and gas operator"
```

## Connect an MCP client

The provisioning service exposes an MCP endpoint at `http://localhost:8787/mcp`.
Before connecting a client, copy `provision/identities.example.mjs` to
`provision/identities.mjs` and replace the example key and profile with your
caller's details. The local identity file is ignored by Git so caller keys are
not committed.

If you expose the service outside your computer, set `PROVISION_API_KEY` and
configure `PROVISION_ALLOWED_ORIGINS` for browser clients. Use
`identity_graph_whoami` to identify a registered caller before using other MCP
tools.

## What a program looks like

This example comes from `programs/jordan-avery-dfir-footprint.igl`, an individual FOOTPRINT graph:

```igl
ID[Jordan_Avery:DFIR_Coordinator | Action:draft-incident-report]
  :: Intent[Execute_DFIR_Action]
  => Context[Traces=None],
     Compute[
       AI.Extract(Slots=[dfir_action], Model=distilgpt2-local, Seed=9),
       ...
     ]
```

The file also includes a statement for `Action:restore-production-systems`. The graph has observed this action five times, but it has not been granted. The runtime returns `IGL_FOOTPRINT_DENIED` before calling the model. Observations do not grant permission.

## The four guarantees

1. **No identity, no execution.** The runtime refuses unidentified work.
2. **Out-of-boundary actions don't run.** Boundary violations are errors at check time and at run time, not warnings.
3. **Intent is part of the record.** Every trace carries the declared purpose it was executing.
4. **The trace can be verified and selectively disclosed.** Journal entries are linked with SHA-256 hashes. If an entry changes, verification fails and the journal will not load. This verifies the integrity and order of captured entries; the capture layer is responsible for completeness. Grants and observations therefore enter through attested routes. Merkle inclusion proofs let an auditor verify one entry against a published root without seeing the rest of the journal. Signed receipts include the digest of the runtime build that produced them, which can be checked by recomputing the digest.

## Governance model

Authority is assigned by how knowledge entered the graph, never by what a payload claims about itself:

| Layer | Meaning | Can become authority? |
|---|---|---|
| `granted` | Signed, prescriptive grant (e.g. by a CISO office) | It **is** authority |
| `observed: governing` | Deterministic tooling attestation that can be replayed | Eligible for review, but not authority |
| `observed: proposed` | Model-generated observation | Cannot become authority on its own |

The decode automaton is compiled from the granted set only. At trace level, the weakest provenance link governs.

## AI clients

`provision/mcp.mjs` is a Model Context Protocol endpoint. An MCP-capable client (e.g. ChatGPT developer-mode connectors) connects with a caller key and is recognized on contact: first contact seeds the caller's identity graph from the registered profile; every contact after that replays the hash-chained journal. The caller's grants and refusals then govern every tool call in that session.

## Planned work

This repository contains the Node.js reference runtime. A WASM core, browser
playground, Python and TypeScript SDKs, and policy-pack registry are planned but
are not included here. Track progress in the project issues.

## License and IP

- Code in this repository is licensed under **Apache License 2.0**. See [LICENSE](./LICENSE).
- **IGL**, the IGL logo, and "Identity Governed Logic" are trademarks of SMEPro Technologies LLC. See [TRADEMARK.md](./TRADEMARK.md). The license covers the code, not the name.
- Certain governance mechanisms are the subject of pending patent applications. Apache 2.0's patent grant applies as stated in the license.
- Contributions require a DCO sign-off. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Links

- Language specification: [docs/SPEC.md](./docs/SPEC.md)
- Security reports: [SECURITY.md](./SECURITY.md)

---

IGL provides governance checks for programs that use models.
