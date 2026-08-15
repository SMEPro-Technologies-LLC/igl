# The Point of Inflection — Canonical Technical Note

**Status: ground truth.** This note states the fusion mathematics and halt
semantics as implemented in `igl-core` and deployed at `udm.igl.dev`. Any
external narrative (marketing, posts, whitepapers) should be checked against
this document. Where a claim here says "not implemented," do not publish it in
the present tense.

## 1. Notation

At generation step *t* the model produces raw logits **z** ∈ ℝ^|V| over
vocabulary V. Softmax converts logits to a probability distribution
**p** = softmax(**z**). The UDM supplies a constraint weight vector
**w** ∈ [0,1]^|V| derived from the active matrix (jurisdiction × agency ×
identity scope).

## 2. Support restriction — the two correct formulations

**Probability-space (implemented — igl-core `FUSE`, `/udm/matrix/apply`):**

```
g_i = (p_i · w_i) / Σ_j (p_j · w_j)
```

**Logit-space (required form for a vLLM/TGI LogitsProcessor):**

```
ẑ_i = z_i + log(w_i)        (w_i = 0  →  ẑ_i = −∞)
g   = softmax(ẑ)
```

These are mathematically equivalent. Both guarantee **support restriction**:
`w_i = 0 ⇒ g_i = 0`, exactly — the prohibited token cannot be sampled.

**Incorrect formulations that must not appear in published material:**

- `ẑ = z ⊙ w` (multiplying raw logits). Logits can be negative; a fractional
  weight moves a negative logit toward zero and *raises* that token's
  probability. This formulation can anti-govern.
- "Zeroing a logit removes the token." A zero logit has probability
  proportional to e⁰ = 1 — a perfectly ordinary token.

## 3. Renormalization

Division by the surviving mass (probability-space) or softmax over the
restricted support (logit-space). It is plain renormalization — not a
"modified softmax" in the probability-space form. Renormalization can raise a
surviving token's probability above its fractional weight; fractional weights
are steering pressure, not ceilings. Ceilings are the boundary check's job.

## 4. Zero-partition guard

If every token carries weight 0, the partition sum is 0 and no distribution
exists. The runtime raises `FusionTypeError / PROJECTION_FAILURE`
("zero partition"), execution stops, the partial trace is sealed, and no
receipt is issued. (There is no error code `0x1102`.)

## 5. Boundary check

As implemented: per-dimension comparison of the governed distribution against
the identity's boundary tensor ceilings — `g_i ≤ τ_i` — with HARD/SOFT
strictness per dimension and temporal window validation. There is **no dot
product or tensor contraction** in the current runtime.

*Roadmap note:* a projection matrix **B** mapping token space onto governance
dimensions (`c = B·g`, then `c_k ≤ τ_k` — e.g. aggregate "PII density") is a
coherent v1.1 extension, with `semantic_crosswalk` as its natural data source.
Not implemented today.

## 6. Hard halt semantics — what actually happens

On `HARD_BOUNDARY_EXCEEDED` (after the identity's declared exceptions are
scanned and none applies):

1. Execution stops at the violating step.
2. The partial cognitive trace is **sealed and persisted** — evidence is
   preserved, never wiped. This is the audit doctrine; any description of
   memory destruction contradicts the design.
3. No `GOVERNANCE_RECEIPT` is signed. Downstream systems that require a
   verified receipt reject the session's output. That is the enforcement
   boundary.
4. The hash chain remains **intact and verifiable** — it is not "invalidated."
   Its integrity is what lets an auditor prove exactly where and why the halt
   occurred (`GET /v1/chain?session=…` recomputes it end to end).

**Claims that must not be published:** hardware interrupts, NMIs,
cryptographic coprocessors, SRAM purges, gate-voltage resets, clock-cycle
memory destruction. The deployed substrate is Cloudflare Workers (V8
isolates); no component has hardware-level control. For self-hosted inference
(vLLM), the legitimate analogue is session KV-cache eviction on halt — an
API call, not electronics.

## 7. The hash chain — detection, not physics

```
hash_t = SHA-256( hash_{t-1} ‖ canonical(step_record_t) ),
hash_0 seeded from SHA-256("GENESIS:" + session_id)
```

The chain makes tampering **detectable and provable by any third party**, and
makes an unverifiable session's output rejectable. It does not make divergence
physically impossible, and no automatic "authority revocation" exists today.
The demonstrated guarantee (smoke-tested against the live persistence layer):
altering any stored record flips chain verification to
`valid: false, brokenAt: <step>`.

## 8. Authority resolution — canonical semantics

Two edge types with **different** semantics; narratives keep conflating them:

- **INHERITS_FROM** (role inheritance): effective authority is the node's own
  level **raised to the maximum** found along INHERITS_FROM edges, depth ≤ 8,
  clamped to [0,1]. This follows Section 8.02 of the adopted specification.
  Example (tested): agent-base-007 (0.30) inherits from supervisor-001 (0.85)
  → effective 0.85.
- **DELEGATES_TO** (scoped acting-as): not traversed during authority
  resolution. It is verified per invocation (`verifyDelegation`) — the edge
  must exist or `DELEGATION_NOT_AUTHORIZED` is raised — and the delegate's own
  authority is adopted for the delegated turn.

A "min-clamping" rule (`A_eff = min` along the chain, so authority can never
amplify) is a **different governance policy** than the adopted spec. It is a
defensible design — arguably the more conservative one — but adopting it is a
spec amendment (ADR under Section 12.04), not a description of current
behavior. Do not publish min-clamping as how the system works today.

Consequence worth knowing: sample program C-2 escalates (THEN branch) in
graphless mode, where the declared authority 0.3 governs — but takes the ELSE
branch when graph-backed, because inheritance raises the base agent to 0.85
and `IF_AUTHORITY(base_agent, LT, 0.5)` is false. Both paths are tested.

Cycles are guarded (a visited set; cycles contribute nothing further — they
are not a distinct error). Depth overflow raises an IdentityResolutionError
(configuration error). Error codes `0x2201`–`0x2204`, a
`resolveEffectiveAuthority` function, in-resolution jurisdiction gating, and
"cryptographic identity anchors" do not exist in the implementation; node
signatures are specified (Identity Graph Authority) but not yet built.

## 9. One-line summary that is fully true

*Prohibited reasoning paths receive exactly zero probability before sampling;
every surviving step is bounded, hash-chained, and receipted; a session that
violates a hard boundary halts with its evidence sealed and receives no
receipt — and without a receipt, its output is rejectable everywhere
downstream.*
