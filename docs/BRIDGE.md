# The UDM ↔ AI translation

*Implementation: `src/bridge.js`, `AIRuntime.extract`. Tests: `test/bridge.test.js` (21), `test/extract.test.js` (7).*

---

## 1. The mismatch

UDM computes over a **discrete lattice**: finite sets, partial orders, and exact
membership. Meet, join, containment, projection. Errors are categorical.

The model computes over **continuous geometry**: vectors in `ℝ^d`, dot
products, softmax. Similarity-weighted averaging. Errors are graded.

There is no natural map. What we build is an adjoint pair with a soundness
condition binding it:

```
γ : UDM_set      → model_constraint      decode down
α : model_output → UDM_element           lift up

soundness:  α(γ(S)) ⊆ ↓S ∪ {ABSTAIN}
```

Stated in the form implemented. `↓S` is the downward closure of the admissible
set. Under lattice strictness, a specialisation of an admissible value lies
inside the governed region, while anything broader or lateral does not.
`ABSTAIN` is a distinguished outcome consumers must handle, not a member of S.
Span and text slots are outside this property and carry their own guarantee:
fidelity to cited characters (§4).

Note what soundness does **not** require: that the model be correct, calibrated,
or consistent. The only requirement is that its output stays within the
governed region. This guarantees containment without requiring trust in the model.

`test/bridge.test.js` fuzzes 1,800 set-slot round trips across three strictness
levels, including a live lattice slot that exercises the specialisation and
generalisation-refusal paths. It also runs 500 span-fidelity trips with
randomised offsets and asserts zero escapes. That property is the
difference between a translation layer and prompt engineering.

---

## 2. γ: decoding UDM into the model's arithmetic

Serialising UDM state into the prompt loses on three counts: the lattice
structure is discarded (the model re-infers `TX-RRC ≤ US-TX` probabilistically
when UDM knew it exactly), the constraint becomes a suggestion because nothing
in the sampler enforces it, and the output must be parsed back from free text
where parse ambiguity becomes semantic error.

So γ emits a constraint, not a description:

| Mechanism | Effect |
|---|---|
| **Schema enum** | The admissible set becomes `{"type":"string","enum":[...]}`. Hosted APIs can use server-side constrained decoding. |
| **Prefix automaton** | With a tokenizer, `maskPlan` is a trie over each value's token sequence. At every step, only tokens that continue an admissible completion are allowed. A flat token union could admit recombinations (`PR-10` assembled from `PR-202` and `H-10`); the automaton prevents them. `Bridge.maskNext(auto, prefix)` returns the allowed tokens for each step, and an invalid prefix is rejected immediately. |
| **Abstain token** | Always reachable (see §2.1). |
| **Pre-resolved scope** | UDM resolves `R[scope]` first, so the model attends over a small exact set instead of searching |

The envelope carries a **manifest** with the schema digest, scope digest,
strictness thresholds, and slot kinds. The trace stores this manifest so you can audit
what was produced but not *why it was admissible*, which is the question
actually asked. Digests are SHA-256 over canonical (sorted-key) JSON, so two
equivalent envelopes digest identically and the digest carries the same
evidentiary weight as the rest of the audit regime.

### 2.1 Abstention is not optional

Mask everything except three forms and the model **will** pick one, whether or
not any applies. A forced choice from a constrained vocabulary produces
confident garbage. `ABSTAIN` is added to every enum and left unmasked.

---

## 3. α: lifting output back into governed structure

**Projection with declared strictness.**

| Strictness | Accepts |
|---|---|
| `exact` | membership only |
| `lattice` | membership, plus *specialisations* of an admissible value |
| `fuzzy` | the above, plus normalisation; edit distance ≤ 1 for `enum` slots only |

Two rules apply to fuzzy matching. **Ties are rejected**: a candidate equidistant
from two values (`X-10` against `H-10` and `W-10`) is marked `ambiguous`.
Regulatory codes are close together in edit distance, so choosing the first
match could silently select the wrong one. **Edit distance is never used for
`code` slots**. `US-TN` is a different jurisdiction from `US-TX`, not a typo.
Normalisation (case, separators) remains available for both kinds.

The lattice case is asymmetric on purpose. If `US-TX` is admissible and the
model returns `TX-RRC`, the result is a **specialisation**. It is narrower than
the allowed value and is accepted with `coveredBy: US-TX` recorded. If `TX-RRC`
is admissible and the model returns `US-TX`, the result is a **generalisation**.
It is broader than allowed and is refused with `wouldBroaden` recorded. Going broader than
permitted is precisely the move governance exists to stop.

