# IGL v1.0 reference runtime, threat model

This states what the receipts and the runtime protect, what they do not, and the
residual risks a deployer carries. It is written so an outside reviewer can check
each claim against the code and the test suite rather than take it on trust.

## Assets

1. The Governance Receipt, a signed statement that a specific governed
   computation happened under a specific identity, constraint version, and
   outcome.
2. The Cognitive Trace and its FUSE record, which let a third party recompute the
   governed output.
3. The identity and authority state that decides what an actor may do.
4. The signing keys held by IOS+.

## Trust boundaries

- The model is outside the trust boundary. Nothing here assumes the model is
  correct, calibrated, or honest. FUSE constrains its output and the receipt
  records what was produced. A malicious or wrong model cannot escape support
  restriction, and its influence is confined to the distribution it returns.
- IOS+ is inside the trust boundary. It resolves identity, provides constraints,
  and holds the signing key. A compromised IOS+ can forge receipts. This is the
  central deployment assumption and is addressed under key management below.
- The verifier is fully outside. Verification needs only the receipt and the
  published public key, so a relying party never has to trust the producer.

## What the receipt proves

- Integrity. Any change to a receipt field breaks the signature. The suite
  demonstrates this by flipping the outcome, the bound identity, and the
  constraint digest, each of which fails verification.
- Attribution to a key. A valid receipt was signed by the key in it, and a
  deployment publishes that key to a directory so the relying party checks
  against a known key rather than the one the receipt carries.
- Recomputable governance. The FUSE record lets a verifier recompute
  normalize(v times w) and confirm support restriction, so the claim that the
  output was shaped by the stated rule is checkable, not asserted. The suite
  shows an edited governed output is caught.

## What the receipt does not prove

- That the model's content is true. Governance restricts, it does not fact-check.
- That the constraint matrix encodes the right policy. The receipt binds the
  matrix version and digest, so the rule in force is auditable, but whether that
  rule is correct is a UDM and legal question, not a cryptographic one.
- That the input vector came from any particular model. In the reference the
  vector arrives through a labelled seam. A production deployment that needs to
  bind the receipt to a specific model must record the model identity and, where
  available, an attestation from the inference provider. This is an open item,
  not a solved one.

## Attacks and mitigations

- Receipt tampering: broken by the signature. Tested.
- Receipt forgery: requires the IOS+ signing key. Mitigation is key management,
  below. Without the key an attacker cannot produce a receipt that verifies.
- Replay of an old receipt: each receipt carries a session id, a turn sequence
  number, and an issuance time. A relying party that cares about freshness checks
  these. Cross-context replay of a signature is prevented by the domain-separated
  signing prefix.
- Authority inflation by activity: not possible in this design. Authority comes
  from the identity graph, not from observed behaviour. Reaching a higher
  authority requires a declared delegation, and FUSE UNDER a higher authority
  without one is refused. Tested.
- Model manipulation: confined by support restriction and the post-FUSE boundary
  check. A model cannot place mass on a forbidden option.
- Zero-partition denial: if a constraint forbids everything, FUSE fails closed
  with PROJECTION_FAILURE rather than emitting an ungoverned output. Tested.

## Residual risks a deployer owns

1. Key management. The signing key is the root of trust. It should live in an HSM
   or KMS, rotate on a schedule, and be revocable, with the key directory the
   canonical source relying parties check. Not implemented in the reference.
2. The model-to-receipt binding described above.
3. The correctness of UDM matrices and boundary tensors, which the reference
   supplies as deterministic stand-ins.
4. Availability and integrity of the audit log at scale, which the reference
   keeps in memory.

None of these are reasons the design is unsound. They are the specific things an
external review and a production deployment have to close, and they are listed
here so that review has a checklist rather than a slogan.
