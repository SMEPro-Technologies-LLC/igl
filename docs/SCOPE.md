# Scope: items not included in v0.2

The following items appear in earlier design documents but are not part of the
v0.2 reference implementation. Each row explains why.

| Excluded | Category | Why out of scope |
|---|---|---|
| `udm_mode` enforcement | Deferred | `udm_mode` requires the graded matrix (`udm_matrix_cells REAL 0.0–1.0`). v0.2 uses set and lattice boundaries, so there is no graded mode to enforce. The remaining design question is listed in the status table in `architecture.md` and in BRIDGE.md. This may be revisited if the graded layer is adopted. |
| `Lambda` node | Removed | The node had no handler. v0.2 runs as Worker + D1 (`store.js` `D1Journal`), so Lambda was not part of the execution path. |
| `emit` | Replaced | The governed call surface is `UDM.*`, `AI.*`, and `IOS.*` (`builtins.js`), each with a declared signature. A free `emit` would allow an ungoverned side effect. Programs return traced outputs through `Output[...]`. |
| `unbind` | Replaced | v0.2 uses `revoke` for authority and `revokeKey` for signing keys. Both are named-grantor events that can be reconstructed with `asOf`. |
| Resolve-less reason blocks | Not supported | SPEC §8.1 resolves identity before running `OnFail`. A handler therefore always has a resolved identity. |
| PyPI publishing | Not applicable | This reference implementation is a Node.js ES module (`package.json`, `type: module`), not a Python package. A future Python port would be a separate package and would need to pass the conformance tests in `docs/SPEC.md` §10. |

## Open design questions

Two questions remain open:

1. **The graded-matrix fork.** `p ⊙ w → renormalize` (v1.0 §2) needs
   `udm_matrix_cells REAL`; v0.2's structural containment does not. Adopting the
   graded layer would bring `udm_mode` back into scope. Until then, the
   soundness property (`α(γ(S)) ⊆ ↓S ∪ {ABSTAIN}`) remains unchanged.

2. **The Worker binding.** `D1Journal.exec` → `env.DB`, and `D1_SCHEMA_STATEMENTS`
   applied against `udmcore`. The adapter, schema, triggers, and head-CAS are
   built and tested. Binding it to the Worker environment is the remaining work.
