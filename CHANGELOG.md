# Changelog

All notable changes to IGL are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[SemVer](https://semver.org/).

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
