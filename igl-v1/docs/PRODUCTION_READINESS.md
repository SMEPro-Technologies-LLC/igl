# IGL, from reference runtime to production and independent vetting

This is the honest path from where IGL is today to something the world can rely
on and, more to the point, verify. It separates what is done from what other
people still have to confirm, because the standing IGL is aiming for is earned by
outside reproduction, not by announcement. Each stage says what "done" means and
who signs it off, so no stage can be declared complete from the inside alone.

## Where it stands today

Done and checkable in this package:

- A working v1.0 reference runtime: lexer, parser, static checker, interpreter,
  IOS+ orchestrator, Ed25519 Governance Receipts, independent verification.
- Conformance to all five Schedule C sample programs.
- WellSite's governed logic rebuilt as a v1.0 program that executes and produces
  a receipt verifiable from the artifact alone.
- An adversarial test suite: tamper detection on receipts and FUSE records,
  fail-closed on zero partition, support restriction, delegation denial, and
  static rejection.
- A defined model adapter seam with working logprobs and logits adapters.

Update 2026-08-14 (ADR 0002): the constraint stand-in is no longer on the
default path. udm:// constraints resolve against the deployed matrix (live or
pinned wire captures) through the explicit crosswalk, fail closed when
unresolved, and carry signed provenance; the stand-in survives only behind
`offline: true` with tainted digests. Remaining stand-ins below are the model
seam and the identity graph backing store.

Explicit stand-ins, not yet real:

- The model. The input distribution comes through the seam, not a live model.
- UDM. Constraint matrices and boundary ceilings are deterministic stand-ins.
- Key management, audit persistence, and scale.

Honest status line: a conformant, adversarially tested reference with real
cryptography and a clearly marked model and UDM seam. Not a deployed service.

## Stage 1, real model integration

Attach a real inference source through the adapter. For hosted models, use the
logprobs adapter over a constrained choice. For open weights, add logit masking
at generation from the active constraint. Decide the Section 12.03 question
directly: either specify the crosswalk from model internals to governance paths,
or scope FUSE to operate over an explicit option distribution and say so. Done
when a real model drives a governed session end to end and the receipt still
verifies. Signed off by engineering with a reproducible demo.

## Stage 2, real UDM integration

Replace the stand-in matrices with real UDM jurisdiction matrices and boundary
tensors, with digests computed over real cell data, and wire the version into the
receipt. Done when a governed run cites a real UDM module and version and a
reviewer can trace the rule that governed it. Signed off by engineering and the
UDM owner.

## Stage 3, internal battle testing

Property-based tests and fuzzing of the parser, the checker, and FUSE. Soundness
fuzzing of support restriction across many random constraints. Load and soak
testing of the identity fold and the audit log at the trace volumes the design
names as the real regime. Chaos on the persistence and signing paths. Done when
coverage, fuzz, and load targets are met and published. Signed off by
engineering.

## Stage 4, security

External review of the cryptography and the runtime by a party that did not build
it. Threat-model review against docs/THREAT_MODEL.md. Penetration test of the
IOS+ service. Key management moved to an HSM or KMS with rotation, revocation, and
a public key directory. Done when the review report is closed out and criticals
are fixed. Signed off by the external reviewer, not by the team.

## Stage 5, compliance and evidentiary standing

For a system pitched at regulated filings, have counsel assess how a Governance
Receipt would actually be treated as evidence in each target jurisdiction, and
set data handling, retention, and residency positions. Done when there is a
written legal position per target domain. Signed off by counsel.

## Stage 6, independent vetting, where the claim is earned

Publish the specification, the conformance suite, and the reference so that
outsiders can reproduce the results and try to break them. Invite independent
reproduction of a signed session, and a third-party audit. This is the stage that
converts "we say it governs" into "others confirmed it governs." Done when at
least one independent party reproduces a verified session and publishes findings,
and an audit is on record. Signed off by those outside parties.

## Stage 7, pilot to general availability

Run a bounded production pilot with a real user and real filings, with a runbook,
monitoring, alerting, backups, and an SLA. Expand only after the pilot holds.
Done when the pilot meets its reliability targets. Signed off by the pilot user.

## On the larger ambition

A trustworthy autonomous system needs its reasoning bound to identity and
authority, constrained before it acts, and provable after. That property is
necessary for any serious deployment of highly capable AI, and IGL is a credible
substrate for enforcing it, because a frontier model can run under it without
being trusted. What the artifact supports today is exactly that: a verifiable
governance layer any model can execute inside. It does not, and should not,
claim to be a path to super-intelligence itself. The credible and stronger claim,
once the stages above are closed, is narrower and more durable: that whatever the
model is, its governed actions can be checked by anyone. That is the claim worth
making, and it is the one this plan is built to earn.
