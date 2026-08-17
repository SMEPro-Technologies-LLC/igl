# IGL — Identity-Governed Language

**Version 0.2** · supersedes 0.1 · reference implementation in `../src`

---

## 1. Purpose and one-sentence definition

IGL is a domain-specific language in which every computation is bound to an
identity, governed by a declared boundary, assisted by pinned models, and
preserved as a replayable trace — so that intelligence accumulates where it is
anchored and decays where it is not.

The change from v0.1 is the second clause of that sentence. v0.1 said
"intelligence becomes recursive instead of disposable." Recursion alone is not a
virtue: a loop that feeds its own inferences back as evidence amplifies its
errors as readily as its insights. v0.2 keeps the loop and adds the damping that
makes it convergent. See `CRITIQUE.md` §C1.

### 1.1 Design invariants

These hold everywhere in the language. Anything that violates one is a defect.

| # | Invariant | Enforced by |
|---|---|---|
| I1 | A statement without an actor and a boundary does not parse | grammar §4.2 |
| I2 | Untraced computation is inadmissible | static check §7, two-phase commit §8.3 |
| I3 | Deterministic and probabilistic computation are never confused | separate namespaces §5.2 |
| I4 | No inference is asserted without a pinned model | static check §7 |
| I5 | Nothing material is produced without a durable trace | two-phase commit §8.3 |
| I6 | Nothing files without a human | attestation gate §8.4 |
| I7 | Unanchored inference loses force with each reuse | decay + depth cap §9 |

---

## 2. Notation

Grammar is EBNF. `"x"` is a literal, `A*` is zero or more, `A?` is optional,
`A | B` is alternation. Lexical classes are defined in §3 and referenced in
upper camel case.

---

## 3. Lexical structure

### 3.1 Whitespace, comments, pragma

Whitespace is insignificant except as a token separator. A comment begins with
`#` and runs to end of line. A program may open with a version pragma:

```
%igl 0.2
```

Absent a pragma, the interpreter assumes the version it implements and records
that assumption in the trace.

### 3.2 Token classes

| Class | Definition | Examples |
|---|---|---|
| `Identifier` | `[A-Za-z_][A-Za-z0-9_]*` | `Allco`, `Generate_Compliance_Packet`, `Mode` |
| `Code` | `[A-Za-z0-9_][A-Za-z0-9_-]*` containing a `-` or beginning with a digit | `TX-RRC`, `PR-202`, `2026-Q3`, `TRC-004982` |
| `Number` | JSON numeric syntax | `42`, `-1.5e3`, `0.75` |
| `String` | JSON string syntax including `\u` escapes | `"Beaumont refinery"` |

**Codes never contain a dot.** `.` is always the subsystem scoping operator, so
`UDM.Resolve` cannot be mistaken for a single token. A value requiring a dot is a
`String`.

`Code` is a distinct type from `String`. Codes are what UDM governs, so the type
system must be able to see them: `TX-RRC` is a code, `"TX-RRC"` is a string, and
passing one where the other is required is a static type error.

### 3.3 Reserved words

`ID`, `Intent`, `Compute`, `Context`, `Output`, `OnFail`.

Subsystem names `UDM`, `AI`, `IOS` are reserved in call position only.

(`Boundary` was reserved in v0.1 with no production. Removed — see CRITIQUE §A4.)

### 3.4 Operators

| Token | Meaning |
|---|---|
| `::` | binds Identity to Intent |
| `=>` or `⇒` | maps Intent to Computation |
| `->` or `→` | maps Computation to Output |
| `\|` | separates Actor from Boundary |
| `.` | subsystem scoping |
| `@` | reference to an output bound by an earlier statement |
| `=` | parameter binding |
| `;` | statement terminator (optional before end of input) |

---

## 4. Grammar

### 4.1 Program

```ebnf
Program     ::= Pragma? Statement*
Pragma      ::= "%igl" Number

Statement   ::= IdentityBlock "::" IntentBlock "=>"
                (ContextBlock ",")? ComputeBlock "->"
                OutputBlock OnFailBlock? ";"?
```

### 4.2 Identity

```ebnf
IdentityBlock ::= "ID" "[" ActorSpec "|" BoundarySpec "]"
ActorSpec     ::= Identifier (":" Identifier)*
BoundarySpec  ::= BoundaryItem ("," BoundaryItem)*
BoundaryItem  ::= Identifier ":" (Identifier | Code | Number | String)
```

