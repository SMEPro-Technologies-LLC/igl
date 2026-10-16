# Instructions for Copilot in this repository

IGL is a governance runtime. The guarantees it makes (identity, boundary, intent, trace) hold only if the implementation is disciplined, so reviews and generated code follow the rules below. They restate [CONTRIBUTING.md](../CONTRIBUTING.md) in the form a reviewer or a coding agent needs.

## What the repository is

- `src/` is the runtime: the IGL language interpreter, the hash-chained journal (`MemoryJournal`, `FileJournal`, `D1Journal` in `store.js`), Ed25519 receipts (`sign.js`), the identity, boundary and model runtimes. Pure Node 20+, ES modules, no build step.
- `platform/api/` is the platform service (Cloudflare Workers, D1), the contract in `spec/openapi.yaml`, and the conformance suite in `platform/api/test/conformance.test.mjs` that runs every contract operation against a live service.
- `platform/site/` is id-me.ai. `index.html` is generated in part by `gen_reference.py` from the contract; the static pages come from `gen_pages.py`. Edit the generators and regenerate, never the generated sections by hand.
- `provision/` is the local provisioning service and CLI, which load the pinned model from `provision/model.mjs`.

## Tests

- Framework: `node:test` with `node:assert/strict`. No Jest, Vitest or Mocha; do not add a test runner.
- Runtime tests live in `test/*.test.js` and are listed explicitly in the `test` script of `package.json`. A new test file is not run until it is added there.
- Platform tests are the conformance suite. It validates every response body against the schema the contract declares, and fails if any contract operation is not exercised. A new operation needs a contract entry, a handler, and coverage in that suite, all in the same PR.
- No mocks of IGL's own components. Tests run the real interpreter, the real journal (in memory or in a temp directory), the real signer. The only thing stubbed is the model call (`invoke: async () => ({ text, confidence })`), because the model is a replaceable component behind the graph.
- Tests assert behavior that a user of the runtime can observe (status, journal entries, receipt verification, refusal codes), not implementation details.
- Run `npm run check` before proposing a change: ESLint, `tsc --checkJs`, and the full suite must pass.

## Invariants a review must enforce

- Provenance is assigned by capture route, never by what a payload says about itself ([ADR 0002](../docs/adr/0002-provenance-assigned-by-capture-route.md)). Code that upgrades a lower provenance class to a higher one is rejected.
- Canonicalization is law for anything hashed or signed: sorted keys, no whitespace, via `canonical()` in `src/sign.js`.
- Journals are append-only. Snapshots returned to callers are frozen; code that needs to mutate an entry copies it first.
- Refusals are records. A denied or escalated action produces the same signed, chained receipt a success does, with the rule that fired, the identity and object it fired on, and the policy as it stood.
- Nothing runs outside the four bindings. A statement is checked against its identity's footprint (`IGL_FOOTPRINT_DENIED`), its boundary and its declared intent (`IGL_UNKNOWN_INTENT`) before any compute runs, and a trace that cannot be written halts the statement (`IGL_TRACE_FAILED`). Code that lets one of these be skipped or defaulted is rejected.
- Secrets never enter the tree: no keys, tokens, `.dev.vars`, or `provision/identities.mjs`. Flag any literal that looks like a credential.

## Contract changes

- `spec/openapi.yaml` is the source of truth. A change there bumps the version (additive: minor; breaking: new `/v{n}` base path), passes `npx --yes @redocly/cli@1 lint spec/openapi.yaml`, and is reflected in `spec/README.md`, `CHANGELOG.md`, the conformance suite, and the regenerated site reference.
- The served copy at `platform/site/igl-openapi.yaml` is produced by the deploy workflow; do not edit it by hand.

## Commits and pull requests

- Every commit carries a `Signed-off-by` line (`git commit -s`); the DCO workflow fails otherwise.
- One concern per PR. Follow `.github/PULL_REQUEST_TEMPLATE.md`.
- Write in plain prose: short sentences, no marketing adjectives, no claims the code does not back. Documentation describes what runs, not what is planned.
