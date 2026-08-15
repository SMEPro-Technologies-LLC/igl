# IGL v1.0.0-ref

First public release of the IGL reference implementation.

IGL (Identity Governed Logic) is a coding language for artificial intelligence
in which governance is a numeric computation the runtime performs and fuses
with the model's own computation, before output exists. Identity is the zeroth
operand of every statement. The governing constraint arrives from a live
service as a digested matrix, is applied by FUSE (support restriction) and a
graded boundary check, and every governed turn seals an Ed25519 receipt that a
third party can verify from the artifact alone.

## What this release contains

The `igl-v1` reference runtime: lexer, parser, static checker, interpreter, and
the IOS+ orchestrator, conformant to the five Schedule C sample programs and
covered by an adversarial suite (tamper detection, fail-closed behavior,
support restriction, delegation denial, static rejection).

Live governance binding: `src/udm.js` and `src/govern.js` bind to the deployed
constraint service, verify against its published digest, and enforce graded
ceilings after FUSE. Hermetic tests run against pinned wire captures of the
real matrices; a scheduled job re-proves the live binding daily and a committed
receipt (`igl-v1/artifacts/receipt.live.json`) verifies from the file alone.

Governed decoding: FUSE inside a token-by-token decode loop (`src/decoder.js`),
where a prohibited token carries zero probability at every step and can never
be sampled, with the per-token cognitive trace sealed into a hash chain, signed,
and independently recomputable. A drop-in logits processor wires the same
governance into external decoders.

The governed-decode gateway: an OpenAI-compatible surface
(`src/gateway.js`, deployable from `igl-v1/workers/igl-gateway`) that returns
standard chat completions with a signed governance receipt attached, and
refuses with a sealed receipt when a turn would cross a governed boundary.

A worked regulated workflow: the WellSite production-filing pipeline
(`src/filing.js`), two chained governed turns producing an auditor-verifiable
filing record, aborting with no record when a turn cannot be governed.

## The decision record

ADR 0001 fixes the canonical governance model: the deployed graded matrix is
the live source, receipts must bind the service-published digest and carry
provenance, and production receipts require persistent keys.

ADR 0002 fixes the authority law and supersedes ADR 0001 decision 3: structural
composition is MIN-intersection, so no arrangement of identity-graph edges can
ever raise authority, and explicit delegation is the only escalation, clamped
to min(declared, resolved) of the target and always audited.

## Status, stated plainly

This is a reference implementation with its conformance suite as the bar
(138 checks across 12 suites at release). It is not yet a production service:
the external security review, scale testing, managed key service, and a bounded
pilot are open and tracked in `docs/RELEASE_CHECKLIST.md`. Receipts signed by
the development seeds in the run scripts are demonstrations, not production
attestations.

## License

Apache-2.0, with NOTICE. The IGL name is a trademark tied to the conformance
suite; see TRADEMARKS.md. Vulnerability reports: see SECURITY.md.
