# 0002. Provenance is assigned by capture route, never by payload

- **Status:** accepted
- **Date:** 2026-08-17 (recorded 2026-10-14)

## Context

A model, a tool, and a human can each put the same claim into the graph. If the payload could declare its own provenance, a model output could present itself as attested.

## Decision

The capture route sets provenance (`granted`, `observed: governing`, `observed: proposed`). Code that reclassifies a lower class as a higher one is rejected on review (`CONTRIBUTING.md`). The platform contract mirrors this with `seed to proposed to certified` and `attested | proposed`, where only the control plane certifies or attests.

## Consequences

AI-class observations never become authority at any volume. Promotion requires a signer. Audits can trust the class without reading the payload.