The last element of `ActorSpec` is the **role**. `BoundarySpec` is mandatory:
an identity block with no boundary is a syntax error, not a warning.

A boundary key may repeat where UDM declares it set-valued (multi-jurisdiction
matters are ordinary), and is an error otherwise.

```
ID[Allco:Operator | Jurisdiction:TX-RRC, Commodity:Oil, Period:2026-Q3]
ID[Hobson:Counsel | Matter:2026-CV-04417]
```

### 4.3 Intent

```ebnf
IntentBlock ::= "Intent" "[" IntentName ("," IntentParam)* "]"
IntentName  ::= Identifier | Code
IntentParam ::= Identifier "=" Value
```

Intents are registered, not open. The registry declares, per intent: permitted
roles, required boundary keys, permitted parameters and their value domains,
declared outputs and their types, and whether human attestation is required.

### 4.4 Context — trace selection

```ebnf
ContextBlock ::= "Context" "[" ContextItem ("," ContextItem)* "]"
ContextItem  ::= Identifier "=" Value | Value
```

Selection is explicit and recorded. `Traces=Recent(n)`, `Traces=Attested`,
`Boundary_Exact`, `MaxDepth=n`. Absent a `Context` block the defaults apply
(`Recent(20)`, `MaxDepth=3`) and are still recorded, so the loaded set is never
implicit. See CRITIQUE §C2.

### 4.5 Compute

```ebnf
ComputeBlock ::= "Compute" "[" ComputeStep ("," ComputeStep)* "]"
ComputeStep  ::= Subsystem "." Identifier ArgList?
Subsystem    ::= "UDM" | "AI" | "IOS"

ArgList      ::= "(" (Arg ("," Arg)*)? ")"
Arg          ::= Identifier "=" Value | Value
Value        ::= String | Number | Code | Identifier
               | List | Ref | Apply
List         ::= "[" (Value ("," Value)*)? "]"
Ref          ::= "@" Identifier
Apply        ::= Identifier ArgList
```

Positional arguments bind to declared parameter names in order. A positional
argument may not follow a named one. A bare `Identifier` in value position is a
symbol; a variable reference is always `@name`.

An empty compute block is an error.

### 4.6 Output

```ebnf
OutputBlock ::= "Output" "[" OutputItem ("," OutputItem)* "]"
OutputItem  ::= (Identifier | Code) ("=" Value)?
```

Output names must appear in the intent's declared outputs. Outputs bind into a
program-scoped environment and are referable downstream as `@name`.
`TurnTrace_ID` is always bound.

### 4.7 OnFail

```ebnf
OnFailBlock ::= "OnFail" "[" Handler ("," Handler)* "]"
Handler     ::= ("Remediate" | "Halt" | "Fallback" | "Retry") ArgList?
```

The handler set is closed. Open-ended failure handling in a governed language is
how boundaries get bypassed under production pressure.

Absent an `OnFail` block, a failing statement is **recorded as failed and the
program halts**. The failure is never silently swallowed and never merely thrown
away: a governed pipeline does not run later statements on the strength of a step
that did not happen.

---

## 5. Subsystems

### 5.1 The three namespaces

| Namespace | Character | Role |
|---|---|---|
| `UDM.*` | deterministic | governed structure, codes, constraints — the brake |
| `AI.*` | probabilistic | inference and completion — pinned, seeded, bounded |
| `IOS.*` | orchestration | trace capture, attestation, staging |

A reader can always see, at a call site, which parts of a program are governed
fact and which are inference. This distinction is what makes attestation classes
(§9.1) implementable at all.

### 5.2 Declared signatures

Every built-in has a signature; a call whose arity, names or types do not match
is a **static** error. See `src/builtins.js` for the registry.

```
UDM.Resolve(AgencyCode: code, RequiredForms?: list, Period?: code)
UDM.Validate(Target: any, Ruleset?: symbol)
UDM.Enforce(Constraint: symbol, Target?: any)
UDM.CrossCheck(Left: any, Right: any, Tolerance?: number)
UDM.Align(Source: any, Ontology: symbol)

AI.Infer(Task: symbol, Model: code, Inputs?: list,
         Temperature?: number, Seed?: number, MinConfidence?: number)
AI.Validate(Target: any, Model: code, Against?: list)

IOS.Trace(Channels: list, Label?: string)
IOS.Attest(Signer: any, Role: symbol, Note?: string)
IOS.Stage(Artifact: any)
```

