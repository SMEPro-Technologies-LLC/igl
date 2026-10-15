# 0003. Purpose-bounded projections belong in the public contract

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Contract 0.1 governed by tenant, scopes, authority and policy evaluation, while the MCP surface governed by purpose profiles, consent, node budgets and gate explanations. Applications and the models they host therefore read identity under two different models.

## Decision

Contract 0.2 adds a Projection service (`/purposes`, `/identities/me`, `/identities/{id}/projection`, `/projection/explain`, `/obligations`, `/consents`) and `POST /audit/interactions`, and accepts `purpose` on every intelligence request. The MCP tools map one-to-one onto REST operations (`docs/PLATFORM.md`).

## Consequences

One governance model for both callers; an application can verify what its model saw. Additive only: the 34 paths of 0.1 are unchanged.
