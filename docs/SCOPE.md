# Scope: deliberate exclusions (v0.2)

The following terms appear in the v1.0 lineage (`architecture.md`,
`IGL_Specs.docx`, and `point-of-inflection.md`) but are **intentionally out of
the v0.2 reference implementation**. Each entry explains why it was excluded.

| Excluded | Category | Why out of scope |
|---|---|---|
| `udm_mode` enforcement | **Deferred; blocked on a fork** | `udm_mode` requires the graded matrix (`udm_matrix_cells REAL 0.0–1.0`). Version 0.2 uses set- or lattice-valued boundaries, so it has no graded mode to enforce. Revisit this after resolving the open design question in the `architecture.md` status table and `BRIDGE.md`. |
| dead `Lambda` node | **Dropped; never wired** | This deployment-topology node had no handler. Version 0.2 runs as Worker + D1 (`store.js` `D1Journal`), with no Lambda in the execution path. |
| `emit` | **Superseded; not in the operator set** | Version 0.2 uses `UDM.*` / `AI.*` / `IOS.*` (`builtins.js`), each with a declared signature. A free `emit` would allow ungoverned side effects. Outputs leave through traced `Output[...]` statements. |
| `unbind` | **Superseded; replaced by two operations** | Version 0.2 uses `revoke` for authority and `revokeKey` for signing keys. Both record named-grantor events in the journal and support `asOf` reconstruction. See GRAPH.md. |
| resolve-less reason blocks | **Disallowed by evaluation order** | SPEC §8.1 requires identity resolution before `OnFail` can run (resolve → boundary → authorise → … → OnFail). A failure handler therefore always has a resolved identity. |
| PyPI publishing | **out of ecosystem** | The reference implementation is Node/ESM (`package.json`, `type: module`). There is no Python package to publish. If a Python port is built later it is a separate artifact with its own conformance run against `docs/SPEC.md` §10. |

## Open questions

Two questions remain. They are independent of each other and of the exclusions above:

1. **The graded-matrix fork.** `p ⊙ w → renormalize` (v1.0 §2) needs
   `udm_matrix_cells REAL`; v0.2's structural containment does not. Adopting the
   graded layer would re-open `udm_mode`. Deferring it keeps the soundness
   property (`α(γ(S)) ⊆ ↓S ∪ {ABSTAIN}`) as-is. A decision, not a gap.

2. **The Worker binding.** `D1Journal.exec` → `env.DB`, and `D1_SCHEMA_STATEMENTS`
   applied against `udmcore`. The adapter, schema, triggers, and head-CAS are
   built and tested; the binding is the remaining wiring.
