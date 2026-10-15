# How boundaries and footprints update

*Companion to SPEC.md §9. Implementation: `src/graph.js`. Tests: `test/graph.test.js`.*

---

## 1. How the graph is updated

In a static design, a footprint is a lookup: `F(actor) = registry[actor]`.
Someone creates or edits the registry entry.

In IGL, footprint and boundary are **folds over the trace stream**. The runtime
recomputes them from recorded events, so they reflect the current state:

```
F_t(actor)   = F_{t-1} ⊕ δ(trace_t)
B_t(company) = B_{t-1} ⊕ δ(trace_t)
```

TurnTrace acts as the write-ahead log, and the graphs are materialised views.
This makes replay and auditing possible, but requires three properties:

The graphs can be rebuilt by replay and audited without a separate audit table.
The current state is the latest fold, not a batch result that may be stale.

The merge must be incremental and associative (§3), past state must be
reconstructible (§4), and descriptive data must stay separate from granted
authority (§2).

---

## 2. The two layers, and why they are separate

A learned footprint can answer two different questions. Keep them separate so
observations are not treated as permissions.

| Layer | Question | Moves on | Decays |
|---|---|---|---|
| `granted` | what this actor **may** do | explicit signed grant / revoke | never |
| `observed.governing` | what this actor **demonstrably did** | `deterministic` and `human` deltas | yes, by recency |
| `observed.proposed` | what this actor **appears to do** | `ai` deltas | yes, by recency |

`authorize()` reads `granted`. Only `granted`. Nothing else.

### 2.1 Why observation must not confer authority

If one fold widened both layers, the system could grant permissions based on
habit. An
operator who repeatedly files in a jurisdiction accumulates evidence that they
file there; if that evidence reaches the authorising layer, the system
eventually concludes they are allowed to, based on their own
behaviour. The permission was never granted by anyone; it was inferred from
activity, and the activity was only possible because of some earlier permission
that has now been silently generalised.

`test/graph.test.js` checks this directly: five hundred observations of `NM-OCD`
still leave `authorize()` returning false. The test confirms that observation
does not grant authority.

### 2.2 Why AI-class evidence must not promote at any volume

This is SPEC §9's anchoring rule applied one layer down.

The containment invariant is: UDM computes the admissible set, AI proposes an
element, AI can never widen the set. But if the admissibility sets are
themselves learned from traces, and traces carry AI-class assertions, then
inference widens the set gradually through the learning channel. Over time, the
system could include values that were never approved.

So the promotion rule is by class, never by count:

```
δ_ai            → observed.proposed      never governing, at any volume
δ_deterministic → observed.governing     agency publication, executed instrument, verified hash
δ_human         → observed.governing     attested by a named signer
```

AI inferences remain proposals, regardless of their count. An attested fact can
inform the governing layer. The proposed layer accumulates observations, while
the governing layer changes only when evidence is anchored.

### 2.3 Promotion is surfaced, never applied

`promotions(actor)` returns what the graph has learned and cannot act on:

```
{ dimension: "Jurisdiction", value: "NM-OCD", layer: "governing",
  anchored: 4, count: 4, weight: 3.9, eligible: true,
  rationale: "4 anchored observation(s): eligible for grant by a signer" }

{ dimension: "Jurisdiction", value: "LA-DNR", layer: "proposed",
  anchored: 0, count: 99, weight: 96.2, eligible: false,
  rationale: "AI-class observation only: cannot promote at any volume; re-derive from source or attest" }
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
| `lattice` | membership, or membership of any ancestor: `US-TX` covers `TX-RRC`, and not the reverse |
| `custom` | a supplied `contains(granted, value)` predicate |

The projection is emitted in canonical order (dimensions and values sorted), so
two folds of the same events serialise identically. Without that the state is
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
anyone revoking a grant. Revocation is
explicit, signed, and takes effect at the next `authorize()`, which is why
footprints are resolved live rather than cached.

---

## 5. Where this sits in the interpreter

Two lines, at two points in the fixed evaluation order:

**Step 2b, before any compute step runs**: `boundary ⊆ granted footprint`, or
`IGL_FOOTPRINT_DENIED`. An unauthorised statement never reaches a model call and
never writes a trace.

**Step 9b, after the trace is durable**: `identity.fold(trace)`. The committed
trace folds straight back into the graph, and its own attestation class decides
which layer it can reach. This is the loop closing: execute → trace → fold →
richer graph → next statement reasons over more.

The loop cannot grant new authority. Only a signed grant or revocation can
change the `granted` layer.
