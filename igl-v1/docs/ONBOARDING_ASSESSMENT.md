# Assessment: "IGL Onboarding and Runtime Agent Governance" against the igl-v1 runtime

Date: 2026-08-14. Assessed tree: `igl-v1/` (canonical per ADR-0001).
Source document: *IGL Onboarding and Runtime Agent Governance* (VDRPros use case appended).

This is a read-only assessment. Nothing in `igl-v1/` was modified. Every claim below
names the file and line that supports it, in the same discipline `point-of-inflection.md`
imposes on marketing copy: nothing is asserted about the code in the present tense that
the code does not do.

---

## 1. Verdict up front

The document is worth adopting, but not as written and not for the reason it appears to
offer. Its stated novelty — vectors, boundaries, recursive learning — is the part
`igl-v1` already has or already refuses on principle. Its real contribution is a
**typed, multi-dimensional authority model with a three-valued runtime outcome**, and
holding the runtime up against that model exposes a live defect: **the language
interpreter parses, validates, and then never enforces boundary strictness.** The
`BOUNDARY_TENSOR` and its `HARD`/`SOFT` field are decoration on the `igl-v1`
interpreter path today.

Three findings, ranked:

1. **Defect exposed (highest value).** `Interpreter.fuseDist` hardcodes
   `outcome = "COMPLIANT"`. Ceilings are computed nowhere on that path.
   `WHEN_BOUNDARY` can only ever take its `WITHIN` branch. §4 of the document
   ("ALLOW / SOFT / HARD") is the specification of the missing behaviour, and the
   enforcement code already exists two files away in `udm.js`.
2. **Genuine addition.** The workspace boundary `C_d` — authority compiled from
   onboarding selections rather than declared per-identity in the program — does not
   exist anywhere in `igl-v1`. This is the one structurally new idea.
3. **Already built, wrong tree.** The document's `τ_d = MIN(C_d, P_d)` intersection
   model is implemented, well, in `src/graph.js` at the repo root — typed dimensions,
   lattice containment, per-dimension violations, `granted` vs `observed`, `asOf`
   replay. It is absent from `igl-v1`. The work is a port, not an invention.

---

## 2. What the document actually is

It is three documents concatenated, and they have different standing:

| Part | Content | Standing |
|---|---|---|
| §§1–6, §0–§0.3 | Governance instruction set: boundary compilation, activation rules, runtime gate, receipt obligation | **Normative candidate.** This is the part worth engineering against. |
| §§7–11, §§12–14 | Explainer: "vectors are GPS coordinates for meaning", recursive learning, Universal Decoding Matrix summary | **Explanatory.** Mostly restates what exists; §7–§9 introduce a claim the code cannot back (see §6 below). |
| VDRPros blueprint (positioning, personas, SEO, swarm prompts, deliverables) | Go-to-market and agent-prompt material | **Not language design.** Should live in its own file; it is currently load-bearing on nothing in `igl-v1`. |

Recommendation: split before adopting. A normative section that a runtime must satisfy
cannot share a file with candidate landing-page headlines, because a reader cannot tell
which sentences bind the implementation.

---

## 3. Concept crosswalk

