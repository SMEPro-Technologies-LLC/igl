# Security Policy

## Reporting a vulnerability

Email **support@smeprotech.com** with subject line `SECURITY: igl`. Include a
reproduction (a program, a receipt, or a test) where possible. You should
receive an acknowledgment within 72 hours. Please do not open public issues
for suspected vulnerabilities before coordination.

## Scope

The security surface of this repository is the governance guarantee itself.
Reports are especially valued for:

- **Receipt forgery or malleability** — any way to produce a verifying
  Governance Receipt that misstates identity, authority, constraint digest,
  provenance, or outcome (`src/sign.js`, `verify-receipt.mjs`,
  `verify-governed.mjs`).
- **Support-restriction escape** — any input under which a token or reasoning
  path carrying constraint weight 0 receives nonzero governed mass
  (`src/interpreter.js` fuseDist, `src/udm.js` fuseAndCheck).
- **Ceiling or mandatory-disclosure bypass** — governed mass over a graded
  ceiling, or a mandatory path at zero mass, in a COMPLIANT outcome.
- **Authority amplification** — any composition of inheritance, delegation, or
  graph state under which an identity acts above MIN-composed authority
  (ADR 0002; `IOSPlus.resolveAuthority`, FUSE `UNDER` guard).
- **Stand-in laundering** — any path by which a `standin-` constraint reaches a
  COMPLIANT receipt without `offline: true` and signed `standin` provenance.
- **Crosswalk integrity** — a projection that zeroes or widens a token without
  a recorded provision/fail-closed reason (`src/crosswalk.js`).

## Known, documented limitations (not vulnerabilities)

Tracked in docs/ and the ADRs: the dev signing seed in run scripts (production
requires a KMS-backed seed), the deterministic model seam (a stand-in for a
real inference source), the read-only identity graph, and the pending external
security review (docs/THREAT_MODEL.md). Reports that materially sharpen the
threat model are welcome even when they fall in these categories.
