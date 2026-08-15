# IGL v0.1 — critique and hardening

A review of the draft specification, in the order the problems bite. Each item states
the defect, why it matters, and the resolution adopted in **IGL v0.2** (`docs/SPEC.md`)
and the reference implementation (`src/`).

---

## A. Defects that block a conforming parser

### A1. `ArgList` forbids the arguments used in the specification's own example — BLOCKING

The grammar says every argument is a binding:

```ebnf
Arg ::= Identifier "=" Value
```

but §2.4's example passes bare positional arguments:

```
AI.Infer(Missing_Fields, Validate_Against_Historical_Traces)
```

Two readings, and the choice is semantic, not cosmetic. If they are positional
arguments, `AI.Infer` has an arity and an argument order that must be specified
somewhere — and nothing in the document specifies subsystem function signatures.
If they are flags, they need a syntax of their own.

**Resolution.** Positional arguments are admitted, and every built-in carries a
declared signature (`src/builtins.js`). Positional arguments bind to declared
parameter names in order; named arguments may follow positional ones but not
precede them. A call whose arity or names do not match its signature is a
**static** error, not a runtime one. Subsystem functions are now a typed surface
rather than an open namespace — which is the point of a governed language.

### A2. `Identifier` is never defined, and the examples require at least three lexical classes

The examples use `TX-RRC`, `2026-Q3`, `PR-202`, `TRC-004982`, and `Jurisdiction`
as though all were identifiers. Under any conventional identifier rule, four of
those five fail: a leading digit, embedded hyphens, or both. A parser written from
this document cannot read the document's own examples.

**Resolution.** Three explicit classes:

- `Identifier` — `[A-Za-z_][A-Za-z0-9_]*`. Names of actors, intents, parameters, outputs.
- `Code` — `[A-Za-z0-9_][A-Za-z0-9_.-]*` containing at least one `-` or `.`, or beginning with a digit. Covers `TX-RRC`, `2026-Q3`, `PR-202`, `TRC-004982`.
- `Number` — JSON numeric syntax.

`Code` is a distinct value type, not a string. Codes are the values UDM governs,
so the type system must be able to see them. `TX-RRC` is a code; `"TX-RRC"` is a
string; they are not interchangeable, and passing a string where a code is required
is a static type error.

### A3. Statement boundaries are ambiguous under recovery

`Program ::= Statement*` with no terminator parses cleanly only while the input is
well-formed. After an error the parser cannot resynchronise: there is no token that
reliably means "next statement." For a language whose failures are governance
failures, unhelpful error recovery is a real cost.

**Resolution.** Statements are terminated by `;`. The terminator is optional before
end-of-input and before a `ID` token at the start of a line, so existing programs
remain valid, but the parser has a synchronisation point.

### A4. `Boundary` is a reserved word with no grammar production

It is listed as reserved and described as "used as label in specs," but appears
nowhere in the EBNF. Reserving a word the language never reads is how a
specification accumulates dead surface.

**Resolution.** Removed from the reserved list. `BoundaryItem` keys are ordinary
identifiers resolved against the UDM boundary registry.

### A5. No comment syntax

Governed programs are read by auditors and regulators. A language intended to
carry compliance logic that cannot carry an explanatory note beside a clause is
unfinished.

**Resolution.** `#` to end of line.

### A6. String literals have no escape rules

`StringLiteral` is referenced but never defined. Filing systems contain quotes,
backslashes, and non-ASCII characters.

**Resolution.** JSON string syntax exactly, including `\u` escapes. Reuse rather
than reinvent — it also means a trace can be serialised to JSON losslessly.

---

## B. Semantic gaps

### B1. There is no error, remediation, or conditional construct — and §5.1 promises one

Step 2 of the execution flow says: "If not authorized → error or remediation."
Remediation is a *behaviour*, and the language provides no way to express what it
should be. Every remediation policy is therefore hardcoded in the interpreter,
outside the governed, traced program — which is precisely the kind of ungoverned
logic IGL exists to eliminate.

