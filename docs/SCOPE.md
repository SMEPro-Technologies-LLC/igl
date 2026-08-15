# Scope — deliberate exclusions (v0.2)

Terms that appear in the v1.0 lineage (`architecture.md`, `IGL_Specs.docx`,
`point-of-inflection.md`) and are **out of the v0.2 reference implementation by
design**. Listed with the reason, because the reasons differ and an
undifferentiated exclusion list hides decisions.

| Excluded | Category | Why out of scope |
|---|---|---|
| `udm_mode` enforcement | **deferred — blocked on a fork** | `udm_mode` is meaningful only with the graded matrix (`udm_matrix_cells REAL 0.0–1.0`). v0.2 boundaries are set/lattice-valued, so there is no graded mode to enforce. This is downstream of the one open design question — see `architecture.md` status table and BRIDGE.md. Reopens if the graded layer is adopted. |
| dead `Lambda` node | **dropped — never wired** | A deployment-topology node with no handler behind it. v0.2 runs as Worker + D1 (`store.js` `D1Journal`); there is no Lambda in the execution path. Removed rather than carried as aspirational surface. |
| `emit` | **superseded — not in the operator set** | v0.2's governed surface is `UDM.*` / `AI.*` / `IOS.*` (`builtins.js`), each with a declared signature. A free `emit` is an ungoverned side-effect channel, which is exactly what the closed call surface exists to prevent. Outputs leave through `Output[...]`, traced. |
| `unbind` | **superseded — renamed and split** | v0.2 has `revoke` (authority) and `revokeKey` (signing keys), both named-grantor events on the journal, both `asOf`-reconstructible. `unbind` as a single untyped op is replaced by the two typed ones — see GRAPH.md. |
| resolve-less reason blocks | **disallowed — by evaluation order** | `OnFail` cannot run before identity resolution: SPEC §8.1 fixes the order (resolve → boundary → authorise → … → OnFail), so a failure handler always executes with a resolved identity. A reason/handler block that runs without resolution is not a feature to add but a property deliberately excluded. |
| PyPI publishing | **out of ecosystem** | The reference implementation is Node/ESM (`package.json`, `type: module`). There is no Python package to publish. If a Python port is built later it is a separate artifact with its own conformance run against `docs/SPEC.md` §10. |

## What remains genuinely open (not excluded — undecided)

Two, and they are independent of each other and of everything above:

1. **The graded-matrix fork.** `p ⊙ w → renormalize` (v1.0 §2) needs
   `udm_matrix_cells REAL`; v0.2's structural containment does not. Adopting the
   graded layer would re-open `udm_mode`. Deferring it keeps the soundness
   property (`α(γ(S)) ⊆ ↓S ∪ {ABSTAIN}`) as-is. A decision, not a gap.

2. **The Worker binding.** `D1Journal.exec` → `env.DB`, and `D1_SCHEMA_STATEMENTS`
   applied against `udmcore`. The adapter, schema, triggers, and head-CAS are
   built and tested; the binding is the remaining wiring.