**Uncertainty converts to class.** A float crossing into a discrete system
either becomes a class via declared thresholds or is dropped. `≥0.75 →
admissible`, `≥0.40 → proposed`, below → `held`. Both the band and the raw float
land in the trace; only the band is visible downstream.

**Verification is unconditional.** Every lifted value re-enters through
`UDM.Validate`. Masking guarantees well-formedness, not appropriateness.

---

## 4. The rule that matters most: numbers never round-trip

A quantity is never generated. Declaring `kind: "number"` as a slot throws an
error that points to `span`.

The model returns a **reference**:

```json
{ "total_charges": { "file": "USSH004120", "charOffset": 8412, "length": 13 } }
```

`charOffset` counts UTF-16 code units. A producer that calculates byte offsets
must convert them, including when the text contains non-ASCII characters.

α validates the reference against the emitted schema. It rejects extra
properties such as a `value` key, checks `file` against the corpus manifest,
verifies the source document's SHA-256 digest, and reads and parses the cited
characters. The adversarial test shows why: if a model points at the right span
but claims the value is `999`, schema validation rejects the extra property.
With a valid reference, IGL returns the value found in the cited characters.

Currency parses to **integer minor units** (`$1,247,893.00` → `124789300`
cents), degrading to a decimal string beyond the safe-integer range; generic
numbers parse to canonical decimal strings. Binary floating point is the wrong
representation for money by exactly the argument that bars model-generated
numbers. The evidence consists of the cited characters and the pinned document digest.
remains the authority, and survives re-OCR or re-export of the source.

This matters because of how tokenisation works. `1,247,893` has no magnitude in
the model's representation. It is a token sequence whose embeddings encode
co-occurrence statistics. Arithmetic emerges as pattern-matching and degrades
with digit count and unit conversion. For production volumes, severance tax, or
damages tallies that is disqualifying.

**AI locates. UDM computes.**

### 4.1 Provenance is deterministic; selection is inference

A span-derived value carries two classes: `valueClass` describes how the value
was obtained, and `locationClass` describes how the span was chosen.
`valueClass` is **gated on `locationClass`**:

| Location band | Result |
|---|---|
| `admissible` (≥ 0.75) | `valueClass: deterministic`; an anchor that never decays and has zero depth |
| `proposed` (≥ 0.40) | `valueClass: proposed`; trace class becomes `ai` and enters the drift budget |
| `unstated` (no confidence reported) | `valueClass: proposed`; no confidence report is not evidence of confidence |
| `held` (< 0.40) | **Dropped** (see §3). |

Without the gate, a model that was 20% sure where to look could mint a
non-decaying, zero-depth anchor by pointing at a subtotal or the adjacent
column: faithfully-read wrong bytes would enter the corpus as `deterministic`.
The gate applies the same rule as `graph.js` §2.1 to extraction. Reading the
characters is deterministic, but *what was read* is only as anchored as the
decision about where to read.

An extraction is classed `deterministic` at the trace level only when every
surviving value cleared the gate.

---

## 5. In the language

```
AI.Extract(Slots=[total_charges, diagnosis], Model=claude-sonnet-5, Seed=5)
```

`Slots` names entries in the governed slot registry (`SLOTS` in `builtins.js`).
A slot outside it is refused. Scope-dependent admissible sets are computed by UDM at the live boundary. This
answers *which forms exist at this agency in this period* without hardcoding
them. If the resolved set is empty, execution fails closed instead of falling
back to unconstrained generation.

`AI.Extract` is the only call permitted to put a number into an output.

---

## 6. One practical constraint

True logit masking needs logit-level access. Hosted APIs provide JSON schema
(server-side constrained decoding) and log probabilities. These are enough for
most of γ and all of α. With open weights, the prefix automaton in `maskPlan` drives an
exact per-step mask: at each sampling step, `Bridge.maskNext(automaton,
emittedPrefix)` yields the allow-set, everything else gets `logit = −∞`.

Either way, α re-projects and re-verifies the output. The mask reduces wasted
sampling; α carries the guarantee. The soundness test is identical across the swap, so
the conformance property holds regardless of which mechanism is underneath.
Supply a `tokenizer` to `Bridge` and `maskPlan` populates; omit it and the
schema carries the constraint.
