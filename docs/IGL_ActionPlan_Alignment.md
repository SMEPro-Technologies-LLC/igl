# IGL and America's AI Action Plan
## Factual and Fully-Capable Alignment — Where They Exist

*Working note, IGL Working Group. Grounded against the v0.2 reference implementation
(`src/`), the deployed governance service (`udm.igl.dev`, `d1-igl`), and the canonical
technical note `point-of-inflection.md`. Every claim below is marked **live**,
**reference-implemented**, or **roadmap**. Nothing is stated in the present tense that
the code does not yet do — that is the same discipline `point-of-inflection.md` imposes
on marketing, applied here to policy.*

---

### 1. What this note is, and what "where they exist" means

*America's AI Action Plan* is a policy document. It **calls for** alignment properties —
robustness, interpretability, control, objectivity, trustworthy evaluation, secure-by-design
systems — as national goals. It does not, and cannot, specify a mechanism that makes any of
them true of a running model. That gap is not a criticism of the Plan; it is the space a
language like IGL is built to occupy.

IGL's contribution to that space is narrow and specific. It does not claim to solve
alignment. It delivers two properties, mechanically, at the point where a model turns
probability into output — and it claims them **only where the code actually enforces them**.
The Plan supplies the *why* at national scale; IGL supplies a small, provable *how*.

Two words in the brief carry the whole thesis:

- **Factual alignment** — the system's governing record is bound to fact. The probabilistic
  channel may propose, locate, and inform, but the step that turns its output into governing
  fact is always deterministic or human. Wrong-but-well-formed inference is prevented from
  compounding into apparent precedent.
- **Fully-capable alignment** — the constraint does not lobotomize the model. Governance
  participates *inside* generation rather than clipping a crippled model afterward. On every
  admissible path the model keeps its full generative capability; only prohibited paths are
  removed, and they are removed *before* a token can be sampled, not after it is produced.

"**Where they exist**" is the honesty clause. IGL's own ground-truth note refuses to publish
any capability in the present tense that is not implemented. This document inherits that rule:
Section 5 is an explicit ledger of where these properties do **not** yet exist in IGL, so the
mapping in Section 4 cannot be read as more than it is.

---

### 2. Factual alignment — the mechanism, and its status

The Plan's Pillar I asks for AI that is "objective and free from ideological bias," for
"interpretability, control, and robustness," and for an "evaluations ecosystem." Those are
statements about *trust in the output*. IGL's factual-alignment mechanisms are what let a
downstream system decide whether to trust an output at all.

**AI locates; UDM computes.** *(reference-implemented — `src/bridge.js`, `docs/BRIDGE.md`)*
The model computes over continuous geometry; the UDM computes over a discrete lattice. The
bridge is an adjoint pair — γ turns an admissible set into a constraint on the model's
arithmetic, α projects the output back onto that set — with the soundness condition
`α(γ(S)) ⊆ ↓S ∪ {ABSTAIN}`, asserted by fuzzing 1,200 adversarial round trips. Critically,
**no quantity is ever generated**: the model returns a span reference, and the bridge reads
the bytes. A model cannot fabricate a figure and have it enter the record as fact; it can only
point at where a fact already is.

**Damped recursion.** *(reference-implemented — `src/runtime.js`, `src/graph.js`; SPEC §9)*
Every assertion is classed `deterministic`, `human`, or `ai`. AI-class confidence is
multiplied by a decay factor each time it is *inherited* rather than re-derived, and becomes
inadmissible below a floor; a derivation-depth cap bounds AI-to-AI chains. This is the direct
answer to the failure mode the Plan gestures at but cannot fix by policy: a structurally valid
but factually wrong inference that gets stored, re-loaded next turn as precedent, agreed with,
and re-asserted with growing apparent support. Deterministic checks catch violations of
*structure*; they cannot catch an inference that is well-formed and wrong. Decay and the depth
cap are what make that loop converge instead of amplify.

