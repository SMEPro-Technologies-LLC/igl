# Governance binding — what is live, and what the runtime is bound to

This records the deployed governance model as verified against the live service on
13 August 2026, and states plainly what the runtime is and is not bound to today,
so nobody claims more than is true.

## Two databases, confirmed

`udm.igl.dev/health` returns:

```
{ "status": "ok", "service": "d1-igl", "database": "udmcore", "tables": 18 }
```

The console query run earlier returned about 100 tables (`udm_obligations`,
`boundary_rules`, `audit_receipts`, `ig_nodes`, and the rest). These are two
different databases that share the name `udmcore`. The one serving production is
the 18-table instance behind `udm.igl.dev`.

## The deployed governance model is the graded matrix

`GET /udm/matrix/get?jurisdiction=US-TX&agency=RRC` returns real numeric cells
with a version and a service-computed SHA-256 digest:

```
matrix udm-ustx-rrc-001  version 1.0.0  digest 1252a4e5...
  path-production-report  access_control        1
  path-production-report  output_restriction    0.8
  path-financial-detail   output_restriction    0.3
  path-pii-disclosure     output_restriction    0
  path-well-identity      access_control        1
  path-well-identity      mandatory_disclosure  1
```

`EU/EDPB` follows the same shape (`path-art9-special` at 0, `path-profiling` at
0.2, digest c4dd7ac3...). So the deployed model is the numeric FUSE-and-matrix
model, and it is graded, not categorical. This is what is live.

## What the runtime is bound to today, stated honestly

- `src/udm.js` is the client for the deployed service. It fetches the matrix,
  derives the FUSE weights (support restriction, a value of 0 is a blocked path)
  and the graded ceilings (0.3, 0.8, 0.2, 0.5), applies FUSE and then the boundary
  check, and carries the service digest so a receipt binds to the same digest the
  service published. `test/udm.mjs` exercises this against the real US-TX/RRC and
  EU/EDPB matrices captured from the wire.
- NOW TRUE (2026-08-14, ADR 0002): the interpreter's default execution path
  binds the resolved live/pinned matrix through `src/resolve.js` and the explicit
  crosswalk (`src/crosswalk.js`). An unresolved udm:// constraint fails closed;
  the stand-in survives only behind `offline: true` with `standin-`-prefixed
  digests and signed `standin` provenance. `run-wellsite.mjs` binds the service
  digest `1252a4e5...` by default (pinned) and fetches the wire under
  `IGL_LIVE=1`. The live-wire receipt is produced by the `live-proof` CI job,
  which runs where the network reaches `udm.igl.dev` and verifies the artifact.
- `src/d1.js` (obligations, boundary_rules, audit_receipts, ig_nodes) targets the
  100-table console database, which is NOT the deployed service. `src/determination.js`
  implements the entailment model from the IG_Schema sheets, which is also not the
  deployed model. Both are retained as the newer design, not the live path.

## The canonical decision

The deployed, live governance is the graded matrix and FUSE, served by `d1-igl`
over the 18-table `udmcore`. That is canonical. The runtime should bind to it
through `src/udm.js`. The entailment engine and the 100-table adapter are a
separate, newer design that is not deployed; keeping both without an architecture
decision is the duplication the review flagged. An ADR should record that the
matrix model is the live target and state what happens to the entailment design.

## The honest one-line status

The runtime now has a tested client bound to the live deployed matrix and its
digest, and the boundary-check gap is closed against real graded ceilings. The
runtime does not yet execute against the live service by default, and no receipt
has been produced against the live digest in this environment. Switching the FUSE
path to `src/udm.js` and running it in a Worker is the step that makes the live
digest match real end to end.