| Document concept | Status in `igl-v1` | Evidence |
|---|---|---|
| Identity resolves before execution; fail closed | **Implemented** | `iosplus.js:39-50` throws `IDENTITY_NOT_FOUND`; `interpreter.js:73` |
| Authority as a scalar in [0,1] | **Implemented** | `check.js:21-23` range check; `iosplus.js:55-66` |
| Inheritance / delegation | **Implemented, and decided** | `iosplus.js:119-142`, ADR-0001 item 3, `test/authority.mjs` |
| Effective gate `τ_d = MIN(C_d, P_d)` | **Absent** — no `C_d` exists; the only comparison is scalar `actor.authority < u.authority` | `interpreter.js:247` |
| HARD violation halts, seals partial trace, no signed receipt | **Implemented on two paths, absent on the third** | `udm.js:57-65`, `decoder.js:88-95` implement it; `interpreter.js:280` does not |
| SOFT violation continues with assumptions logged and confidence attenuated | **Absent everywhere.** `SOFT_VIOLATION` is a label with no attenuation, no assumptions field, no review flag | `udm.js:63-65`, `decoder.js:65` |
| ALLOW produces a full receipt | **Implemented** | `interpreter.js:342-356`, `sign.js` |
| Receipt names agent, task, boundary, inputs, evidence, assumptions, confidence | **Partially.** Receipt carries identity, matrix digest, trace ref, outcome, program hash, sequence. No assumptions, no confidence, no evidence list | `interpreter.js:343-354` |
| Onboarding selections compile to a boundary | **Absent for agents.** The nearest thing compiles onboarding facts to *obligations*, not to agent authority | `determination.js:22-30, 33-67` |
| Industry vector | **Present under another name.** `sector_code` / `subsector` / `domain`, NAICS-shaped | `determination.js:45-62, 75-83`; `d1.js:80-85, 133-134` |
| Tenant scoping | **Present, and stronger than a receipt label** — it scopes the identity graph | `d1.js:73-76, 136` |
| Use-case / source-scope / workspace-mode / agent-role vectors | **Absent.** Zero hits in `igl-v1/src` for any of them; `footprint` appears only in root `src/graph.js` | — |
| Jurisdiction ceiling | **Implemented on the live path**, keyed `{jurisdiction, agency}` | `udm.js:18-41`, `govern.js:17-19` |
| Source-scope restriction ("unselected sources are outside the boundary") | **Absent in `igl-v1`.** A categorical allow-list exists but is parked and non-canonical | `d1.js:24-49`; ADR-0001 §2 |
| Recursive learning bounded by boundary | **Implemented, bounded structurally** | `interpreter.js:173-185` (`RECURSE`), `check.js:84` (depth > 0) |
| "Observation does not confer authority" | **Implemented — at the repo root, not in `igl-v1`** | `src/graph.js:10-22, 287-306` |
| Confidence is a review signal, not a permission ceiling (§0.1) | **Agrees with existing doctrine** | `docs/IGL_ActionPlan_Alignment.md` §2 |
| Boundary exception log | **Absent.** `UNLESS_EXCEPTION` branches on a handle but logs only to the audit array; no structured exception record reaches the receipt | `interpreter.js:199-205` |

---

## 4. The defect this document exposes

This is the highest-value output of the assessment, so it is stated with its evidence in
full.

**`igl-v1`'s language interpreter does not enforce boundaries.** It parses them,
statically validates them, and then ignores them at runtime.

- `iosplus.js:96-104` defines `ceilingsFor(tensor, {tight})`, which turns a boundary
  tensor into per-token mass ceilings. **Nothing calls it.** A grep across `igl-v1`
  returns only the definition.
- `interpreter.js:41,45` accepts and stores `boundaryMode` ("normal" or "tight", the
  comment says "demo a HARD violation"). **`this.boundaryMode` is never read again.**
- `interpreter.js:280` sets `let outcome = "COMPLIANT"` and never reassigns it inside
  `fuseDist`. Stated precisely: a FUSE can still *fail to return* — `:275` throws
  `PROJECTION_FAILURE` on zero partition, `:278` `FUSION_TYPE_ERROR` on a support-restriction
  breach, `:248` `BOUNDARY_VIOLATION` pre-fuse on authority. But **every FUSE that returns a
  governed output on the interpreter path is COMPLIANT, unconditionally.** There is no
  graded check of any kind in `fuseDist`.
- `interpreter.js:326` seals `boundaryLog: gov.boundaryLog || []`. `fuseDist` never sets
  `boundaryLog`, so **every sealed cognitive trace carries an empty boundary log.**
- `interpreter.js:193-198` (`WHEN_BOUNDARY`) discards its declared operands `s.boundary`
  and `s.constraint` entirely and branches on `state.lastGoverned.outcome !== "VIOLATION"`
  — a value `fuseDist` cannot produce. **The `OUTSIDE` branch is unreachable.**
- `check.js:36-41` validates `strictness` is `HARD` or `SOFT` and that a jurisdiction is
  present, which makes the omission harder to spot: the field looks load-bearing.
- `test/suite.mjs:135-143` asserts `r.receipt.outcome === "COMPLIANT"`. That assertion
  passes for the wrong reason. There is **no test on the interpreter path that a ceiling
  violation halts**, because there is no code path that could produce one.

What is *not* broken, and should not be over-read from the above:

- Support restriction is real and tested (`interpreter.js:278` throws if a zeroed weight
  carries mass; `test/suite.mjs:49-62`).
- Zero-partition fails closed (`interpreter.js:275`, `PROJECTION_FAILURE`; `suite.mjs:64-70`).
- The **live-bound path enforces ceilings correctly** — `udm.js:47-70` applies FUSE then
  checks `g_i ≤ ceiling_i` and returns `HARD_VIOLATION` / `SOFT_VIOLATION`.
- The **decode path enforces per token** — `decoder.js:55-76`, and halts sealing a partial
  trace at `decoder.js:91`.

