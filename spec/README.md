# IGL Platform contract

`openapi.yaml` is the public, versioned OpenAPI 3.1 contract for the IGL Governed Identity Platform served at **https://api.id-me.ai/v1** (production) and **https://sandbox.id-me.ai/v1** (sandbox). It is the same file published at [id-me.ai](https://id-me.ai/#docs), where the Developer Console builds requests from it.

| | |
|---|---|
| Current version | **0.3.0** |
| Paths / operations / schemas | 42 / 46 / 63, plus 3 webhooks |
| Auth | OAuth 2.0 (client credentials, authorization code) with scopes `igl.read`, `igl.write`, `igl.execute`, `igl.admin`; `X-IGL-API-Key` where listed |
| Tenancy | `X-IGL-Tenant-Id` on every governed call |
| Errors | `application/problem+json` (RFC 9457) |
| Validation | `npx --yes @redocly/cli@1 lint spec/openapi.yaml`, enforced in CI |

## Services

`/identities`, `/purposes`, `/authority`, `/knowledge`, `/policies`, `/evidence`, `/outcomes`, `/graph`, `/query`, `/research`, `/crosswalk`, `/investigate`, `/agents`, `/workflows`, `/runs`, `/audit`, `/health`, `/capabilities`

## What changed in 0.3.0

The Subject service: the controls a person holds over what is learned about them, as governed operations with signed receipts and chain entries. `GET` and `POST /identities/{id}/learning` (pause and resume), `POST /identities/{id}/forget` (targets are emptied in place; the chain keeps the act and a SHA-256 of each record as it was, never the content), `POST /identities/{id}/reset`, and `GET /identities/{id}/export` (the whole record with a fingerprint and the lineage of chain events). The 42 paths of 0.2.0 are unchanged. Every `AuthorityDecision` now carries `policiesMatched` and `subject`; every `GovernanceReceipt` carries `auditHead`. See `docs/RICORSA.md` for where these rules come from.

## What changed in 0.2.0

Purpose-bounded projections, so that applications and model callers share one governance model: purpose profiles, `GET /identities/me`, `GET /identities/{id}/projection` with node budget and a per-node gate explanation, obligations with `attested | proposed` status, read-only consent records, and `POST /audit/interactions`. The 34 paths of 0.1.0 are unchanged; the 0.1.0 file is in the repository history (tag v1.3.0).

## Versioning

The contract follows SemVer. Additive changes (new paths, optional fields) are minor; removals and incompatible changes are major and ship behind a new `/v{n}` base path. Changes to the contract go through an IGL Enhancement Proposal (see `CONTRIBUTING.md`).