Trace channels: `Reasoning`, `Tools`, `Code`, `Search`, `Context`.

---

## 6. Abstract syntax

```
Program   { version, statements[] }
Statement { identity, intent, context?, compute, output, onFail? }
Identity  { actor[], boundary[{key, value}] }
Intent    { name, params[{name, value}] }
Context   { items[] }
Compute   { steps[{subsystem, fn, args[]}] }
Output    { items[{name, value?}] }
OnFail    { handlers[{name, args[]}] }
```

Every node carries `line` and `col`, so a governed error points at the clause
that caused it.

---

## 7. Static semantics

The checker rejects, before anything executes:

1. unknown actor role for the intent (`IGL_UNAUTHORISED`)
2. missing required boundary key (`IGL_BOUNDARY_INCOMPLETE`)
3. unknown intent or parameter, or out-of-domain parameter value
4. unknown subsystem function; wrong arity; wrong argument type
5. `AI.*` call with no `Model` (`IGL_UNPINNED_MODEL`)
6. statement with no `IOS.Trace` step (`IGL_UNTRACED`)
7. output not declared by the intent (`IGL_UNDECLARED_OUTPUT`)
8. attestation-required intent with no `IOS.Attest` (`IGL_NO_ATTESTATION`)
9. unbound, forward or circular `@` reference

Errors accumulate; a caller receives all of them. **If any static error is
present, no statement executes.**

---

## 8. Dynamic semantics

### 8.1 Fixed evaluation order

Order is normative, not an implementation detail: authorisation must fail before
an expensive model call, not after.

1. resolve identity against the identity graph
2. validate boundary against UDM
3. authorise intent for role in boundary
4. idempotency check
5. load context traces under the declared predicate
6. execute compute steps in written order
7. stage outputs
8. **write trace**
9. release staged outputs

### 8.2 Idempotency

Each statement computes a `statement_key` over identity, boundary, intent,
normalised parameters and the compute shape. Re-execution with the same key
returns the prior trace and output with status `idempotent`, unless forced. For
filings and productions, the alternative is a duplicate submission to a regulator.

### 8.3 Two-phase commit — the fail-closed rule

Outputs are materialised to a staging area. The trace is written **first**. Only
a durable trace releases the output. A trace write failure discards the staged
outputs and raises `IGL_TRACE_FAILED`.

v0.1 said "if IOS cannot trace → fail the computation" but did not say what
happens to work already performed. Without step ordering, a failed trace leaves a
materialised output with no record — precisely the condition the rule exists to
prevent.

### 8.4 Attestation gate

An intent declared `requiresAttestation` executes to state `staged` and releases
no material output until an `IOS.Attest(Signer=…, Role=…)` step commits it. The
staged/committed distinction is part of the trace.

### 8.5 Governed errors

| Code | Phase | Meaning |
|---|---|---|
| `IGL_UNKNOWN_ACTOR` | identity | actor not in the identity graph |
| `IGL_BOUNDARY_REJECTED` | udm | boundary key or value not governed |
| `IGL_UNAUTHORISED` | authz | role may not perform this intent here |
| `IGL_CONSTRAINT_VIOLATED` | udm | a `UDM.Enforce` constraint failed |
| `IGL_DEPTH_EXCEEDED` | exec | inference stacked beyond the derivation cap |
| `IGL_TRACE_FAILED` | trace | trace not durable; staged outputs discarded |
| `IGL_HALTED` | onfail | explicit `Halt` handler |

---

## 9. The recursive loop

### 9.1 Attestation classes

Every assertion carries exactly one class. They are never merged.

| Class | Source | Decays? |
|---|---|---|
| `deterministic` | UDM computation, or direct document quotation | no |
| `human` | attested by a named signer | no |
| `ai` | model inference | yes |

A trace's class is the weakest class among its assertions.

### 9.2 Confidence decay

An `ai` assertion enters at its stated confidence and is multiplied by `decay`
(default 0.75) each time it is **inherited as context** rather than re-derived
from source. Below `floor` (default 0.4) it is no longer admissible as context.
It may still be re-derived; it may not be inherited.

```
effective_confidence = confidence × decay ^ reuse_count      (ai only)
effective_confidence = 1                                     (human, deterministic)
```

