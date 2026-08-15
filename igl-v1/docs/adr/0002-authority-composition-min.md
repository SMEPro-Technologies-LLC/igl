# ADR 0002: Authority composes by MIN; delegation is the only escalation

Status: accepted. Date: 2026-08-15. Supersedes decision 3 of ADR 0001.

## Context

Two parallel workstreams encoded opposite authority semantics. The canonical
repository carried ADR 0001 decision 3: INHERITS_FROM raises an identity to the
maximum along its inheritance chain, with delegation clamped to the target's
declared level. A second stream specified and implemented MIN-intersection:
authority composes by intersection, never by maximum. Both cannot be the law of
the language, and the divergence was found during the pre-release reconciliation
of the two streams.

## Decision

One principle, two rules.

**Structural composition is MIN-intersection.** An identity's effective authority
is the minimum of its own declared level and every ancestor's effective level
along INHERITS_FROM, depth-bounded to 8 and clamped to [0,1]. A scope contained
in its parent can never exceed the parent. This holds for any structural or
implicit edge: no arrangement of graph structure can ever raise authority. With
no graph edges, the declared value governs.

**Explicit delegation is the only escalation.** DELEGATE TO is the one deliberate
act by which a lower identity reaches a named higher scope. A delegated FUSE acts
at min(declared, resolved) of the target: never above what the target was
directly granted, and never above what the target's own chain narrowed it to.
FUSE UNDER a higher authority with no delegation edge remains a
BOUNDARY_VIOLATION. Every delegated turn is audited with the target's declared
and resolved levels and the acting level.

## Why MIN rather than raise-to-max

Raise-to-max makes every structural edge a potential ladder: whoever can add or
reach an inheritance edge can gain authority, and each such path must be
individually policed (ADR 0001's delegation clamp policed exactly one of them).
MIN eliminates the class: structure can only narrow, so the audit question
reduces to the short list of explicit delegation edges, each recorded and
clamped. For a governance language whose receipts are meant to stand in front of
auditors and regulators, the composition rule that is safe by construction is
worth more than the one that is expressive by default.

## Consequences

- `IOSPlus.resolveAuthority` resolves by MIN along INHERITS_FROM. The
  `AUTHORITY_POLICY` constant names the law; `effectiveDelegatedAuthority`
  implements the delegation clamp. The interpreter's FUSE UNDER path is
  unchanged except that it now composes with MIN-resolved levels.
- Declared-only programs (no identity graph edges), including the WellSite
  filing program, behave exactly as before.
- A delegated target that is structurally narrowed acts at its narrowed level;
  under ADR 0001 it acted at its declared level. This is the one behavioral
  change, and it is in the restrictive direction.
- `test/authority.mjs` encodes the law: never-raise, narrowing propagation,
  chain minimum, delegation clamp against both bounds, and the refusal path.