**Learning that cannot grant itself authority.** *(reference-implemented — `src/graph.js` §2.1)*
Boundary and footprint are folds over the trace stream — richer every turn — but the fold keeps
two layers. `granted` (what an actor may do) moves only on an explicit signed grant; `observed`
(what an actor does) accumulates freely and authorizes nothing. AI-class evidence never reaches
the governing layer at any volume; it can only raise a promotion candidate for a human to act
on. *The graph learns from everything and is authorized by almost nothing.* This is the
structural form of the Plan's "human oversight" language — oversight that a system cannot erode
by habit.

**A class the deployment cannot mint.** *(reference-implemented — `src/sign.js`; SPEC §9)*
The non-decaying `human` class is gated on `keyed`: an unkeyed attestation still commits its
statement, but it is classed `ai` — it decays and counts toward depth. The privileged,
fact-bearing class is not switchable on by configuration.

---

### 3. Fully-capable alignment — the mechanism, and its status

The Plan's stated fear, throughout, is that safety measures will blunt American AI's edge —
hence "remove regulatory barriers," "private-sector-led innovation." IGL's answer is that the
right enforcement point does not trade capability for governance at all.

**Governance participates in generation, not after it.** *(live at `udm.igl.dev`; math in
`point-of-inflection.md` §2)* Input guardrails act without knowledge of the reasoning they
would prevent; output filters act too late to prevent anything and leave no record of what was
suppressed or why. IGL couples the constraint *into* the generation step:

```
g_i = (p_i · w_i) / Σ_j (p_j · w_j)         (probability-space, deployed)
ẑ_i = z_i + log(w_i),  g = softmax(ẑ)        (logit-space, for a vLLM/TGI LogitsProcessor)
```

The guarantee is **support restriction**: `w_i = 0 ⇒ g_i = 0`, exactly. A prohibited token
cannot be sampled — not discarded after the fact, *never drawn*. On every surviving token the
model's own distribution is preserved and renormalized. The model is not weakened; a forbidden
region is simply not in its support.

**Fractional weights are steering, not ceilings.** *(live)* Renormalization can raise a
surviving token above its fractional weight — deliberately. Fractional weights are steering
pressure; hard ceilings are the boundary check's separate job (`g_i ≤ τ_i`, HARD/SOFT per
dimension). Capability is preserved precisely because the two are not conflated: the model
stays maximally expressive inside the admissible band, and only the band's edges are hard.

**The brake cannot be learned.** *(reference-implemented — `src/graph.js`, `src/bridge.js`)*
One principle, two substrates: *observation does not confer authority; location does not confer
determinism.* No volume of observed activity widens what an actor may do; no confidence of
having *found* a value makes it an anchor unless the location itself cleared the admissible
band. The probabilistic channel may propose and accumulate; the upgrade to governing fact is
always deterministic or human. A fully-capable model can push as hard as it likes against this
line and never move it.

---

### 4. The mapping — Action Plan provisions to IGL mechanisms

Only the alignment-relevant provisions are listed. Status is IGL's, not the Plan's.

| Action Plan provision (pillar) | Alignment property it reaches for | IGL mechanism | Status |
|---|---|---|---|
| Advance AI robustness, interpretability & control for high-stakes/defense use (I) | Factual + capable | Support restriction in-generation; damped recursion; class gating | **live** (fuse) · **ref-impl** (recursion/classing) |
| Build an AI evaluations ecosystem; testbeds for regulated industries (I) | Verifiable trust | Hash-chained journal + Ed25519 receipts; third-party recomputation of the chain | **ref-impl**; **live** binding is roadmap (§5) |
| Ensure procured AI is objective, free from ideological bias (I) | Factual alignment | "AI locates, UDM computes" — no quantity generated; span references; deterministic upgrade only | **ref-impl** (`bridge.js`) |
| Combat synthetic media / deepfakes; provenance in the legal system (I) | Attributable provenance | Signed receipt pinned to a key the graph vouched for *at signing time*; rotation-safe, revocation-safe | **ref-impl** (`sign.js`) |
| Protect AI innovations from security threats (I) | Tamper-evidence | Journal that *refuses to load* when doctored, not merely refuses to verify | **ref-impl** (`store.js`) |
| Human oversight of automated decisions (I, cross-cutting) | Control that can't erode | Two-layer fold: `granted` moves only on signed grant; observation never promotes | **ref-impl** (`graph.js`) |
| Secure-by-design AI for critical infrastructure; cyber defense (II) | Enforcement boundary | Two-phase commit on trace: no durable trace ⇒ no output; no receipt ⇒ output rejectable downstream | **ref-impl** (`interpreter.js`) |
| Evaluate national-security risk from frontier models; biosecurity screening (III) | Bounded, halting behavior | HARD-boundary halt seals the partial trace and issues no receipt; chain stays verifiable to prove where/why it stopped | **live** semantics (`point-of-inflection.md` §6) |

