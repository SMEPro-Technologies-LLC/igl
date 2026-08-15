# The UDM ↔ AI translation

*Implementation: `src/bridge.js`, `AIRuntime.extract`. Tests: `test/bridge.test.js` (21), `test/extract.test.js` (7).*

---

## 1. The mismatch

UDM computes over a **discrete lattice** — finite sets, partial orders, exact
membership. Meet, join, containment, projection. Errors are categorical.

The model computes over **continuous geometry** — vectors in `ℝ^d`, dot
products, softmax. Similarity-weighted averaging. Errors are graded.

There is no natural map. What we build is an adjoint pair with a soundness
condition binding it:

```
γ : UDM_set      → model_constraint      decode down
α : model_output → UDM_element           lift up

soundness:  α(γ(S)) ⊆ ↓S ∪ {ABSTAIN}
```

Stated in the form implemented. `↓S` is the downward closure of the admissible
set — under lattice strictness a specialisation of an admissible value lies
inside the governed region, while anything broader or lateral does not.
`ABSTAIN` is a distinguished outcome consumers must handle, not a member of S.
Span and text slots are outside this property and carry their own guarantee:
fidelity to cited characters (§4).

Note what soundness does **not** require: that the model be correct, calibrated,
or consistent. Only that its output cannot escape the governed region —
containment without trust.

`test/bridge.test.js` fuzzes 1,800 set-slot round trips across three strictness
levels — including a live lattice slot, so the specialisation and
generalisation-refusal paths are demonstrably exercised — plus 500 span-fidelity
trips with randomised offsets, and asserts zero escapes. That property is the
difference between a translation layer and prompt engineering.

---

## 2. γ — decoding UDM into the model's arithmetic

Serialising UDM state into the prompt loses on three counts: the lattice
structure is discarded (the model re-infers `TX-RRC ≤ US-TX` probabilistically
when UDM knew it exactly), the constraint becomes a suggestion because nothing
in the sampler enforces it, and the output must be parsed back from free text
where parse ambiguity becomes semantic error.

So γ emits a constraint, not a description:

| Mechanism | Effect |
|---|---|
| **Schema enum** | the admissible set becomes `{"type":"string","enum":[...]}` — server-side constrained decoding on hosted APIs |
| **Prefix automaton** | with a tokenizer, `maskPlan` is a trie over each value's token sequence: at every step only tokens that continue at least one admissible completion of the emitted prefix are allowed. A flat token union would admit recombinations (`PR-10` assembled from `PR-202` and `H-10`); the automaton makes them unreachable — `Bridge.maskNext(auto, prefix)` returns the exact allow-set per step, and a prefix outside the language is dead immediately |
| **Abstain token** | always reachable — see §2.1 |
| **Pre-resolved scope** | UDM resolves `R[scope]` first, so the model attends over a small exact set instead of searching |

The envelope carries a **manifest** — schema digest, scope digest, strictness,
thresholds, slot kinds — which goes into the trace. Without it you can audit
what was produced but not *why it was admissible*, which is the question
actually asked. Digests are SHA-256 over canonical (sorted-key) JSON, so two
equivalent envelopes digest identically and the digest carries the same
evidentiary weight as the rest of the audit regime.

### 2.1 Abstention is not optional

Mask everything except three forms and the model **will** pick one, whether or
not any applies. A forced choice from a constrained vocabulary produces
confident garbage. `ABSTAIN` is added to every enum and left unmasked.

---

## 3. α — lifting output back into governed structure

**Projection with declared strictness.**

| Strictness | Accepts |
|---|---|
| `exact` | membership only |
| `lattice` | membership, plus *specialisations* of an admissible value |
| `fuzzy` | the above, plus normalisation; edit distance ≤ 1 for `enum` slots only |

Two disciplines on the fuzzy path. **Ties refuse**: a candidate equidistant from
two members (`X-10` against `H-10`/`W-10`) is rejected as `ambiguous` with the
candidates recorded — regulatory codes are dense in edit space, so a silent
first-match pick is a wrong pick half the time. And **edit distance never
applies to `code` slots**: `US-TN` is not a typo for `US-TX`, it is a different
jurisdiction; a one-edit repair on a code is a different instrument.
Normalisation (case, separators) remains available for both kinds.

