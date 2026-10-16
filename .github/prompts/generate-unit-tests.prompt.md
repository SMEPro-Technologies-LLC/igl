---
agent: 'agent'
description: 'Generate node:test unit tests for a runtime function, in the style of test/*.test.js'
---

## Task

Analyze the selected function or method and write focused `node:test` tests that validate its observable behavior. Follow the conventions in `.github/copilot-instructions.md`.

## Framework and placement

- `import { test } from "node:test"` and `import assert from "node:assert/strict"`. No other test runner or assertion library.
- Put the tests in the existing file for that module under `test/` (for example `test/store.test.js` for `src/store.js`). Create a new file only if no file for the module exists, and then add it to the `test` script in `package.json`, or it will not run.
- Platform handlers in `platform/api/src/` are not unit tested in isolation. They are covered by the conformance suite in `platform/api/test/conformance.test.mjs`, which runs against a live service and validates every response against the contract. For a handler, extend that suite instead.

## Rules

- No mocks of IGL's own components. Use the real `Interpreter`, `IOSRuntime`, `MemoryJournal` (or `FileJournal` in a `mkdtempSync` directory), `Signer`, `IdentityRuntime` and `UDMRuntime`. The one permitted stub is the model: `new AIRuntime({ models, invoke: async () => ({ text: "ok", confidence: 0.9 }) })`.
- Assert what a caller can observe: statement status, journal entries and their order, receipt verification results, refusal codes such as `IGL_FOOTPRINT_DENIED`, thrown error names and messages. Do not assert private fields.
- Journal snapshots are frozen. A test that needs a tampered entry builds a replacement entry; it does not mutate the snapshot.
- Anything hashed or signed goes through `canonical()` from `src/sign.js`; compute expected digests with it rather than hand-written JSON.
- Each test is independent: its own runtime, its own journal, its own temp directory. No shared mutable state between tests, so they can run in any order.

## What to cover

Write 5 to 8 tests, each a single sentence of intent in its name, in this order of priority:

1. The main behavior with realistic inputs: a complete IGL program (see the `prog()` helper in `test/audit.test.js`), real boundary values, a real actor and role.
2. Refusals: the input that must be refused, and the exact code and record the refusal leaves behind (a refusal is a journal entry and a receipt, not an exception swallowed).
3. Boundaries and edges: empty context, zero-length selections, unknown rulesets, a second run of the same statement (idempotent replay versus new work).
4. Integrity: the journal verifies after the operation; a tampered or reordered entry fails `verify()`; a receipt verifies against the chain head.
5. Durability where the function touches persistence: pending versus durable entries, rollback on a failed flush, checkpoint refusal.

## Output

The test code only, ready to paste into the target file, with a one-line comment above any setup that is not obvious. Then run `npm test` and report the result.

Target function: ${input:function_name:Which function or method should be tested?}
