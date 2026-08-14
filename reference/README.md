# IGL v1.0 reference runtime, with WellSite rebuilt on it

This is a working reference implementation of the IGL v1.0 language defined in
the specification instrument IGL-SPEC-2026-001, together with the WellSite
production filing logic expressed as an IGL v1.0 program and executed on it.

Before this, v1.0 existed as a specification with no runtime. This builds the
runtime, validates it against the five normative sample programs in Schedule C,
and then rebuilds WellSite's governed logic on it so that a real filing produces
a signed Governance Receipt that a third party can verify from the artifact
alone.

## What runs

```
src/lexer.js         tokens for the block grammar of Schedule A
src/parser.js        recursive-descent parser to an AST
src/check.js         static checks: block structure, INJECT before inference,
                     RECURSE depth, one terminal CAPTURE
src/iosplus.js       IOS+ orchestrator: identity resolution and authority
                     resolution, constraint matrix provision, receipt signing,
                     trace logging, sequence numbers (Section 10.04)
src/sign.js          Ed25519 Governance Receipts, canonical JSON, standalone verify
src/interpreter.js   the eight operators, boundary enforcement, cognitive trace
                     sealing, turn-trace sequencing, receipt issuance

programs/wellsite.igl   WellSite production filing as an IGL v1.0 program
test/samples.mjs        the five Schedule C sample programs
run-wellsite.mjs        executes WellSite and prints the governed ledger
verify-receipt.mjs      verifies the emitted receipt from the artifact alone
```

Added in the hardening pass:

```
src/adapters.js         model seam: logprobs, logits, and uniform adapters
test/suite.mjs          adversarial suite: tamper, fail-closed, delegation, static
test/adapters.mjs       FUSE driven by an adapter-supplied distribution
docs/THREAT_MODEL.md    assets, trust boundaries, what receipts do and do not prove
docs/PRODUCTION_READINESS.md   staged path to production and independent vetting
.github/workflows/ci.yml       runs every suite on push
```

## Run

```
npm test                   # 5 conformance + 19 adversarial + 9 adapter checks
node test/samples.mjs      # 5 of 5 Schedule C programs: parse, execute, verify
node run-wellsite.mjs      # WellSite governed session, writes out/receipt.json
node verify-receipt.mjs    # independent check using only receipt + public key
```

## Cross-vendor proof: IGL governs AI, not one model

`src/vendors.js` and `run-vendors.mjs` run the same WellSite governed session
through the top AI vendors and show the governance is identical no matter which
model proposed the action. A vendor runs LIVE if its API key is in the
environment, and MOCK (clearly labelled) otherwise, so the harness is
demonstrable offline without ever faking a vendor call.

```
node run-vendors.mjs
```

Vendors covered: OpenAI, Anthropic, Google Gemini, xAI Grok, Mistral, DeepSeek,
and Meta Llama via Groq. Each adapter uses that vendor's real API shape and maps
the model's scored choice among the admissible governed actions to the
distribution FUSE consumes. IGL then constrains and receipts it identically, so
`deny` and `redact` carry zero mass in every column and every receipt verifies
from the artifact alone.

To run live, set the keys for the vendors you want and, optionally, the model
overrides, then run the harness where outbound network to the vendor APIs is
allowed (your machine or CI, not a locked-down sandbox):

```
export OPENAI_API_KEY=...      OPENAI_MODEL=gpt-5.4-mini
export ANTHROPIC_API_KEY=...   ANTHROPIC_MODEL=claude-...
export GEMINI_API_KEY=...      GEMINI_MODEL=gemini-...
export XAI_API_KEY=...         MISTRAL_API_KEY=...   DEEPSEEK_API_KEY=...   GROQ_API_KEY=...
node run-vendors.mjs           # writes out/vendor-receipts.json, one per vendor
```

Note on environments: a cloud sandbox with an egress allowlist will refuse the
vendor calls ("Host not in allowlist"). Run the live harness where egress to the
vendor APIs is open. The governance, the receipts, and the verification do not
change between mock and live; only the source of the proposed distribution does.

## What "battle tested" means here

The adversarial suite asserts the properties a governed language has to survive,
and each is a checkable test rather than a claim: a tampered receipt fails
verification (outcome, bound identity, and constraint digest each tested); an
edited governed output is caught by recomputation; a constraint that forbids
everything fails closed with PROJECTION_FAILURE instead of emitting an ungoverned
output; a forbidden token always carries zero mass; FUSE under a higher authority
without a declared delegation is refused; and RECURSE depth zero, inference before
INJECT, and a missing identity block are all rejected before anything executes.

`docs/PRODUCTION_READINESS.md` is the honest part: it separates what is done and
checkable here from what a real model integration, a real UDM integration, an
external security review, legal review, and independent third-party reproduction
still have to close before the larger claims are earned.

## What is real, and where the one seam is

Real, and not simulated: identity resolution and authority resolution
(Section 8.02, graphless so the declared authority governs), the INJECT and
Governed Context immutability rule (5.06), boundary enforcement after FUSE
(7.03), cognitive-trace sealing (7.04), turn-trace sequencing with parent links
(3.06), the delegation path that lets a filing run under a higher authority
(5.01), Ed25519 Governance Receipts over the ordered fields of Section 3.05, and
independent verification.

The FUSE math is real and recomputable. FUSE computes normalize(v (x) w) exactly
as Schedule B specifies, with the support-restriction guarantee that any token a
constraint zeroes receives zero mass. The sealed trace records the input
distribution, the constraint weights, and the governed output, so a third party
can recompute the operation and confirm it. `verify-receipt.mjs` does exactly
this.

The one seam, stated plainly. Section 12.03 of the specification leaves undefined
how a real model's internal vectors map onto the vocabulary. This runtime does
not fake that. `AI_INFER` supplies the probability vector through a labelled
model seam (a deterministic, seeded stand-in by default), the same way a
reference implementation stubs a model call. The constraint matrix and the
boundary ceilings that IOS+ provides here are deterministic stand-ins for a real
UDM jurisdiction matrix. Everything downstream of the vector, the governance, the
receipts, and the verification, is real. To attach a real model, replace the
`invoke` seam with a source that returns a distribution over the vocabulary.

## Conformance status

The five sample programs of Schedule C all parse, type-check, execute, and
produce Governance Receipts that verify, and their FUSE steps recompute
independently. The corrected RECURSE semantics of the Schedule B drafting note
are honoured: a declared depth of 3 yields four governed steps.

This is a reference runtime, not a production service. The identity graph, the
UDM matrix source, and the model are seams meant to be pointed at real systems.
