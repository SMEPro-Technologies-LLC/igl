# 0001. Record architecture decisions

- **Status:** accepted
- **Date:** 2026-10-14

## Context

IGL makes guarantees (identity, boundary, intent, trace) whose value depends on the reasoning behind design choices being inspectable, not just the code.

## Decision

Record significant decisions as ADRs under `docs/adr/`, in the Nygard format, numbered sequentially.

## Consequences

Decisions are reviewable in pull requests like code; superseding a decision requires a new record that points at the old one.
