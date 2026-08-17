# IGL — Identity Governed Logic

**Intelligence has to identify itself, declare its boundaries, and state its intent before it thinks. Not after. Not when something goes wrong. Before.**

IGL is a coding language, the same way Python or Visual Basic is a coding language — but built around one rule that changes everything: governance is not a policy document taped to the side of the machine. It is the syntax.

Every IGL program binds four things into the computation itself:

- **Identity** — you always know who or what is acting
- **Boundaries** — what it may and may not do, declared up front and enforced while it runs
- **Intent** — the reason for the action, on the record
- **Trace** — a signed, append-only log of every step taken, so "what happened" is never a debate

An agent that hasn't declared its identity can't execute. An action outside the declared boundary doesn't get a warning — it doesn't run.

## Why IGL exists

Distribution is solved. Governance isn't. Open weights and local models are putting real reasoning ability on every desk and every laptop. That's the largest ungoverned deployment of autonomous capability in history. Knowing what a model *is* tells you nothing about what it *did* last Tuesday at 3 a.m. while negotiating on your behalf.

Every time computing crossed a threshold like this, we built a structure layer: CUDA made raw compute programmable. Ethereum made state verifiable between parties who don't trust each other. Kubernetes made millions of workloads controllable. Intelligence is crossing that threshold now. IGL is the structure layer.

Openness tells you what a mind is made of. Governance tells you what it's accountable for. The future only works if both exist.

## What's in this repo

| Path | Contents |
|---|---|
| `spec/` | The IGL language specification (v1.0) — free to read, forever |
| `core/` | Parser, compiler, and the Fuse Turn governed execution runtime (WASM) |
| `sdk/python/` | Python SDK — governed execution for existing codebases |
| `sdk/typescript/` | TypeScript SDK |
| `trace/` | Trace schema, hash-chain primitives, content-addressed segment model |
| `mcp/` | MCP resource server — `udm://segment/<hash>` retrieval and verification |
| `playground/` | Browser playground (runs the WASM core, no install) |

## Quick start

```bash
# Install the CLI and runtime
npm install -g igl-lang        # or: pip install igl-lang

# Write your first governed program
cat > hello.igl <<'EOF'
identity agent://my-org/research-assistant
boundary {
  allow: read(knowledge_base)
  deny:  write(*), network(external)
}
intent "Summarize the Q3 regulatory filings for internal review"

run {
  docs = retrieve(knowledge_base, query="Q3 filings")
  answer = model.summarize(docs)
  emit(answer)
}
EOF

# Governed execution — identity, boundary, and intent checked before the first step runs
igl run hello.igl

# Inspect the signed trace of everything that just happened
igl trace last --verify
```

## The four guarantees

1. **No identity, no execution.** The runtime refuses unsigned, unidentified work.
2. **Out-of-boundary actions don't run.** Boundary violations are compile-time and run-time errors, not warnings.
3. **Intent is part of the record.** Every trace carries the declared purpose it was executing.
4. **The trace proves itself.** Segments are SHA-256 hash-chained and content-addressed (`udm://segment/<hash>`). Anyone holding a segment can re-verify it. No trusted party required — the math proves itself.

## Provenance model

IGL assigns provenance by capture route, never by what a payload claims about itself:

| Tag | Meaning |
|---|---|
| `observed:hook` | Out-of-band execution capture — ground truth |
| `observed:proxy` | API stream interception |
| `observed:extension` | Browser-rendered extraction |
| `reported:model` | Model self-report — can never be upgraded to observed |
| `derived:transcript` | Post-hoc reconstruction — subordinate to observed |

## Ecosystem

- **Policy Packs** — pre-built, signed boundary graphs for regulated domains (oil & gas, higher education, healthcare, finance). Registry at [igl.dev/packs](https://igl.dev/packs).
- **IGL Gateway** — enterprise governed-execution at the API gateway level. Commercial; see [igl.dev/enterprise](https://igl.dev/enterprise).
- **Trace Dashboard** — auditor-facing timeline UI with determinacy encoding and evidence export.

## License and IP

- Code in this repository is licensed under **Apache License 2.0** — see [LICENSE](./LICENSE).
- **IGL**, the IGL logo, and "Identity Governed Logic" are trademarks — see [TRADEMARK.md](./TRADEMARK.md). The license covers the code, not the name.
- Certain governance mechanisms are the subject of pending patent applications. Apache 2.0's patent grant applies as stated in the license.
- Contributions require a DCO sign-off — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Links

- Spec: [igl.dev/spec](https://igl.dev/spec)
- Playground: [igl.dev/play](https://igl.dev/play)
- Security reports: [SECURITY.md](./SECURITY.md)

---

*Where the industry is shipping the engines, IGL is the law the engines run under.*
