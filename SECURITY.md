# Security Policy

IGL is a governance and audit runtime. A security bug in IGL can break the identity, boundary, intent or trace guarantees that other systems rely on, so we treat every report seriously and quickly.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report privately through either channel:

- **GitHub private vulnerability reporting:** [Report a vulnerability](https://github.com/SMEPro-Technologies-LLC/igl/security/advisories/new) (preferred, creates a private advisory thread)
- **Email:** security@id-me.ai

Include a description of the vulnerability and which guarantee it affects (identity, boundary enforcement, intent recording, trace integrity, provenance rules), steps to reproduce or a proof of concept, and affected versions if known.

## What happens next

- **Acknowledgment within 48 hours.**
- **Severity assessment within 5 business days**, with a remediation timeline.
- We coordinate disclosure with you. Our target is a fix and advisory within 90 days; we will tell you if an issue is more complex and why.
- After a fix ships, we credit reporters in the advisory (unless you prefer anonymity).
- Advisories are published as [GitHub Security Advisories](https://github.com/SMEPro-Technologies-LLC/igl/security/advisories) with a CVE where applicable.

## Scope and severity

Issues that break a core guarantee are **critical**:

1. Executing work without a valid identity binding
2. Executing an action outside a declared boundary
3. Forging, altering, or truncating a trace without breaking hash-chain verification
4. Reclassifying provenance (making a lower class appear as `granted` or `observed: governing`)
5. Bypassing canonicalization so that two different payloads hash identically

Issues in the platform contract (`spec/`) that would allow a conforming client to bypass a gate are treated as **high**. Issues in examples or docs are welcome but lower priority. The hosted platform at id-me.ai is in scope for reports; its infrastructure is out of scope for testing without written authorization.

## Audit status

The October 2026 review (`docs/audit/SECURITY-AUDIT-2026-10.md`) lists nine findings. F-01 to F-04 were fixed in 1.3.0 and F-05 to F-09 in 1.5.0; each has a regression test (`test/security.test.js`, `test/audit.test.js`) and the probe scripts that reproduced them are kept in `docs/audit/` and now show the properties holding. The review was conducted by the project itself. No independent review has been performed yet, and we will say so until one has.

## Supported versions

| Version | Supported |
|---|---|
| 1.x (latest minor) | Yes, security fixes |
| Older minors | Critical fixes only, at maintainer discretion |

## Verification guidance for users

- Release tags are signed. Verify a tag before building from source: `git tag -v v1.5.0`.
- Published packages carry npm provenance attestations; verify with `npm audit signatures`.
- You can check a trace yourself without trusting this project. A journal (`MemoryJournal`, `FileJournal` or `D1Journal` in `src/store.js`) has `verify()` for the hash chain, `verify({ checkpoint })` to detect a truncated or rewritten history against an anchor you hold, `merkleRoot()` and `inclusionProof(seq)` for selective disclosure, and the static `MemoryJournal.verifyInclusion({ leaf, proof, root })` for the auditor's side. Receipts, grants and approvals verify through `Signer` in `src/sign.js`. Everything is standard SHA-256 and Ed25519, so you can recompute it with any library you prefer.
