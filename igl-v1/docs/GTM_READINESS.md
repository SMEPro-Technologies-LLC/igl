# GTM and production readiness — recap and what remains

Honest status as of 2026-08-13. This separates what is built and checkable from
what still has to happen before IGL can be called production and go-to-market
ready. A long remaining list on a young system is normal; the point is that the
list is real and nothing here is claimed as done that is not.

## What is built and green (in the sandbox tree, pending push)

- IGL v1.0 reference runtime: lexer, parser, static checker, interpreter, IOS+.
- Conformance to the five Schedule C sample programs.
- WellSite rebuilt as an IGL v1.0 program, executes, and its receipt verifies.
- Adversarial suite: tamper detection, fail-closed, support restriction,
  delegation denial, static rejection.
- Multi-vendor model layer (OpenAI, Anthropic, Gemini, xAI, Mistral, DeepSeek,
  Llama), proven identical governance across vendors in mock; live behind keys.
- Determination engine: the entailment model, four-outcome resolution contract,
  re-verifiable receipts. (Non-canonical per ADR 0001.)
- Live service binding: `src/udm.js` and `src/govern.js` bound to the deployed
  `udm.igl.dev` matrix and its digest, with the boundary-ceiling check closed,
  tested against the real US-TX/RRC and EU/EDPB matrices as pinned fixtures.
- Persistent signing keys (`Signer.fromSeed`) so receipts verify across sessions.
- Total: about 74 checks green locally.

## What is NOT yet true (do not claim these)

- The runtime does not yet govern against the live service by default. The
  interpreter's FUSE path still uses the stand-in until it is switched to
  `src/udm.js` in the execution surface.
- No receipt has been produced against the live digest `1252a4e5...` in a
  networked run. The digest match is proven against a pinned fixture, not the wire.
- The green suite is not yet verified in CI on this branch. It must land and pass
  on GitHub's runners before "green" counts by the same standard we hold the
  digest to.

## Remaining before production and GTM

### P0 — correctness and truth of the core claims
1. Land the current tree as PR #12 and let CI (including `test/udm.mjs` and
   `test/govern.mjs`, hermetic) pass on GitHub. Until then, main binds to the
   100-table DB via `src/d1.js`.
2. Produce the live digest artifact: run `run-govern.mjs` from a Worker or a
   networked host, commit `out/governed-receipt.json`, and let `verify-governed.mjs`
   check it. That makes `constraintMatrixDigest === 1252a4e5...` a third-party fact.
3. Switch the execution surface (`workers/igl-api`) FUSE path to `src/udm.js` so
   the deployed runtime governs against the live matrix, not the stand-in.
4. Resolve the authority semantics (ADR open item): INHERITS_FROM raise-to-max vs
   delegation min-clamping. Pick one, encode it, test both sample paths.
5. Reconcile the three runtimes per ADR 0001: d1-igl authority, igl-v1 reference,
   igl-api surface; park the entailment design explicitly.

### P1 — assurance and operability
6. Key management: move the signing seed to a KMS or Worker secret; publish the
   public key to a key directory; rotation and revocation.
7. Independent security review of the crypto and the runtime, and a written threat
   model review (docs/THREAT_MODEL.md exists; get it reviewed by someone external).
8. Scale and soak testing of the matrix fetch, the receipt chain, and the audit
   store at production trace volumes.
9. Real model integration behind the vendor seam for any AI rendering step, with
   the boundary check enforced on generated output.

### P2 — product and go-to-market
10. Compliance and evidentiary position by counsel per target jurisdiction: how a
    Governance Receipt is treated as evidence, data handling, retention.
11. SLAs, runbook, monitoring, alerting, backups for the deployed surface.
12. Licensing and ownership cleanup (still `UNLICENSED`; owner named
    inconsistently across materials).
13. A bounded production pilot with a real filing and a real user, then GA.
14. Reconcile the public materials (whitepaper, site) to the deployed model, so
    the marketing describes the matrix-and-FUSE system that is actually live.

## The one-line GTM status

The runtime is a strong, tested reference that now has a real client bound to the
live governance matrix and a closed boundary check. It is not yet the deployed
execution path, no live digest receipt exists yet, and the code is not yet landed
in CI. Those three P0 items, plus the authority decision and the runtime
reconciliation, are the gate to calling it production ready. The rest is the
normal assurance, scale, and commercial work that follows.
EOF
echo "GTM doc written"