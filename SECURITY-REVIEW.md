# Security review notes

The GitHub Security alert APIs were not accessible from this execution environment (`403 Resource not accessible by integration`), so this review is based on local remediation work and reproducible tooling (`npm audit`, source/workflow review, and test verification).

| Rule / alert class | File:line | Verdict | What changed |
|---|---|---|---|
| Unpinned third-party GitHub Actions | `.github/workflows/ci.yml:17-18` | fixed | Pinned `actions/checkout` and `actions/setup-node` to immutable commit SHAs. |
| Excessive default `GITHUB_TOKEN` permissions | `.github/workflows/ci.yml:9-10` | fixed | Added least-privilege workflow-level `permissions: contents: read`. |
| Permissive CORS on authenticated service endpoints | `provision/server.mjs:23-48` | fixed | Replaced wildcard CORS with strict origin allowlist (`PROVISION_ALLOWED_ORIGINS`, localhost defaults). |
| Permissive CORS on MCP endpoint | `provision/mcp.mjs:156-221` | fixed | Replaced wildcard CORS with strict origin allowlist and scoped response headers. |
| Dynamic regular expression construction in resolver | `provision/resolver.mjs:214-220` | fixed | Removed dynamic `RegExp` creation and replaced it with normalized string matching for state names. |
| Vulnerable transitive dependencies (`protobufjs`, `onnxruntime-web`, `sharp`) | `package.json`, `package-lock.json` | dependency bump | Added `overrides` and regenerated lockfile; `npm audit` now reports `0 vulnerabilities`. |
| Example identity key string in sample config | `provision/identities.example.mjs:15` | false positive | Sample placeholder (`igm-example-caller-REPLACE_ME`) is non-secret by design and documented as example-only. |

## Follow-up outside this PR

- Re-run repository Security tab triage with a token that has `security_events`/Dependabot/secret-scanning visibility so alert IDs can be explicitly closed and linked to these fixes.
- If any historic secret-scanning alerts map to previously exposed real credentials, rotate and revoke those credentials after verification.