### 9.3 Derivation depth cap

Every assertion records how many AI-to-AI hops separate it from a deterministic
or human anchor. Beyond `maxDepth` (default 3) it cannot be used as context at
all, and an attempt to stack further raises `IGL_DEPTH_EXCEEDED`. This bounds the
blast radius of any single wrong inference to a finite subtree.

### 9.4 Why this makes the loop convergent

UDM enforces *structure*. It can reject an invalid agency code or a violated
numerical constraint. It cannot detect an inference that is structurally
impeccable and factually wrong. Without §9.2 and §9.3, such an inference is
stored, loaded at the next turn as established precedent, agreed with — models
are strongly disposed to agree with their context — and re-asserted, now with two
supporting traces. That is a positive feedback loop with no damping term.

With decay and the depth cap, an unanchored error fades from the corpus instead
of compounding, while anything a human or a deterministic computation attests
persists at full weight. Intelligence accumulates where it is anchored. That, and
not recursion by itself, is what makes the loop tighten.

---

## 10. Conformance

An implementation is **conforming** if it:

- **C1** accepts every program in `test/igl.test.js` that the reference accepts, and rejects every one it rejects, with the same error code;
- **C2** implements the fixed evaluation order of §8.1;
- **C3** implements two-phase commit such that no output is observable without a durable trace (§8.3);
- **C4** refuses to execute any statement in a program containing a static error (§7);
- **C5** refuses `AI.*` calls without a registered, version-pinned model (§5.2);
- **C6** implements attestation classes, confidence decay and the depth cap (§9), and records the parameters in force in every trace;
- **C7** records, in every trace: identity, boundary, intent, parameters, context trace ids, the selection predicate, all assertions with their classes, model versions and seeds, state, and outputs.

A implementation that omits **C3** or **C6** may not be described as IGL. They
are the two properties that distinguish the language from an orchestration DSL.

---

## 11. Worked example

```
%igl 0.2

# Deterministic resolution, one pinned inference, full trace.
ID[Allco:Operator | Jurisdiction:TX-RRC, Commodity:Oil, Period:2026-Q3]
  :: Intent[Generate_Compliance_Packet, Mode=Full]
  => Context[Traces=Recent(20), MaxDepth=3],
     Compute[
       UDM.Resolve(AgencyCode=TX-RRC, RequiredForms=[PR-202, H-10]),
       AI.Infer(Task=Missing_Fields, Model=claude-sonnet-5, Temperature=0, Seed=7, MinConfidence=0.7),
       IOS.Trace(Channels=[Reasoning, Tools, Code, Search, Context])
     ]
  -> Output[Compliance_Packet, TurnTrace_ID]
  OnFail[Remediate(Notify=compliance_lead), Halt];

# The filing itself carries a signer. Without IOS.Attest this does not compile.
ID[Allco:Operator | Jurisdiction:TX-RRC, Commodity:Oil, Period:2026-Q3]
  :: Intent[File_Production_Report, Mode=Full]
  => Compute[
       UDM.Validate(Target=@Compliance_Packet, Ruleset=default),
       IOS.Attest(Signer=jsmith, Role=Operator, Note="Reviewed against prior quarter"),
       IOS.Trace(Channels=[Reasoning, Tools, Context])
     ]
  -> Output[Filed_Report, TurnTrace_ID];
```

---

## 12. Changes from v0.1

| Ref | Change |
|---|---|
| A1 | Positional arguments admitted; built-ins given declared signatures |
| A2 | `Identifier`, `Code`, `Number`, `String` defined; codes exclude `.` |
| A3 | `;` statement terminator for error recovery |
| A4 | `Boundary` removed from reserved words |
| A5 | `#` comments |
| A6 | JSON string syntax and escapes |
| B1 | `OnFail` block with a closed handler set |
| B2 | Outputs bind names; `@ref` for downstream use |
| B3 | `Model=` mandatory on `AI.*`; version and seed recorded |
| B4 | Outputs typed against the intent's declaration |
| B5 | `IOS.Attest` and the staged/committed distinction |
| B6 | `statement_key` idempotency |
| C1 | Attestation classes, confidence decay, derivation depth cap |
| C2 | `Context` block; selection predicate recorded |
| C3 | Two-phase commit on trace |
| D1–D5 | `@` for references, `%igl` pragma, `Channels=[…]`, set-valued boundary keys, fixed evaluation order |
