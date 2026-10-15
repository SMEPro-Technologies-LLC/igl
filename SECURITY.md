# Security Policy

IGL is a governance and audit language. A vulnerability can compromise its identity, boundary, intent, or trace guarantees, which downstream systems may rely on. Please report security issues privately so they can be assessed and addressed.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report privately to: **[SECURITY CONTACT EMAIL]**

Optionally encrypt your report with our PGP key: [PGP KEY FINGERPRINT / LINK]

Include:

- A description of the vulnerability and which guarantee it affects (identity, boundary enforcement, intent recording, trace integrity, provenance rules)
- Steps to reproduce, or a proof of concept
- Affected versions, if known

## What happens next

- **Acknowledgment within 48 hours.**
- **Severity assessment within 5 business days**, with a rough remediation timeline.
- We will coordinate disclosure with you. Our target is a fix and advisory within 90 days; we will tell you if an issue is more complex and why.
- After a fix ships, we credit reporters in the advisory (unless you prefer anonymity).

## Scope and severity priorities

Issues that break a core guarantee are treated as **critical**:

1. Executing work without a valid identity binding
2. Executing an action outside a declared boundary
3. Forging, altering, or truncating a trace without breaking hash-chain verification
4. Reclassifying provenance (making `reported:*` or `derived:*` appear as `observed:*`)
5. Bypassing canonicalization so that two different payloads hash identically

Issues in examples, docs, or the playground are welcome but lower priority.

## Supported versions

| Version | Supported |
|---|---|
| 1.x (latest minor) | Yes, security fixes |
| Older minors | Critical fixes only, at maintainer discretion |

## Verification guidance for users

- Release tags are signed (`git tag -v v1.0.0`). Verify before building from source.
- Published packages include checksums; verify against the release notes.
- Verify signed release tags with `git tag -v v1.0.0` before building from source.
- Check published package checksums against the release notes.
- Use the journal's `verify()` method to check that its captured entries form a valid hash chain.
