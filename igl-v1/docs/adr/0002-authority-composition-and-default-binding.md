# ADR 0002 — Authority composes by intersection; the live matrix is the default path

Status: accepted. Date: 2026-08-14. Resolves the open item in ADR 0001 §3 and
closes GTM_READINESS P0 items 3–5.

## Decision 1 — Authority composition: MIN, never MAX

ADR 0001 §3 left the authority policy undecided: INHERITS_FROM raise-to-max
(as previously implemented per the 8.02 reading) versus min-clamping. Decided:

**Effective authority = MIN(own declared level, effective authority of every
INHERITS_FROM parent).** Inheritance can only restrict; it can never amplify.
Permissions compose by intersection everywhere in the system: the company
boundary and the individual footprint meet at the execution gate as
`τ_d = MIN(C_d, P_d)`, and neither vector overwrites the other. Obligations
compose by union. Confidence remains evidence quality and is never multiplied
into authority. (Basis: the fail-closed principle that governs the rest of the
design; the 'Native IGL Model' analysis in the Universal Decoding Matrix
workbook; GRAPH.md's law that observation never confers authority.)

The one sanctioned way to act at a higher level is **explicit declared
delegation**, which switches the acting identity to one that holds its own
granted authority — the WellSite escalation (operator 0.4 → compliance officer
0.85 via `propagation: DELEGATE TO`). Delegation does not add authority to the
delegator; it moves the act to the delegate, and the receipt records which
identity was bound when the act happened.

Encoded in `IOSPlus.resolveAuthority` (min-clamp, depth-bounded, cycle-safe;
graphless declared values govern unchanged). Tested in `test/suite.mjs` §K:
a declared 0.9 inheriting from a 0.4 parent resolves to 0.4; both WellSite
paths (delegated filing, and refusal without delegation) remain under test.

## Decision 2 — The default execution path binds the deployed matrix

The interpreter's FUSE path no longer reaches a silent stand-in. The default is:

1. **Resolve before interpret.** `src/resolve.js` collects every
   `CONSTRAINT_MATRIX` with a `udm://` source, fetches the live matrix from
   `udm.igl.dev` (or serves the pinned wire-captured fixtures hermetically),
   and projects it onto the vocabulary through the explicit crosswalk.
2. **Fail closed.** A udm:// constraint with no resolved matrix raises
   `CONSTRAINT_SOURCE_UNRESOLVED`. An unregistered module raises
   `CROSSWALK_UNMAPPED`. No fallback.
3. **The stand-in is quarantined.** It exists only behind the explicit
   `offline: true` flag (Schedule C language conformance), its digests are
   prefixed `standin-` so they can never impersonate a service digest, and
   receipt provenance (`live` | `pinned` | `standin`) is a SIGNED field.
   A COMPLIANT receipt against a stand-in outside offline mode is refused
   (`STANDIN_RECEIPT_REFUSED`).
4. **Apply, then check.** After FUSE support restriction, governed mass is
   checked against the projected graded ceilings; a HARD violation halts,
   seals the partial trace, and issues no receipt. Mandatory-disclosure paths
   must carry mass through their rendering tokens.

## Decision 3 — The crosswalk is explicit, versioned, and digested

The Section 12.03 seam (model vocabulary ↔ UDM reasoning paths) is now a
declared data structure (`src/crosswalk.js`), not an assumption:

- token weight/ceiling = MIN over every path the token renders (intersection —
  the bridge can never amplify permission);
- a projected zero must trace to a provision-cited zero in the live matrix or
  to fail-closed omission (unmapped token), and the reason is recorded per
  token — an approximate bridge cannot create a hard zero;
- ABSTAIN is always reachable; control tokens pass ungoverned unless a module
  maps them;
- the crosswalk's own digest is carried in every projected constraint and
  FUSE record, so the projection is auditable alongside the matrix digest.

Held under test in `test/resolve.mjs` (24 checks).

## Consequences

- `run-wellsite.mjs` executes against the deployed TX-RRC matrix by default
  (pinned; `IGL_LIVE=1` fetches the wire) and its terminal receipt binds the
  service digest `1252a4e5…` with signed provenance.
- The determination engine (`src/determination.js`) and the 100-table adapter
  (`src/d1.js`) remain parked as a non-canonical design track per ADR 0001 §2;
  nothing on the default path calls them for governance.
- `workers/igl-api` (outside this repository) must apply the same binding when
  it embeds this runtime; until then this reference is the conformance bar.