So the enforcement logic exists, correct, twice. It was never wired into the interpreter,
which is the surface the specification, the WellSite program, and `CODEBASE_REVIEW.md`
all present as the language. §4 of the onboarding document is a precise specification of
the behaviour that is missing. That is the document earning its keep.

**Severity.** Any `.igl` program that declares `strictness: HARD` — including
`programs/wellsite.igl:33,40` — is running unenforced. A reviewer who reads
`CODEBASE_REVIEW.md` §3's ledger will reasonably believe otherwise.

**A second, independent defect in the same area.** `interpreter.js:353` is
`outcome: outcomeOverride || turn.outcome || "COMPLIANT"` — the outcome literal supplied by
the program's `WITH_OUTCOME` clause (`parser.js:276`) **outranks the computed outcome, and
nothing validates that the two agree.** `sign.js` then signs the program's assertion. Today
this is latent rather than exploited, because `turn.outcome` is `COMPLIANT` anyway
(`wellsite.igl:81` would produce the same receipt with the clause deleted). But it becomes
live the moment step 1 below makes the computed outcome capable of being `VIOLATION`: a
program could declare itself compliant over a governed output that failed its ceiling.
Fix the precedence in the same change — computed outcome wins, and a disagreeing
`WITH_OUTCOME` is a static error.

---

## 5. Where the document adds real value, ranked

### 5.1 Workspace boundary `C_d` compiled from onboarding — the one new idea

`igl-v1` has no notion of a workspace ceiling. Authority is declared per-identity inside
each program (`wellsite.igl:12-24`), which means a program is its own authority source.
The document's §2 and §0.3 propose that authority is compiled once, from customer-approved
selections, and every program inherits it as a ceiling it cannot widen. That is a real
structural change and it is the correct direction: it moves the ceiling out of the
artifact being governed.

The closest existing machinery is `determination.js` — `decode(activities, crosswalk)`
(`:22-30`) and `resolvePosition` (`:33-67`) already compile onboarding-shaped facts into
a lattice position with a four-outcome contract that fails closed. **The compiler pattern
is proven; only the output type is wrong.** It emits obligations; a workspace compiler
must emit a typed authority ceiling. Reusing `resolvePosition`'s outcome contract
(`MATCHED` / `NO_MATCH` / `MULTI_MATCH` / `INSUFFICIENT_DATA`) for boundary compilation
would be consistent and cheap — and notably, `INSUFFICIENT_DATA` is exactly the right
answer to an incomplete onboarding, which the document does not consider.

Caveat the document does not address: it says onboarding "freezes the approved starting
boundary" (§0.3, Step 5) and that later expansion is requested at runtime. It does not
say what signs the expansion. `src/graph.js:83-92` partly answers this — a grant must name
its grantor and is refused otherwise (`IGL_UNSIGNED_GRANT`). Note precisely what that
guard is: a truthiness check on the `by` field, not a signature verification;
`grant(a, d, {by: "x"})` passes. Adopt the rule *and* close that gap, or the compiled
boundary is mutable by whoever holds the config.

### 5.2 Typed multi-dimensional gate replacing the scalar

`igl-v1` compares one number: `actor.authority < u.authority` (`interpreter.js:247`).
The document's dimensions — identity, industry, use case, source scope, workspace mode,
jurisdiction, role — cannot be collapsed into a scalar without losing exactly the
information that makes a denial explainable. "Authority 0.4 < 0.85" is not a reason a
regulator can read; "granted Jurisdiction: US-TX does not cover NM-OCD" is.

This is already built at the repo root. `src/graph.js:266-306` implements `covers()` with
`set` / `lattice` / `custom` containment and `authorize()` returning per-dimension
violations with human-readable reasons — including, at `:300`, the explicit note
"observed N× but observation does not confer authority", which is the exact inference the
system must refuse to make. **The recommendation is to port `graph.js`'s
dimension model into `igl-v1`, not to design a new one from the document.** The document
should be read as independent validation that the v0.2 graph model was right, and as the
argument for why `igl-v1` should stop being scalar-only.

One conflict to resolve explicitly (see §6.2).

### 5.3 SOFT as an executable outcome, not a label

Today `SOFT_VIOLATION` is a string. Nothing attenuates, nothing logs an assumption,
nothing raises a review flag. The document's §4 gives SOFT three obligations —
assumptions logged, confidence reduced, review flags attached — and §11 makes them
receipt fields. That is implementable and it is currently missing everywhere in the tree.

Worth noting the document is internally consistent here in a way the code is not: §0.1
says confidence is "a review signal, not a permission ceiling", which correctly refuses
to let a model's own confidence widen its authority. That matches
`IGL_ActionPlan_Alignment.md` §2 and `graph.js`'s AI-class rule. Keep that sentence
verbatim; it is the strongest line in the document.

