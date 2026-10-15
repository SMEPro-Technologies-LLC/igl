# Boundary and footprint as computing substance

*Companion to SPEC.md §9. Implementation: `src/graph.js`. Tests: `test/graph.test.js`.*

---

## 1. What changed

In the static conception, footprint is a lookup: `F(actor) = registry[actor]`.
It is authored, it sits there, and it is correct until someone edits it.

In this design, footprint and boundary are **folds over the trace stream**.
After each turn, the system replays the trace and updates the person's footprint
or the company's boundary:

```
F_t(actor)   = F_{t-1} ⊕ δ(trace_t)
B_t(company) = B_{t-1} ⊕ δ(trace_t)
```

TurnTrace is the write-ahead log, and the graphs are views built from it. This
provides three useful properties and requires three safeguards.

**Free:** the graphs are reconstructible by replay; they are auditable without a
separate audit table; and "current" is the fold running continuously rather than
a batch job with a staleness window.

**Attached:** the merge must be incremental and associative (§3); the past must
be reconstructible (§4); and the descriptive and prescriptive layers must not
share a channel (§2).

---

## 2. The two layers, and why they are separate

A learned footprint can answer two different questions, and conflating them is
the failure that quietly dissolves the governance model.

| Layer | Question | Moves on | Decays |
|---|---|---|---|
| `granted` | what this actor **may** do | explicit signed grant / revoke | never |
| `observed.governing` | what this actor **demonstrably did** | `deterministic` and `human` deltas | yes, by recency |
| `observed.proposed` | what this actor **appears to do** | `ai` deltas | yes, by recency |

`authorize()` reads `granted`. Only `granted`. Nothing else.

### 2.1 Why observation must not confer authority

If the same fold widens both layers, the system grants permissions by habit. An
operator who repeatedly files in a jurisdiction accumulates evidence that they
file there; if that evidence reaches the authorising layer, the system may
treat the action as allowed because it has seen it before. No one granted that
permission. The system inferred it from activity that was possible only because
of an earlier permission, which has now been silently generalised.

`test/graph.test.js` asserts this directly: five hundred consistent observations
of `NM-OCD` leave `authorize()` returning false. The violation says it plainly:
*observed 500× but observation does not confer authority*.

### 2.2 Why AI-class evidence must not promote at any volume

This is SPEC §9's anchoring rule applied one layer down.

The containment invariant is: UDM computes the admissible set, AI proposes an
element, AI can never widen the set. But if the admissibility sets are
themselves learned from traces, and traces carry AI-class assertions, then
inference widens the set, slowly, through the learning channel rather than
through proposal. The brake becomes learnable, and over enough turns it can be
learned away.

So the promotion rule is by class, never by count:

```
δ_ai            → observed.proposed      never governing, at any volume
δ_deterministic → observed.governing     agency publication, executed instrument, verified hash
δ_human         → observed.governing     attested by a named signer
```

Ten thousand consistent AI inferences remain proposals. One attested fact can
enter the governing layer. The proposed layer accumulates candidate observations
with each turn, while the governing layer changes only when evidence is anchored.

### 2.3 Promotion is surfaced, never applied

`promotions(actor)` returns what the graph has learned and cannot act on:

```
{ dimension: "Jurisdiction", value: "NM-OCD", layer: "governing",
  anchored: 4, count: 4, weight: 3.9, eligible: true,
  rationale: "4 anchored observations qualify for a grant by a signer" }

{ dimension: "Jurisdiction", value: "LA-DNR", layer: "proposed",
  anchored: 0, count: 99, weight: 96.2, eligible: false,
  rationale: "AI-class observation only; cannot promote at any volume. Re-derive from source or attest." }
```

Eligibility is not application. A human signs, or nothing moves.

---

## 3. The merge

`⊕` is defined per dimension and must be associative and commutative, so the
log can be sharded, replayed partially, or folded out of order and reach the
same state. Counts add; time bounds take min and max; class takes the strongest
seen. None of those operations care about order.

Containment is also per dimension, because a lattice join on `Jurisdiction` and
a temporal comparison on `Period` are different operations:

| Type | Containment |
|---|---|
| `set` | membership |
| `lattice` | Membership or membership of an ancestor. For example, `US-TX` covers `TX-RRC`, but not the reverse. |
| `custom` | a supplied `contains(granted, value)` predicate |

The projection sorts dimensions and values into canonical order, so
two folds of the same events serialise identically. Without that, the state is
set-equal but not hashable, and a footprint cannot be diffed or committed to a
trace by digest. (This was a real bug, caught by the shuffle test.)

---

## 4. Reconstruction, decay, and disuse

**`project(asOf)` replays the log to a timestamp.** A statement executed in
2026-Q1 must be audited against the footprint as it stood then. Judging a past
authorisation by present authority is the wrong answer to the question a
regulator actually asks. This is also the strongest argument for TurnTrace
retaining *all* event types: drop one and the projection stops being
reconstructible, and the audit chain degrades to "trust the current state."

**Descriptive weight decays with recency:**

```
weight = count × 0.5 ^ (days_since_last / half_life)
```

An actor who has not operated somewhere in three years probably does not.

**Prescriptive authority does not decay.** A grant unused for five years still
authorises. If permissions expired through disuse, access could change without
anyone revoking it. That would be a silent security event. Revocation is
explicit, signed, and takes effect at the next `authorize()`, which is why
footprints are resolved live rather than cached.

---

## 5. Where this sits in the interpreter

Two lines, at two points in the fixed evaluation order:

**Step 2b, before any compute step runs:** check that `boundary ⊆ granted footprint`.
Otherwise return `IGL_FOOTPRINT_DENIED`. An unauthorised statement never reaches a model call and
never writes a trace.

**Step 9b, after the trace is durable:** call `identity.fold(trace)`. The committed
trace folds straight back into the graph, and its own attestation class decides
which layer it can reach. This is the loop closing: execute → trace → fold →
richer graph → next statement reasons over more.

The loop cannot grant itself new authority. Only signed grants can authorize an action:

> The graph records observations, but only signed grants authorize actions.