The single most policy-relevant line, fully true today: *prohibited reasoning paths receive
exactly zero probability before sampling; every surviving step is bounded, hash-chained, and
receipted; a session that violates a hard boundary halts with its evidence sealed and receives
no receipt — and without a receipt, its output is rejectable everywhere downstream.*

---

### 5. Where these properties do **not** yet exist in IGL

This is the "where they exist" clause made explicit. A reader who takes Section 4 without this
section takes more than the code gives.

1. **Live runtime binding is not the default path.** The interpreter's default execution still
   uses the deterministic stand-in matrix, not the live service. The tested live-bound path is
   `src/govern.js` over `src/udm.js`, exposed by `src/worker.js`; it must run in a Worker (or
   anywhere with network to `udm.igl.dev`) to produce a receipt against the live digest. No
   runtime receipt has yet been produced against the live digest `1252a4e5…` in every
   environment — only where the service is reachable. *(GOVERNANCE_BINDING.md; ADR-0001)*

2. **The graded-matrix fork is open by decision, not built out.** `p ⊙ w → renormalize` needs
   `udm_matrix_cells REAL`; v0.2's structural containment does not. Deferring it keeps the
   soundness property as-is; adopting it reopens `udm_mode`. A decision, not a gap — but the
   graded projection matrix `B` (aggregate governance dimensions like "PII density") is
   explicitly **not implemented today**. *(SCOPE.md; `point-of-inflection.md` §5)*

3. **The interpreter is not yet bound to the live matrix vocabulary.** `igl-v1`'s FUSE runs
   over the token vocabulary of SPEC §12.03, deliberately distinct from the deployed matrix's
   reasoning-path vocabulary. Binding them is a vocabulary-crosswalk *design item*, not a
   switch, and is not claimed as done. *(ADR-0001)*

4. **Key persistence is a standing production requirement, not a completed one.** Production
   receipts must be signed by a persistent, KMS- or secret-seeded key with its public key
   published; per-instance `Signer.generate()` is test-only. Moving the signing seed to a KMS
   or Worker secret remains outstanding. *(ADR-0001 item 4)*

5. **Claims IGL explicitly forbids itself from making.** No hardware interrupts, SRAM purges,
   gate-voltage resets, or "automatic authority revocation." The substrate is Cloudflare
   Workers (V8 isolates); the halt analogue for self-hosted inference is KV-cache eviction —
   an API call, not electronics. The hash chain makes tampering *detectable and provable*, not
   physically impossible. *(`point-of-inflection.md` §6–§7)*

---

### 6. Positioning

The Action Plan sets a national objective it can only exhort toward: AI that is robust,
controllable, attributable, and trustworthy without being slowed down. IGL is a concrete,
narrow instrument for the last mile of that objective — the point where a governed model
turns probability into a decision that carries a signature. Its two properties are worth
stating plainly, and only as far as they go:

> **Factual alignment**, where it exists: the probabilistic channel proposes; only the
> deterministic or human channel makes fact — and the record proves which did.
>
> **Fully-capable alignment**, where it exists: the constraint lives inside the generation
> step, so a prohibited path is never drawn and every permitted path keeps the model's full
> power. Governance without a capability tax.

Where they do not yet exist, Section 5 says so. That refusal to overclaim is not a weakness in
the pitch; for a governance language, it is the product.