### 5.4 Receipts for deliverables, not just distributions

`igl-v1` receipts bind a distribution, a digest, and an identity. §11 of the document
demands a receipt for a *deliverable* — a persona brief, a keyword cluster, a roadmap —
carrying evidence used, assumptions, confidence, boundary check, and gate result. That is
a different receipt shape and it is not covered by `sign.js`. It is genuinely useful for
agent work products, and it is a strictly additive change (a second `kind`, alongside
`governed_turn`, `governed_decode`, `determination`).

Caution: a deliverable receipt is weaker evidence than a FUSE receipt, because a
prose deliverable is not recomputable the way `normalize(v ⊗ w)` is. It must be labelled
as attestation, not proof, or it dilutes what "receipt" means in this project. The
existing `provenance.digestSource` convention (ADR-0001 item 5) is the precedent for
making an artifact self-describing about its own strength.

### 5.5 Boundary exception log

§11's closing item — every exceeded boundary logged with the triggering request, the
affected dimension, HARD/SOFT class, action taken, and required human review — has no
counterpart. `UNLESS_EXCEPTION` (`interpreter.js:199-205`) writes to an in-memory audit
array that never reaches the receipt. Cheap to add, and it is the artifact an auditor
will actually ask for.

---

## 6. Where the document should be rejected or rewritten

### 6.1 The "vectors are GPS coordinates for meaning" framing (§§7–9, §11)

This is the part to cut, and it is worth being specific about why, because it reads as
the most intuitive section and is the most dangerous.

The document says a requested task "is converted into a vector and compared against the
approved boundaries", with three zones — inside, *near*, outside. "Near" implies a
distance metric over a semantic embedding space. **`igl-v1` has no embedding space and
computes no distance.** What it computes is an elementwise product against a weight
vector plus a per-path ceiling comparison (`udm.js:47-70`) — a mask and a threshold, not
a proximity. There is no "near the boundary"; there is `g_i ≤ ceiling_i` or not.

Adopting this language would put the project in the position its own
`point-of-inflection.md` discipline exists to prevent: a published claim the runtime
cannot demonstrate. It also invites a specific and fatal objection — that governance is
being decided by semantic similarity, which is a probabilistic channel making a governing
decision, which is precisely the thing `determination.js` and the "AI locates, UDM
computes" doctrine forbid.

Rewrite §§7–9 in the model the code actually implements: **typed dimension containment
plus a graded ceiling.** The "GPS" analogy can survive if it is repointed — a boundary is
a *jurisdiction on a map*, and the question is whether a point falls inside the polygon,
not how far it is from the centre. That analogy is accurate to `graph.js`'s lattice
containment and costs nothing in accessibility.

### 6.2 "Permission composes by intersection, not amplification" conflicts with ADR-0001

§0 states permission composes by intersection. ADR-0001 item 3 decided the opposite for
one mechanism: `INHERITS_FROM` **raises** an identity's authority to the max along its
chain (`iosplus.js:55-66`). Both cannot be unqualified.

They are reconcilable, and the reconciliation is worth writing down because it is not
obvious: *inheritance is how a footprint is assembled; composition is how a footprint
meets a ceiling.* An identity's own `P_d` may be raised by structural inheritance, and
the effective gate is still `MIN(C_d, P_d)`. Delegation already min-clamps
(`iosplus.js:138-142`) for exactly this reason. State this as a fourth item in ADR-0001
rather than letting two normative documents contradict each other in the same repo.

### 6.3 Concepts the document presents as new that already exist

Do not re-implement these; cite them instead:

- Fail-closed identity resolution — `iosplus.js:39-50`.
- Receipt obligation and hash-chained verification — `sign.js`, `determination.js:156-187`,
  `govern.js:47-58`.
- Bounded recursive learning — `RECURSE` (`interpreter.js:173-185`), depth check
  (`check.js:84`), and the damped-recursion / two-layer fold at the root
  (`src/graph.js:10-27`).
- Evidence control and citations attached to the governing rule — `determination.js:70-90`,
  `d1.js:52-70`.
- Jurisdiction ceilings — `udm.js:18-41`.

### 6.4 The VDRPros material

Sound as marketing, and §11's insistence that every deliverable carry a boundary check and
receipt is a good instinct. But it does not belong in a document that a runtime is
expected to satisfy, and several of its agent prompts (SEO, lifecycle email, persona
strategy) describe work no governed runtime is going to gate numerically. Move it to
`docs/usecases/vdrpros.md` and keep the receipt-obligation paragraph (§11 preamble) in
the normative file.