The lattice case is asymmetric on purpose. If `US-TX` is admissible and the
model returns `TX-RRC`, that is a **specialisation** — narrower than allowed —
and it is accepted with `coveredBy: US-TX` recorded. If `TX-RRC` is admissible
and the model returns `US-TX`, that is a **generalisation** — broader than
allowed — and it is refused with `wouldBroaden` recorded. Going broader than
permitted is precisely the move governance exists to stop.

**Uncertainty converts to class.** A float crossing into a discrete system
either becomes a class via declared thresholds or is dropped. `≥0.75 →
admissible`, `≥0.40 → proposed`, below → `held`. Both the band and the raw float
land in the trace; only the band is visible downstream.

**Verification is unconditional.** Every lifted value re-enters through
`UDM.Validate`. Masking guarantees well-formedness, not appropriateness.

---

## 4. The rule that matters most: numbers never round-trip

A quantity is never generated. `kind: "number"` is not a declarable slot — it
throws, with a message pointing at `span`.

The model returns a **reference**:

```json
{ "total_charges": { "file": "USSH004120", "charOffset": 8412, "length": 13 } }
```

`charOffset` is named for what it indexes — UTF-16 code units — so a producer
computing true byte offsets knows a conversion is required rather than
discovering it at the first non-ASCII character.

α validates the reference against the schema it emitted (`additionalProperties`
is enforced locally, not merely declared — a span smuggling a `value` key is
void), checks `file` against the corpus manifest, verifies the source document's
SHA-256 against the manifest, reads the characters, and parses them
deterministically. The adversarial test makes this concrete: a model pointing at
the right span while claiming the value is `999` either has its extra key voided
at the schema, or — with a clean reference — the extracted value is what the
characters say.

Currency parses to **integer minor units** (`$1,247,893.00` → `124789300`
cents), degrading to a decimal string beyond the safe-integer range; generic
numbers parse to canonical decimal strings. Binary floating point is the wrong
representation for money by exactly the argument that bars model-generated
numbers. The evidence — cited characters plus the pinned document digest —
remains the authority, and survives re-OCR or re-export of the source.

This matters because of how tokenisation works. `1,247,893` has no magnitude in
the model's representation — it is a token sequence whose embeddings encode
co-occurrence statistics. Arithmetic emerges as pattern-matching and degrades
with digit count and unit conversion. For production volumes, severance tax, or
damages tallies that is disqualifying.

**AI locates. UDM computes.**

### 4.1 Provenance is deterministic; selection is inference

A span-derived value carries two classes — `valueClass` (how the value came to
be) and `locationClass` (how the span was chosen) — and the first is **gated on
the second**:

| Location band | Result |
|---|---|
| `admissible` (≥ 0.75) | `valueClass: deterministic` — an anchor: never decays, zero depth |
| `proposed` (≥ 0.40) | `valueClass: proposed` — trace class falls to `ai`, enters the drift budget |
| `unstated` (no confidence reported) | `valueClass: proposed` — absence of a confidence is not evidence of confidence |
| `held` (< 0.40) | **dropped** — held means held, exactly as §3 defines it |

Without the gate, a model that was 20% sure where to look could mint a
non-decaying, zero-depth anchor by pointing at a subtotal or the adjacent
column: faithfully-read wrong bytes would enter the corpus as `deterministic`.
The gate is the same asymmetry as `graph.js` §2.1, applied to extraction —
reading is deterministic, but *what was read* is only as anchored as the
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
UDM at the live boundary — *which forms exist at this agency in this period* —
rather than hardcoded, and an empty resolved set fails closed rather than
falling back to unconstrained generation.

`AI.Extract` is the only call permitted to put a number into an output.

---

## 6. One practical constraint

True logit masking needs logit-level access. With hosted APIs you have JSON
schema (server-side constrained decoding) and logprobs — enough for most of γ
and all of α. With open weights, the prefix automaton in `maskPlan` drives an
exact per-step mask: at each sampling step, `Bridge.maskNext(automaton,
emittedPrefix)` yields the allow-set, everything else gets `logit = −∞`.

Either way, α re-projects and re-verifies — the mask reduces wasted sampling;
α carries the guarantee. The soundness test is identical across the swap, so
the conformance property holds regardless of which mechanism is underneath.
Supply a `tokenizer` to `Bridge` and `maskPlan` populates; omit it and the
schema carries the constraint.