**Resolution.** An optional `OnFail` block:

```
ID[...] :: Intent[...] => Compute[...] -> Output[...]
  OnFail[Remediate(Notify=compliance_lead, Escalate=Human_Review), Halt];
```

`OnFail` is part of the statement, parsed, checked, and traced like any other block.
Its handlers are drawn from a closed set (`Remediate`, `Halt`, `Fallback`, `Retry`)
because open-ended failure handling in a governed language is how boundaries get
bypassed under production pressure.

### B2. Statements cannot reference each other's outputs

`Program ::= Statement*` gives a flat list. But §7.3 describes loading prior traces,
reasoning over them, and extending them — an inherently multi-step dependency. With
no way to name an output and consume it downstream, every real pipeline collapses
into one enormous `Compute` block, and the trace granularity that justifies the
language is lost.

**Resolution.** Outputs bind names in a statement-scoped environment; later
statements reference them with `@name`. The checker builds a dependency graph and
rejects forward and circular references statically.

### B3. Nothing pins AI model identity or version

§5.2 requires that "AI reasoning does not violate UDM rules," and §7 builds a
recursive loop over stored reasoning. But an `AI.Infer` call names no model, no
version, and no sampling parameters. Re-running a program a month later silently
runs a different model. The trace records *that* inference happened, not *what
would happen again* — so the trace is not replayable, and a trace that cannot be
replayed cannot be audited.

**Resolution.** `AI.*` calls require `Model=` and record the resolved model
version, parameters, and seed in the trace. Replay against a superseded model is
permitted but marks the resulting trace `replay_divergent` when outputs differ.

### B4. `Output` items are untyped and unvalidated

`OutputItem ::= Identifier ("=" Value)?` — an output may be any name at all. Nothing
requires that a statement claiming to produce `Compliance_Packet` produced anything
resembling one. In a system where outputs are filings, this is the gap through which
an empty packet reaches an agency.

**Resolution.** Outputs declare a type from the intent's signature, and the
interpreter validates the produced artifact against it before the statement is
allowed to commit. Failure is a governed error, not a warning.

### B5. "Nothing files without a human" is a slogan, not a construct

The surrounding system's stated rule has no representation in the language. There
is no attestation, no signer, no sign-off state.

**Resolution.** Intents may be declared `RequiresAttestation`. Such a statement
executes to a **staged** state and produces no material output until an
`IOS.Attest(Signer=..., Role=...)` call commits it. The staged/committed
distinction lives in the trace.

### B6. No idempotency

Executing the same statement twice performs the action twice. For filings, notices,
and productions, that is a duplicate submission to a regulator.

**Resolution.** Each statement computes a deterministic `statement_key` from
identity, boundary, intent, and normalised arguments. Re-execution with the same
key returns the prior trace and output unless `Force=true` is passed explicitly.

---

## C. The recursive loop — the substantive risk

### C1. Model collapse: the loop has no provenance weighting

§7.3 is the heart of the design and its most dangerous part. Step 1 loads prior
traces; step 2 reasons over them with AI; step 4 writes a new trace that "tightens
future reasoning." Step 3 (UDM enforcement) is the only brake.

UDM enforces *structure*. It can reject a filing that uses an invalid agency code
or violates a numerical constraint. It cannot detect an inference that is
structurally impeccable and factually wrong. So consider a wrong AI inference in
trace *n* that is structurally valid: it is stored, and at *n+1* it is loaded as
prior context. The model now sees its own prior conclusion presented as
established precedent, agrees with it — models are strongly disposed to agree with
context — and writes trace *n+1* with the same error, now with two supporting
traces. This is a positive feedback loop with no damping term. §7.4's claim that
"the loop tightens over time" is only true if the loop is convergent; as
specified, it is equally capable of converging on an error.

This is the failure mode that the phrase "recursive intelligence" tends to obscure:
recursion amplifies whatever is in the base case, including mistakes.

**Resolution — three mechanisms, all implemented:**