---

## 7. Recommended sequence

Ordered by value per unit of risk. Steps 1 and 2 are defect repair and should not wait on
the design work in 3–5.

**1. Wire boundary enforcement into the interpreter.** Call `ceilingsFor` in `fuseDist`,
set `outcome` from the ceiling check, populate `boundaryLog`, and honour `strictness` from
the identity's declared boundary. Reuse the comparison in `udm.js:57-65` rather than
writing a second one. Make `WHEN_BOUNDARY` read its declared operands.
*Files:* `src/interpreter.js` (`fuseDist`, `WhenBoundary`), `src/iosplus.js`.

**2. Add the adversarial test that is missing.** A program declaring `strictness: HARD`
whose governed distribution exceeds a ceiling must halt, seal the partial trace, and issue
**no signed receipt**. Assert the absence of a signature, not just an outcome string. This
is the test whose absence let finding §4 survive.
*Files:* `test/suite.mjs` or a new `test/boundary.mjs`.

**3. Port the typed dimension model.** Bring `covers()` / `authorize()` from
`src/graph.js:266-306` into `igl-v1` as `src/footprint.js`, keeping the lattice
containment and the per-dimension violation reasons. Do not redesign; the root
implementation is better than what the document specifies.

**4. Build the workspace compiler.** `src/workspace.js`: onboarding selections → typed
`C_d`, reusing `determination.js`'s four-outcome contract so an incomplete onboarding
returns `INSUFFICIENT_DATA` rather than a permissive default. `effectiveGate(C, P)` →
per-dimension `τ`. Require a named grantor for any expansion, per `graph.js:83-92`.

**5. Extend the receipt.** Add `assumptions[]`, `gateResult` (ALLOW / SOFT / HARD),
`boundaryCheck`, and `exceptions[]`. Add a `deliverable` receipt kind, explicitly labelled
attestation rather than recomputable proof.

**6. Decide grammar or library.** Steps 3–5 need no grammar change and should ship as a
library first. Only if a `WORKSPACE { ... }` block earns its place — that is, if programs
genuinely need to reference the compiled boundary by name — should the lexer, parser, and
checker be touched. Adding a block to the grammar is a specification amendment and pulls
in Schedule A/C conformance; the library route does not.

**7. Split and amend the documents.** Normative governance → `docs/AGENT_GOVERNANCE.md`.
Use case → `docs/usecases/vdrpros.md`. Rewrite §§7–9 per §6.1 above. Add ADR-0001 item 6
resolving §6.2.

---

## 8. Verification note

Every finding in §4 was put through an independent adversarial re-check against the
source, instructed to refute rather than agree. The §4 findings are confirmed: the dead
`ceilingsFor` (sole occurrence in the tree is its definition), the write-only
`boundaryMode`, the always-empty `boundaryLog` (sole occurrence is the read at `:326`),
the unreachable `OUTSIDE` branch, and the absence of any interpreter-path ceiling test.
`VIOLATION` is a valid lexer and parser symbol (`lexer.js:27`, `parser.js:229`) that no
code path ever assigns — the scaffold is complete and entirely disconnected.

Two claims were corrected by that check, and the corrections are folded in above rather
than left standing: industry classification and onboarding-fact decoding **do** exist in
`igl-v1` under different names (`sector_code`, `subsector`, `domain`; `determination.js:21`
is literally commented "onboarding facts to codes"), and tenancy scopes the identity graph
rather than merely labelling a receipt (`d1.js:73-76`). An earlier draft called those
absent. They are not.

Not verified, and flagged as such:

- **The suite was not executed.** No `npm test`, no network to `udm.igl.dev`. The claim
  that the live-bound path enforces ceilings correctly comes from reading `udm.js:47-70`
  and `govern.js`, not from a run.
- **The working copy assessed is partial.** Six of the ten test files named in
  `package.json` (`samples`, `adapters`, `d1`, `govern`, `worker`, `decoder`) and
  `test/fixtures/live-matrices.js` were not pulled into this session. Statements about
  `igl-v1/test/` hold over `suite.mjs`, `authority.mjs`, `udm.mjs`, and `determination.mjs`
  only. Finding §4 does not depend on them: no ceiling test *could* exist on the
  interpreter path, because the interpreter has no ceiling code to test.
- **"108 checks, green in CI"** is quoted from `docs/CLOSEOUT.md`, not reproduced here.

Before acting on step 1, run `npm test` on the full tree so that any regression the fix
introduces is attributable to the fix.
