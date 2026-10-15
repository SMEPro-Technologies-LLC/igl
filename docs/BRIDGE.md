# The UDM ↔ AI translation

*Implementation: `src/bridge.js`, `AIRuntime.extract`. Tests: `test/bridge.test.js` (21), `test/extract.test.js` (7).*

---

## 1. The mismatch between representations

UDM computes over a **discrete lattice**: finite sets, partial orders, exact
membership. Meet, join, containment, projection. Errors are categorical.

The model computes over **continuous geometry**: vectors in `ℝ^d`, dot
products, softmax. Similarity-weighted averaging. Errors are graded.

The bridge connects these representations with an adjoint pair that satisfies
this soundness condition:

```
γ : UDM_set      → model_constraint      decode down
α : model_output → UDM_element           lift up

soundness:  α(γ(S)) ⊆ ↓S ∪ {ABSTAIN}
```

In this implementation, `↓S` is the downward closure of the admissible set.
With lattice strictness, a specialisation of an admissible value stays inside
the governed region. Broader or unrelated values do not.
`ABSTAIN` is a distinguished outcome consumers must handle, not a member of S.
Span and text slots are outside this property and carry their own guarantee:
fidelity to cited characters (§4).

Soundness does **not** require the model to be correct, calibrated, or
consistent. It requires only that the output stay within the governed region.

`test/bridge.test.js` checks 1,800 set-slot round trips across three strictness
levels and 500 span-fidelity cases with randomised offsets. These tests include
a live lattice slot and check that no value escapes the governed region.

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
| **Schema enum** | The admissible set becomes `{"type":"string","enum":[...]}`. Hosted APIs can then constrain decoding on the server. |
| **Prefix automaton** | With a tokenizer, `maskPlan` builds a trie from each value's token sequence. At each step, only tokens that continue an admissible value are allowed. A flat token union could allow invalid combinations such as `PR-10` assembled from `PR-202` and `H-10`. `Bridge.maskNext(auto, prefix)` returns the exact allowed tokens at each step and rejects prefixes outside the language. |
| **Abstain token** | Always available. See §2.1. |
| **Pre-resolved scope** | UDM resolves `R[scope]` first, so the model attends over a small exact set instead of searching |

The envelope carries a **manifest** with the schema digest, scope digest,
strictness, thresholds, and slot kinds. The manifest is stored in the trace.
Without it, you can audit
what was produced but not *why it was admissible*, which is the question
actually asked. Digests are SHA-256 over canonical (sorted-key) JSON, so two
equivalent envelopes digest identically and the digest carries the same
evidentiary weight as the rest of the audit regime.

### 2.1 Abstention is not optional

If only three forms are allowed, the model must return one even when none
applies. Add `ABSTAIN` to every enum and leave it unmasked so the model can
indicate that no allowed value fits.

---

## 3. α: lifting output back into governed structure

**Projection with declared strictness.**

| Strictness | Accepts |
|---|---|
| `exact` | membership only |
| `lattice` | membership, plus *specialisations* of an admissible value |
| `fuzzy` | the above, plus normalisation; edit distance ≤ 1 for `enum` slots only |

Two rules apply to fuzzy matching. If a candidate is equally close to two
members (`X-10` against `H-10`/`W-10`), the bridge returns `ambiguous` and
records both candidates. A first-match choice could select the wrong
regulatory code. **Edit distance does not apply to `code` slots**: `US-TN` and `US-TX`
refer to different jurisdictions, so one cannot be treated as a typo for the
other.
Normalisation (case, separators) remains available for both kinds.

The lattice case is asymmetric on purpose. If `US-TX` is admissible and the
model returns `TX-RRC`, that is a **specialisation**, narrower than allowed,
and it is accepted with `coveredBy: US-TX` recorded. If `TX-RRC` is admissible
and the model returns `US-TX`, that is a **generalisation**, broader than
allowed, and it is refused with `wouldBroaden` recorded. Values broader than
the allowed set are rejected.

**Uncertainty converts to class.** A float crossing into a discrete system
either becomes a class via declared thresholds or is dropped. `≥0.75 →
admissible`, `≥0.40 → proposed`, below → `held`. Both the band and the raw float
land in the trace; only the band is visible downstream.