1. **Attestation classes.** Every trace assertion is tagged `deterministic`
   (UDM-computed, or a direct document quotation), `human` (attested by a named
   signer), or `ai` (model inference). These are never merged.

2. **Confidence decay on AI-asserted traces.** An `ai`-class assertion enters at
   its stated confidence and is multiplied by a decay factor each time it is
   reused as *context* rather than re-derived from source. Below a floor
   (default 0.4) it is no longer admissible as context — it may be re-derived,
   but it cannot be inherited. An error therefore fades from the corpus instead
   of compounding, unless a human or a deterministic computation attests it.

3. **Derivation-depth cap.** Every assertion records how many AI-to-AI hops
   separate it from a deterministic or human source. Beyond a configured depth
   (default 3) the assertion cannot be used as context at all. This bounds the
   damage of any single wrong inference to a finite subtree.

Together these make the loop contractive rather than explosive: intelligence
accumulates only where it is anchored, and unanchored inference decays.

### C2. Trace loading is unbounded and its selection is unspecified

"Load relevant past TurnTraces based on Identity + Boundary + Intent" — after a
year of operation that may be a hundred thousand traces. Which ones, in what order,
under what budget? Unspecified selection is not a neutral omission: whatever the
implementation happens to choose becomes the system's de facto memory policy, and
selection bias in the loaded set biases every downstream inference.

**Resolution.** Trace selection is an explicit, declared, traced parameter:
`Context(Traces=Recent(20) | Attested | Boundary_Exact, MaxDepth=3)`. The set of
loaded traces and the selection predicate are recorded in the new trace, so a
reviewer can see what the system was looking at when it reasoned.

### C3. Fail-closed on trace capture is correct — and under-specified

"If IOS cannot trace → fail the computation" is the best rule in the specification.
But it does not say what happens to work already performed when trace capture fails
at step 5, after outputs exist. Without a rollback, a failed trace leaves a
materialised output with no record — the exact condition the rule exists to prevent.

**Resolution.** Two-phase commit. Outputs are materialised to a staging area;
the trace is written first; only a durable trace releases the output. A trace
write failure discards staged outputs and returns a governed error.

---

## D. Smaller points

- **D1.** `Value` includes `Identifier`, making bare identifiers ambiguous between
  variable references and symbolic constants. v0.2 requires `@name` for references;
  a bare identifier is always a symbol.
- **D2.** No versioning. A program has no way to declare which IGL version it
  targets. v0.2 adds an optional `%igl 0.2` pragma; absent, the interpreter assumes
  the version it implements and records the assumption in the trace.
- **D3.** `IOS.Trace(Reasoning, Tools, Code, Search, Context)` uses positional
  arguments that read as an enumeration of trace channels. v0.2 makes this
  `IOS.Trace(Channels=[Reasoning, Tools, Code, Search, Context])` — a list, which
  is what it is.
- **D4.** Duplicate boundary keys are unaddressed (`Jurisdiction:TX, Jurisdiction:LA`).
  Multi-jurisdiction matters are common. v0.2 permits repeated keys and treats them
  as a set; UDM decides whether a given boundary key is set-valued.
- **D5.** §5.2's validity rules are stated as a conjunction with no evaluation order.
  Order matters for error quality and for cost — authorisation should fail before an
  expensive model call, not after. v0.2 fixes the order: identity → boundary →
  intent authorisation → static argument checks → execution.

---

## E. What is right, and should not be traded away

Three decisions in the draft are unusually good and are preserved unchanged in v0.2:

1. **Identity and boundary are syntactically mandatory.** They are not decorators
   or metadata; a statement without them does not parse. Governance that is
   optional is governance that is absent.

2. **Fail-closed on trace.** The system would rather do nothing than do something
   unobserved. Most systems get this backwards and treat logging as best-effort.

3. **Deterministic and probabilistic computation are separate namespaces.**
   `UDM.*` and `AI.*` cannot be confused at a call site, so a reader can always
   see which parts of a program are governed fact and which are inference. This
   distinction is what makes the attestation classes in C1 implementable at all —
   the language already knows the difference.