**Verification is unconditional.** Every lifted value re-enters through
`UDM.Validate`. Masking guarantees well-formedness, not appropriateness.

---

## 4. Read numbers from source documents

A quantity is never generated. `kind: "number"` is not a declarable slot: it
throws, with a message pointing at `span`.

The model returns a **reference**:

```json
{ "total_charges": { "file": "USSH004120", "charOffset": 8412, "length": 13 } }
```

`charOffset` counts UTF-16 code units. A producer that calculates byte offsets
must convert them before using this field.

α validates the reference against the schema it emitted (`additionalProperties`
is enforced locally, not merely declared. A span that includes a `value` key is
void), checks `file` against the corpus manifest, verifies the source document's
SHA-256 against the manifest, reads the characters, and parses them
deterministically. The adversarial test makes this concrete: a model pointing at
the right span while claiming the value is `999` either has its extra key
rejected by the schema or, with a valid reference, the extracted value is what the
characters say.

Currency parses to **integer minor units** (`$1,247,893.00` → `124789300`
cents), degrading to a decimal string beyond the safe-integer range; generic
numbers parse to canonical decimal strings. Binary floating point is the wrong
representation for money by exactly the argument that bars model-generated
numbers. The cited characters and pinned document digest remain the
authority, even after the source is re-OCRed or re-exported.

This matters because of how tokenisation works. `1,247,893` has no fixed
magnitude in
the model's representation: it is a token sequence whose embeddings encode
co-occurrence statistics. Arithmetic emerges as pattern-matching and degrades
with digit count and unit conversion. For production volumes, severance tax, or damages tallies, that makes
model-generated numbers unsuitable.

AI identifies where a value appears. UDM performs the calculation.

### 4.1 Provenance is deterministic; selection is inference

A span-derived value carries two classes: `valueClass` describes how the value
was obtained, and `locationClass` describes how the span was selected.
The system sets `valueClass` based on `locationClass`:

| Location band | Result |
|---|---|
| `admissible` (≥ 0.75) | `valueClass: deterministic`; the value does not decay and has zero depth |
| `proposed` (≥ 0.40) | `valueClass: proposed`; the trace class is `ai` and the value enters the drift budget |
| `unstated` (no confidence reported) | `valueClass: proposed`; missing confidence does not count as evidence of confidence |
| `held` (< 0.40) | **Dropped**, as described in §3 |

Without the gate, a model that was 20% sure where to look could mint a
non-decaying, zero-depth anchor by pointing at a subtotal or the adjacent
column: faithfully-read wrong bytes would enter the corpus as `deterministic`.
The gate applies the same rule as `graph.js` §2.1 to extraction.
Reading is deterministic, but *what was read* is only as anchored as the
decision about where to read.

An extraction is classed `deterministic` at the trace level only when every
surviving value cleared the gate.

---

## 5. In the language

```
AI.Extract(Slots=[total_charges, diagnosis], Model=claude-sonnet-5, Seed=5)
```

`Slots` names entries in the governed slot registry (`SLOTS` in `builtins.js`).
A slot outside it is refused. Scope-dependent admissible sets are computed by
UDM computes the set at the live boundary. It determines *which forms exist at
this agency in this period* rather than relying on hardcoded values. An empty
set fails closed rather than
falling back to unconstrained generation.

`AI.Extract` is the only call permitted to put a number into an output.

---

## 6. One practical constraint

True logit masking needs logit-level access. With hosted APIs you have JSON
schema (server-side constrained decoding) and logprobs, which are enough for most of γ
and all of α. With open weights, the prefix automaton in `maskPlan` drives an
exact per-step mask: at each sampling step, `Bridge.maskNext(automaton,
emittedPrefix)` yields the allow-set, everything else gets `logit = −∞`.

Either way, α re-projects and re-verifies. The mask reduces wasted sampling;
α carries the guarantee. The soundness test is identical across the swap, so
the conformance property holds regardless of which mechanism is underneath.
Supply a `tokenizer` to `Bridge` and `maskPlan` populates; omit it and the
schema carries the constraint.
