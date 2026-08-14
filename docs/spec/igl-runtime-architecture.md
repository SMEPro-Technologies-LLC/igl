TECHNICAL SPECIFICATION — ENGINEERING GRADE

# IGL v1\.0 Specification

Identity Governance Language — Native Language of Governed Intelligence

__Document Number__

__IGL\-SPEC\-2026\-001__

__Version__

__1\.0 — Final__

__Status__

Published

__Date__

07 August 2026

__Author__

Chris — Houston, TX

__Classification__

Engineering Specification

__Layer__

MCP Bridge Gateway / IOS\+

__Revision Cycle__

Major \(Breaking changes\)

__ABSTRACT__

This document constitutes the formal v1\.0 specification for IGL — Identity Governance Language — the native language of governed intelligence\. IGL defines the grammar, type system, operational semantics, and runtime interface required to express and enforce the real\-time fusion of AI probabilistic reasoning with UDM \(Universal Decoding Matrix\) deterministic constraint computation at the MCP Bridge Gateway layer during token generation\. This specification covers foundational primitives, formal grammar in EBNF notation, the complete operator set, type hierarchy, semantics, identity graph integration, UDM integration, IOS\+ orchestration interface, sample programs, the error model, and versioning roadmap\. IGL v1\.0 is authoritative; all governed AI runtimes claiming conformance must implement this specification in full\.

## Table of Contents

__1\. Introduction & Purpose__

1\.1  What IGL Is

1\.2  Why Existing Languages Are Insufficient

1\.3  The Core Problem Statement

1\.4  IGL's Core Thesis

1\.5  Scope and Versioning

__2\. Foundational Primitives__

2\.1  IDENTITY\_OPERAND

2\.2  BOUNDARY\_TENSOR

2\.3  CONSTRAINT\_MATRIX

2\.4  COGNITIVE\_TRACE

2\.5  GOVERNANCE\_RECEIPT

2\.6  TURN\_TRACE

__3\. Syntax & Grammar__

3\.1  Program Structure

3\.2  Identity Declarations

3\.3  Boundary Expressions

3\.4  Constraint Injection Blocks

3\.5  Fusion Expressions

3\.6  Trace Capture Statements

3\.7  Receipt Generation Clauses

3\.8  Conditional Governance Constructs

3\.9  Recursive Intelligence Blocks

__4\. Operators__

4\.1  FUSE

4\.2  CONSTRAIN

4\.3  BIND

4\.4  VERIFY

4\.5  PROJECT

4\.6  INJECT

4\.7  CAPTURE

4\.8  RECURSE

__5\. Type System__

5\.1  Type Hierarchy

5\.2  Static Typing Rules

5\.3  Type Inference

5\.4  Type Compatibility Matrix

5\.5  Coercion Rules

__6\. Semantics__

6\.1  Operational Semantics

6\.2  Denotational Semantics for Fusion Expressions

6\.3  Identity Resolution Semantics

6\.4  Boundary Enforcement Semantics

6\.5  Trace Capture Semantics

__7\. Identity Graph Integration__

7\.1  Identity Graph as First Operand

7\.2  Authority Resolution Algorithm

7\.3  Exception Handling via Identity Exceptions

7\.4  Identity Propagation Across Recursive Calls

__8\. UDM Integration__

8\.1  CONSTRAINT\_MATRIX to UDM Jurisdiction Mapping

8\.2  Semantic Crosswalk Tensors

8\.3  Ontology Graph References in IGL Syntax

8\.4  Reporting Window Constraints as Time\-Boundary Expressions

8\.5  Constraint Injection at Inference Time

__9\. IOS\+ Orchestration Interface__

9\.1  IOS\+ Execution Model

9\.2  Decision Surfaces

9\.3  The Conductor Model

9\.4  Interface Contract

__10\. Sample Programs__

10\.1 Simple Governed Query

10\.2 Multi\-Identity Fusion with Authority Escalation

10\.3 Recursive Governed Reasoning Loop

10\.4 Cross\-Jurisdiction Boundary Enforcement

10\.5 Full TurnTrace Capture with Receipt Generation

__11\. Error Model__

11\.1 Error Taxonomy

11\.2 Error Propagation Rules

11\.3 Recovery Semantics

__12\. Version History & Roadmap__

12\.1 v1\.0 Scope and Known Limitations

12\.2 Planned v1\.1 Features

12\.3 Compatibility Guarantees

# 1\. Introduction & Purpose

## 1\.1 What IGL Is

IGL — Identity Governance Language — is a formally defined programming and expression language purpose\-built to represent, govern, and execute the computation that occurs when AI probabilistic reasoning and deterministic governance constraints are fused in real time\. IGL is not a query language, a configuration format, a constraint\-satisfaction language, or a scripting language\. It is the native language of governed intelligence: a first\-class computational system in which *identity* is the zeroth operand of every expression, and in which the act of computation and the act of governance are inseparable by construction\.

IGL programs execute at the MCP Bridge Gateway layer during token generation — not as a post\-processing filter applied after inference, and not as a policy wrapper applied before inference\. IGL expressions are evaluated in the inference loop itself, injecting governance constraints directly into the probability distributions that the model's attention and feed\-forward layers produce, binding those constrained distributions to a declared identity, and producing a cryptographically anchored GOVERNANCE\_RECEIPT as proof of the governed computation\.

IGL v1\.0 defines the complete grammar, type system, operator set, operational semantics, runtime interface, and error model for this governed computation layer\. All conformant IGL runtimes must implement this specification in full\.

## 1\.2 Why Existing Languages Are Insufficient

No existing programming or knowledge representation language can express governed intelligence computation\. The following table enumerates the most commonly proposed alternatives and the specific architectural gap each fails to bridge:

__Language / Standard__

__Design Intent__

__Fundamental Gap for Governed Intelligence__

__SQL__

Relational data query and manipulation

Operates exclusively on discrete, stored data\. Has no model of probability distributions, tensor spaces, attention matrices, or identity\-bound reasoning paths\. Cannot express "constrain this probability distribution to this jurisdictional boundary\."

__Python__

General\-purpose imperative programming

A host language for AI frameworks, not a governance expression layer\. Python wraps inference calls; it cannot inject constraints into the inference computation itself at the token generation level without specialized kernel\-level access\. Has no native identity operand, no boundary tensor type, no governance receipt semantics\.

__OWL / SPARQL__

Ontology representation and semantic query

Operates in the description logic space\. Expresses class membership, property relations, and open\-world reasoning\. Cannot represent continuous\-valued tensor constraints, cannot bind reasoning paths to probability distributions, and has no operational semantics for real\-time inference intervention\.

__JSON\-LD__

Linked data serialization with context

A data interchange format, not a computation language\. Has no evaluation model, no operators, no type system for tensors or matrices, and no execution semantics whatsoever\.

__SPARQL__

Graph query over RDF triples

Read\-only query over symbolic knowledge graphs\. Cannot express numerical constraint injection into live inference, cannot represent probabilistic states, and has no mechanism to produce a cryptographically bound trace of governed computation\.

__Datalog / Prolog__

Logic programming and rule derivation

Operates in Horn\-clause logic over discrete symbolic atoms\. Probability is not native; inference occurs over discrete ground facts, not continuous distributions\. Cannot bridge the symbolic\-probabilistic gap at inference time\.

__TensorFlow / PyTorch DSLs__

Tensor computation and gradient descent

Express the numerical computation of AI models, but have no governance semantics, no identity types, no jurisdictional constraint types, and no receipt generation capability\. Governance must be bolted on externally, breaking the real\-time fusion requirement\.

The common failure mode across all existing languages is architectural: they each operate exclusively in one of the two spaces that governed intelligence requires — either the probabilistic/continuous space of AI reasoning, or the deterministic/symbolic space of rule\-based governance — but none can operate in both simultaneously, and none have a formal mechanism for fusing outputs from both spaces into a single, identity\-bound, auditable expression\.

## 1\.3 The Core Problem Statement

The foundational problem that IGL solves can be stated precisely:

__PROBLEM STATEMENT — IGL\-PS\-001__

__AI computes in probability space\.__ Given an input token sequence, a large language model produces a probability distribution over the next token at each generation step\. This distribution is produced by a continuous, differentiable computation involving attention matrices, feed\-forward projections, layer normalization, and softmax operations — all of which are numerical, non\-symbolic, and non\-deterministic in the governance sense\.

__Governance computes in deterministic constraint space\.__ A governance framework such as UDM specifies mandatory rules: jurisdictional boundaries, authority hierarchies, permitted ontology traversals, reporting obligations, and exception conditions\. These constraints are categorical — a reasoning path either satisfies a constraint or it does not\. There is no probability that a regulatory boundary is crossed; it either is or it is not\.

__No existing language bridges both simultaneously\.__ Current approaches either \(a\) apply post\-hoc filtering after token generation, which permits non\-compliant tokens to be generated and then discarded — a security and auditability failure — or \(b\) apply pre\-inference guardrails that block inputs without understanding the reasoning path they would produce — a utility failure\. Neither approach produces a GOVERNANCE\_RECEIPT that is cryptographically bound to the actual computation, because in neither approach does governance touch the computation itself\.

IGL resolves this problem by defining a formal language in which governance constraints are not applied before or after inference, but are a constitutive part of the inference expression itself\. An IGL FUSE expression takes an AI probability vector and a UDM constraint matrix as co\-equal operands, and produces a governed output whose every token has been drawn from a distribution that has been bounded by the constraint matrix at generation time\.

## 1\.4 IGL's Core Thesis

IGL is founded on a single architectural thesis, from which all primitive definitions, operator semantics, and type rules follow:

Identity is the first operand in every IGL expression\.

Before any reasoning can occur, before any constraint can be applied, before any output can be produced, the identity of the acting entity — its authority level, its jurisdictional scope, its declared exceptions, and its propagation rules — must be fully resolved and bound to the computation\. An IGL expression that cannot resolve its IDENTITY\_OPERAND is not a partial expression; it is an error state\. Computation without identity is not governed computation; it is uncontrolled inference\.

— IGL Design Axiom 1, August 2026

This thesis has two corollaries that are enforced by the IGL type system:

1. __Corollary 1 — Identity Primacy:__ The type IdentityType is the root of the IGL type hierarchy\. No expression of any other type can be evaluated in a context where an IdentityType is unresolved\. This is enforced at compile time\.
2. __Corollary 2 — Receipt Completeness:__ Every IGL program that produces output must produce a GOVERNANCE\_RECEIPT\. A program that terminates without issuing a GOVERNANCE\_RECEIPT has committed a TraceCaptureFault \(see Section 11\)\. The IGL runtime enforces this at program exit\.

## 1\.5 Scope and Versioning

IGL v1\.0 defines the complete normative specification for the following:

- The six foundational primitives \(Section 2\)
- The formal EBNF grammar \(Section 3\)
- The eight core operators \(Section 4\)
- The static type system and type hierarchy \(Section 5\)
- Operational and denotational semantics \(Section 6\)
- Identity Graph integration protocol \(Section 7\)
- UDM integration protocol \(Section 8\)
- IOS\+ Orchestration Engine interface \(Section 9\)
- The error model and recovery semantics \(Section 11\)

IGL v1\.0 does NOT cover distributed multi\-node IGL execution, IGL compilation to native code, IGL hot\-reload semantics, or inter\-program IGL message passing\. These are deferred to v1\.1 and beyond \(see Section 12\)\.

Version numbering follows semantic versioning: MAJOR\.MINOR\. A MAJOR version increment indicates breaking changes to the grammar, type system, or operator semantics\. A MINOR version increment indicates backward\-compatible additions\. Programs conformant to IGL v1\.0 are guaranteed to execute correctly on any IGL v1\.x runtime where x >= 0, subject to the compatibility guarantees in Section 12\.3\.

# 2\. Foundational Primitives

IGL defines six foundational primitives\. Each primitive is a first\-class value in the IGL type system\. Primitives may not be subclassed or redefined by user programs; they are language\-intrinsic types defined by this specification\. Each subsection below provides the primitive's formal syntax, type signature, and operational semantics\.

## 2\.1 IDENTITY\_OPERAND

__Definition:__ The IDENTITY\_OPERAND is the first\-class entity representing who or what is acting in a governed computation\. It is the mandatory first argument to all IGL operators that produce output\. An IDENTITY\_OPERAND encodes the acting entity's identity reference, authority level, boundary scope, and any declared exceptions that permit computation outside the default boundary\.

__Syntax:__

IDENTITY\_OPERAND \{
    id          : IdentityRef       \-\- Unique identifier in the Identity Graph
    authority   : AuthorityLevel    \-\- Scalar authority in range \[0\.0, 1\.0\]
    boundary    : BoundaryRef       \-\- Reference to a BOUNDARY\_TENSOR
    exceptions  : ExceptionList?    \-\- Optional list of declared exceptions
    propagation : PropagationRule   \-\- INHERIT | ISOLATE | DELEGATE
\}

__Type Signature:__ IDENTITY\_OPERAND : IdentityType

__Semantics:__ When the IGL runtime encounters an IDENTITY\_OPERAND declaration, it immediately resolves the id field against the Identity Graph \(Section 7\)\. Resolution must complete before any other field is evaluated\. If the id cannot be resolved, the runtime raises an IdentityResolutionError and halts the program\. The authority field is a normalized scalar; values outside \[0\.0, 1\.0\] are rejected at parse time\. The exceptions field is optional; an absent exception list is equivalent to an empty list\. The propagation rule governs how this identity is carried into nested or recursive IGL calls \(see Section 7\.4\)\.

__Slots:__

__Slot__

__Type__

__Required__

__Description__

id

IdentityRef

Yes

URI\-format reference into the Identity Graph namespace

authority

Float\[0,1\]

Yes

Normalized authority scalar; 1\.0 = maximum authority

boundary

BoundaryRef

Yes

Reference to a BOUNDARY\_TENSOR definition

exceptions

ExceptionList

No

Ordered list of declared exception handles

propagation

PropagationRule

Yes

One of: INHERIT, ISOLATE, DELEGATE

## 2\.2 BOUNDARY\_TENSOR

__Definition:__ A BOUNDARY\_TENSOR is a numerical representation of the jurisdictional and contextual limits within which governed computation must remain\. It is a multi\-dimensional tensor whose axes correspond to UDM jurisdiction dimensions, contextual constraint axes, and temporal validity bounds\. The BOUNDARY\_TENSOR is the bridge between UDM's numerical constraint representation and IGL's type system\.

__Syntax:__

BOUNDARY\_TENSOR \{
    dimensions  : Nat\+               \-\- Number of constraint dimensions \(>= 1\)
    shape       : Nat\[\]              \-\- Shape vector of length \`dimensions\`
    values      : Float\[\]            \-\- Flat\-packed tensor values \(row\-major order\)
    jurisdiction: JurisdictionRef    \-\- UDM jurisdiction identifier
    temporal    : TemporalBound?     \-\- Optional: valid time window \[start, end\]
    strictness  : HARD | SOFT        \-\- Violation policy: HARD = halt, SOFT = warn
\}

__Type Signature:__ BOUNDARY\_TENSOR : BoundaryType

__Semantics:__ The BOUNDARY\_TENSOR defines a hyperplane constraint in the joint space of UDM jurisdiction axes and AI reasoning path axes\. At inference time, after the FUSE operator applies the AI probability vector and UDM constraint matrix \(see Section 4\.1\), the runtime projects the resulting governed output through the BOUNDARY\_TENSOR to verify that all generated probability mass lies within the admissible region\. A HARD strictness violation halts the computation and raises a BoundaryViolationError\. A SOFT strictness violation logs the violation in the COGNITIVE\_TRACE without halting\.

__Interpretation of Tensor Values:__ Each value in the flat\-packed tensor represents the maximum permissible probability mass that may be allocated to the corresponding reasoning dimension at that coordinate\. A value of 0\.0 denotes a strictly forbidden region\. A value of 1\.0 denotes an unrestricted region\.

## 2\.3 CONSTRAINT\_MATRIX

__Definition:__ The CONSTRAINT\_MATRIX is a UDM\-derived rule set injected into the IGL inference context\. It is a two\-dimensional matrix mapping from reasoning path identifiers \(rows\) to constraint categories \(columns\), where each cell value encodes a weighted constraint score: 0\.0 = fully prohibited, 1\.0 = fully permitted, intermediate values encode probabilistic constraint allowances\.

__Syntax:__

CONSTRAINT\_MATRIX \{
    source      : UDMRef             \-\- Reference to originating UDM module
    rows        : PathIdentifier\[\]   \-\- Reasoning path identifiers
    columns     : ConstraintCategory\[\] \-\- UDM constraint categories
    cells       : Float\[\]\[\]          \-\- M x N matrix of constraint values
    version     : SemVer             \-\- UDM module version at injection time
    digest      : SHA256             \-\- Integrity hash of cell values
\}

__Type Signature:__ CONSTRAINT\_MATRIX : ConstraintType

__Semantics:__ The CONSTRAINT\_MATRIX is constructed by the IOS\+ Orchestration Engine at program initialization time and is passed to the IGL runtime via the INJECT operator \(Section 4\.6\)\. Its cells are applied during FUSE execution as element\-wise scaling factors on the AI reasoning path probability distribution\. The digest field is verified by the runtime before injection; a digest mismatch raises a ConstraintInjectionError\. The version field is captured in the GOVERNANCE\_RECEIPT to provide full auditability of which UDM rule version governed the computation\.

## 2\.4 COGNITIVE\_TRACE

__Definition:__ The COGNITIVE\_TRACE is the reasoning footprint captured from the AI model engine per generation turn\. It is a structured record of the attention weights, layer activations, reasoning path identifiers, and boundary check outcomes that were produced during a single governed inference step\. The COGNITIVE\_TRACE is the primary audit artifact for AI reasoning under IGL governance\.

__Syntax:__

COGNITIVE\_TRACE \{
    turn\_id        : UUID              \-\- Unique identifier for this turn
    timestamp      : ISO8601           \-\- Wall\-clock time at capture
    attention\_map  : Float\[\]\[\]         \-\- Attention weight matrix \(H x S, heads x seq\)
    path\_ids       : PathIdentifier\[\]  \-\- Reasoning paths activated during this turn
    boundary\_checks: BoundaryCheckLog  \-\- Ordered log of all boundary evaluations
    token\_count    : Nat               \-\- Number of tokens generated this turn
    entropy        : Float             \-\- Shannon entropy of the output distribution
    model\_ref      : ModelRef          \-\- Reference to the AI model and checkpoint
\}

__Type Signature:__ COGNITIVE\_TRACE : TraceType

__Semantics:__ A COGNITIVE\_TRACE is written by the IGL runtime at the completion of each generation turn, before the TURN\_TRACE is composed\. The trace is immutable once written; any attempt to modify a written COGNITIVE\_TRACE raises a TraceCaptureFault with code TRACE\_INTEGRITY\_VIOLATION\. The entropy field provides a statistical indicator of model uncertainty at output time; high entropy values may trigger additional constraint injection in subsequent turns, as determined by the IOS\+ Orchestration Engine\.

## 2\.5 GOVERNANCE\_RECEIPT

__Definition:__ The GOVERNANCE\_RECEIPT is an immutable, cryptographically anchored proof\-of\-computation record that binds together the IDENTITY\_OPERAND, CONSTRAINT\_MATRIX, and COGNITIVE\_TRACE from a completed governed computation\. It is the terminal artifact of every IGL program that produces output, and constitutes the authoritative audit record of the governed inference event\.

__Syntax:__

GOVERNANCE\_RECEIPT \{
    receipt\_id    : UUID              \-\- Globally unique receipt identifier
    identity\_ref  : IdentityRef       \-\- Bound IDENTITY\_OPERAND\.id
    constraint\_ref: SHA256            \-\- Digest of the bound CONSTRAINT\_MATRIX
    trace\_ref     : UUID              \-\- Bound COGNITIVE\_TRACE\.turn\_id
    issued\_at     : ISO8601           \-\- Time of receipt issuance
    program\_hash  : SHA256            \-\- Hash of the IGL program that produced this
    signature     : ECDSASignature    \-\- IOS\+ runtime signature over all above fields
    outcome       : COMPLIANT | VIOLATION | EXCEPTION\_APPLIED
\}

__Type Signature:__ GOVERNANCE\_RECEIPT : ReceiptType

__Semantics:__ The GOVERNANCE\_RECEIPT is generated by the CAPTURE operator \(Section 4\.7\) from a completed TURN\_TRACE\. The signature field is produced by the IOS\+ runtime using the system's ECDSA private key, making the receipt verifiable by any party holding the corresponding public key\. The outcome field encodes the governance result: COMPLIANT means all boundary constraints were satisfied; VIOLATION means a SOFT boundary was crossed \(program continued\); EXCEPTION\_APPLIED means a declared exception from the IDENTITY\_OPERAND's exception list was invoked during execution\.

## 2\.6 TURN\_TRACE

__Definition:__ The TURN\_TRACE is the atomic unit of governed interaction in IGL\. It is a composite structure that binds the IDENTITY\_OPERAND, the CONSTRAINT\_MATRIX used during this turn, the COGNITIVE\_TRACE produced during this turn, and the governed output, into a single indivisible record\. The TURN\_TRACE is the direct input to the CAPTURE operator and is the source from which the GOVERNANCE\_RECEIPT is derived\.

__Syntax:__

TURN\_TRACE \{
    identity    : IDENTITY\_OPERAND
    constraint  : CONSTRAINT\_MATRIX
    trace       : COGNITIVE\_TRACE
    output      : GovernedOutput
    sequence\_no : Nat              \-\- Monotonically increasing per\-session counter
    parent\_id   : UUID?            \-\- UUID of parent TURN\_TRACE in recursive calls
\}

__Type Signature:__ TURN\_TRACE : TraceType

__Semantics:__ The TURN\_TRACE is constructed by the BIND operator \(Section 4\.3\)\. Its sequence\_no is assigned by the IGL runtime and is monotonically increasing within a session; gaps in sequence numbers indicate missing turns and must be flagged by the IOS\+ Orchestration Engine\. The optional parent\_id field is populated in recursive IGL programs \(Section 3\.9\), forming a linked chain of TURN\_TRACEs that enables full reasoning\-path reconstruction across recursive calls\.

# 3\. Syntax & Grammar

This section presents the normative EBNF grammar for IGL v1\.0\. Non\-terminal symbols are written in *italic* \(represented here in lowercase with underscores\)\. Terminal symbols are written in UPPER\_CASE or as quoted literals\. Optional constructs are enclosed in square brackets \[\.\.\.\]\. One\-or\-more repetitions use \+\. Zero\-or\-more repetitions use \*\. Alternatives are separated by |\.

## 3\.1 Program Structure

igl\_program      ::= program\_header identity\_block constraint\_block body\_block receipt\_block

program\_header   ::= "IGL" version\_literal "PROGRAM" string\_literal ";"
                   | "IGL" version\_literal "PROGRAM" string\_literal "SESSION" uuid\_literal ";"

version\_literal  ::= "v" DIGIT\+ "\." DIGIT\+

identity\_block   ::= "IDENTITY" "\{" identity\_decl\+ "\}"

constraint\_block ::= "CONSTRAINTS" "\{" constraint\_decl\+ "\}"

body\_block       ::= "BEGIN" statement\+ "END"

receipt\_block    ::= "RECEIPT" "\{" capture\_stmt "\}"

__Note:__ Every IGL program must contain exactly one identity\_block, exactly one constraint\_block, exactly one body\_block, and exactly one receipt\_block\. A program missing any of these four structural sections is syntactically invalid and will be rejected by the parser before evaluation begins\.

## 3\.2 Identity Declarations

identity\_decl    ::= "DECLARE" "IDENTITY" identifier "AS" identity\_operand\_expr ";"

identity\_operand\_expr ::=
    "IDENTITY\_OPERAND" "\{"
        "id"          ":" identity\_ref ","
        "authority"   ":" float\_literal ","
        "boundary"    ":" boundary\_ref ","
        \["exceptions" ":" exception\_list ","\]
        "propagation" ":" propagation\_rule
    "\}"

identity\_ref     ::= uri\_literal
boundary\_ref     ::= identifier | uri\_literal
propagation\_rule ::= "INHERIT" | "ISOLATE" | "DELEGATE" "TO" identity\_ref
exception\_list   ::= "\[" exception\_handle \("," exception\_handle\)\* "\]"
exception\_handle ::= uri\_literal

## 3\.3 Boundary Expressions

boundary\_decl    ::= "DECLARE" "BOUNDARY" identifier "AS" boundary\_tensor\_expr ";"

boundary\_tensor\_expr ::=
    "BOUNDARY\_TENSOR" "\{"
        "dimensions"   ":" nat\_literal ","
        "shape"        ":" "\[" nat\_literal \("," nat\_literal\)\* "\]" ","
        "jurisdiction" ":" jurisdiction\_ref ","
        \["temporal"    ":" temporal\_bound ","\]
        "strictness"   ":" strictness\_mode
    "\}"

strictness\_mode  ::= "HARD" | "SOFT"
temporal\_bound   ::= "\[" iso8601\_literal "," iso8601\_literal "\]"
jurisdiction\_ref ::= uri\_literal

## 3\.4 Constraint Injection Blocks

constraint\_decl  ::= "DECLARE" "CONSTRAINT" identifier "AS" constraint\_matrix\_expr ";"
                   | "INJECT" constraint\_ref "INTO" context\_ref ";"

constraint\_matrix\_expr ::=
    "CONSTRAINT\_MATRIX" "\{"
        "source"  ":" udm\_ref ","
        "version" ":" semver\_literal ","
        "digest"  ":" sha256\_literal
    "\}"

inject\_stmt      ::= "INJECT" "\(" identifier "," context\_expr "\)" ";"
udm\_ref          ::= uri\_literal
context\_ref      ::= identifier
context\_expr     ::= identifier | inference\_context\_expr

## 3\.5 Fusion Expressions

The fusion expression is the core computational unit of IGL\. It takes an AI probability vector and a UDM constraint matrix as co\-equal operands and produces a governed output whose distribution has been bounded by the constraints at generation time\.

fusion\_expr      ::= "FUSE" "\(" ai\_vector\_expr "," udm\_matrix\_expr "\)"
                   | "FUSE" "\(" ai\_vector\_expr "," udm\_matrix\_expr "\)" "UNDER" identity\_ref

ai\_vector\_expr   ::= identifier | model\_call\_expr
udm\_matrix\_expr  ::= identifier | constraint\_matrix\_expr

model\_call\_expr  ::= "AI\_INFER" "\(" prompt\_expr \["," context\_expr\] "\)"
prompt\_expr      ::= string\_literal | identifier

## 3\.6 Trace Capture Statements

trace\_stmt       ::= "CAPTURE\_TRACE" "\(" identifier "\)" "INTO" identifier ";"
                   | "BIND" "\(" identity\_ref "," trace\_ref "\)" "AS" identifier ";"

trace\_ref        ::= identifier

## 3\.7 Receipt Generation Clauses

capture\_stmt     ::= "CAPTURE" "\(" turn\_trace\_ref "\)" "AS" identifier ";"
                   | "CAPTURE" "\(" turn\_trace\_ref "\)" "AS" identifier
                       "WITH\_OUTCOME" outcome\_literal ";"

turn\_trace\_ref   ::= identifier
outcome\_literal  ::= "COMPLIANT" | "VIOLATION" | "EXCEPTION\_APPLIED"
receipt\_ref      ::= identifier

## 3\.8 Conditional Governance Constructs

IGL provides three conditional governance keywords\. These are not general\-purpose conditionals; each is semantically tied to governance evaluation\. IF\-AUTHORITY branches on the resolved authority level of the current IDENTITY\_OPERAND\. WHEN\-BOUNDARY branches on boundary constraint satisfaction\. UNLESS\-EXCEPTION branches on the presence of a declared exception that applies to the current expression\.

conditional\_stmt ::= authority\_cond | boundary\_cond | exception\_cond

authority\_cond   ::= "IF\_AUTHORITY" "\(" identity\_ref "," authority\_op "," float\_literal "\)"
                        "THEN" block\_stmt
                       \["ELSE" block\_stmt\]

boundary\_cond    ::= "WHEN\_BOUNDARY" "\(" boundary\_ref "," constraint\_ref "\)"
                        "WITHIN" block\_stmt
                       \["OUTSIDE" block\_stmt\]

exception\_cond   ::= "UNLESS\_EXCEPTION" "\(" exception\_handle "," identity\_ref "\)"
                        block\_stmt
                       \["ELSE" block\_stmt\]

authority\_op     ::= "GTE" | "LTE" | "EQ" | "GT" | "LT"

block\_stmt       ::= "\{" statement\+ "\}"

## 3\.9 Recursive Intelligence Blocks

Recursive IGL blocks allow a governed computation to call itself with a modified context, carrying the IDENTITY\_OPERAND and accumulated COGNITIVE\_TRACE forward across recursive depth levels\. All recursive calls in IGL are bounded; the maximum recursion depth must be declared in the program header\. Unbounded recursion is a compile\-time error\.

recursive\_block  ::= "RECURSE" "\(" governed\_output\_ref "," context\_expr "\)"
                       "MAX\_DEPTH" nat\_literal
                       "CARRYING" identity\_ref
                       "AS" identifier ";"

governed\_output\_ref ::= identifier

__Example:__

\-\- Recursive governed reasoning with depth limit 3
RECURSE \(initial\_output, next\_context\)
    MAX\_DEPTH 3
    CARRYING agent\_identity
    AS recursive\_trace ;

# 4\. Operators

IGL defines eight core operators\. All operators are referentially transparent with respect to their output type but are *not* pure functions — they produce observable side effects in the form of trace writes and receipt generation\. The following table provides an index of all operators before each is specified in detail\.

__Operator__

__Signature__

__Primary Purpose__

FUSE

\(AIVector, ConstraintMatrix\) → FusionType

Core fusion of AI probability vector with UDM constraint matrix

CONSTRAIN

\(ReasoningPath, BoundaryTensor\) → PathList

Filter reasoning paths to those admitted by the boundary

BIND

\(IdentityOperand, CognitiveTrace\) → TurnTrace

Compose the atomic unit of governed interaction

VERIFY

\(GovernanceReceipt, IdentityOperand\) → Boolean

Cryptographic verification of a receipt against an identity

PROJECT

\(IdentityGraph, Jurisdiction\) → IdentityType

Scope an identity to a specific jurisdiction

INJECT

\(ConstraintMatrix, InferenceContext\) → GovernedContext

Install constraint matrix into the inference context

CAPTURE

\(TurnTrace\) → GovernanceReceipt

Produce the terminal governance receipt from a turn trace

RECURSE

\(GovernedOutput, Context\) → RecursiveTrace

Self\-referencing governed computation with bounded depth

## 4\.1 FUSE

__Signature:__ FUSE\(ai\_vector: AIVector, udm\_matrix: ConstraintMatrix\) → FusionType

__Syntax:__

FUSE \( ai\_vector\_expr , udm\_matrix\_expr \) \[UNDER identity\_ref\]

__Semantics:__ FUSE is the central operator of IGL\. It accepts an AI probability vector produced by the model inference engine and a UDM CONSTRAINT\_MATRIX injected by the IOS\+ Orchestration Engine, and produces a governed output whose token probability distribution has been elementwise bounded by the constraint matrix values\. Formally:

FUSE\(v, M\) = normalize\( v ⊙ M\_projection \)

  where:
    v             = AI probability vector over vocabulary V, dim |V|
    M\_projection  = projection of CONSTRAINT\_MATRIX M onto vocabulary space V
    ⊙             = elementwise \(Hadamard\) product
    normalize\(x\)  = x / sum\(x\), renormalizing to a valid probability distribution

The optional UNDER identity\_ref clause asserts that the fusion is to be performed within the authority scope of the named identity\. If the current execution context's resolved identity does not have authority >= the named identity's authority level, a BoundaryViolationError is raised before FUSE executes\.

__Side Effects:__ FUSE writes the pair \(ai\_vector, udm\_matrix, governed\_output\) to the active COGNITIVE\_TRACE's path\_ids and updates the trace's entropy field with the entropy of the governed output distribution\.

__Errors:__ FusionTypeError if dimension mismatch between v and M\_projection; ConstraintInjectionError if M\_projection cannot be computed from M\.

## 4\.2 CONSTRAIN

__Signature:__ CONSTRAIN\(reasoning\_path: ReasoningPath, boundary: BoundaryTensor\) → PathList

__Syntax:__

CONSTRAIN \( reasoning\_path\_expr , boundary\_ref \)

__Semantics:__ CONSTRAIN takes a set of candidate reasoning paths \(the set of attention\-weighted token sequences under consideration during generation\) and a BOUNDARY\_TENSOR, and returns the subset of paths that fall within the admissible region defined by the tensor\. A reasoning path P is admitted by boundary tensor B if and only if for every dimension d and coordinate c in P, B\[d\]\[c\] > 0\.0\. Paths for which any B\[d\]\[c\] = 0\.0 are rejected and removed from the candidate set\. If the resulting PathList is empty, a BoundaryViolationError is raised with code NO\_ADMISSIBLE\_PATHS\.

__Side Effects:__ CONSTRAIN writes all rejected paths to the boundary\_checks log of the active COGNITIVE\_TRACE, recording the specific boundary dimension and coordinate that caused each rejection\.

## 4\.3 BIND

__Signature:__ BIND\(identity: IdentityOperand, trace: CognitiveTrace\) → TurnTrace

__Syntax:__

BIND \( identity\_ref , trace\_ref \) AS identifier

__Semantics:__ BIND composes a TURN\_TRACE by combining the resolved IDENTITY\_OPERAND, the active CONSTRAINT\_MATRIX from the current inference context, the completed COGNITIVE\_TRACE, and the governed output produced by the most recent FUSE expression\. The resulting TURN\_TRACE is assigned to the named identifier\. BIND assigns the sequence\_no from the runtime's session sequence counter and atomically increments the counter\. BIND is an atomic operation: it either fully succeeds and produces a complete TURN\_TRACE, or it raises a TraceCaptureFault and leaves no partial trace\.

## 4\.4 VERIFY

__Signature:__ VERIFY\(receipt: GovernanceReceipt, identity: IdentityOperand\) → Boolean

__Syntax:__

VERIFY \( receipt\_ref , identity\_ref \)

__Semantics:__ VERIFY performs cryptographic verification of a GOVERNANCE\_RECEIPT against the IOS\+ public key and structural verification of the receipt's identity\_ref field against the supplied IDENTITY\_OPERAND\. It returns TRUE if and only if: \(1\) the ECDSA signature over the receipt fields is valid; \(2\) the identity\_ref in the receipt matches the supplied identity operand's id field; and \(3\) the constraint\_ref digest in the receipt matches the digest of a CONSTRAINT\_MATRIX version known to the current session\. If any condition fails, VERIFY returns FALSE\. VERIFY does not raise errors; it returns FALSE and writes the verification failure reason to the audit log\.

## 4\.5 PROJECT

__Signature:__ PROJECT\(identity\_graph: IdentityGraph, jurisdiction: JurisdictionRef\) → IdentityType

__Syntax:__

PROJECT \( identity\_graph\_ref , jurisdiction\_ref \)

__Semantics:__ PROJECT produces a jurisdiction\-scoped view of an identity from the full Identity Graph\. It traverses the Identity Graph from the root identity node, applying the jurisdiction filter at each edge, and returns the maximal subgraph of the identity that is valid within the named jurisdiction\. The returned value is of type IdentityType and may be used as an IDENTITY\_OPERAND in subsequent expressions\. If the identity has no nodes valid within the named jurisdiction, PROJECT raises an IdentityResolutionError with code NO\_JURISDICTION\_SCOPE\.

## 4\.6 INJECT

__Signature:__ INJECT\(matrix: ConstraintMatrix, context: InferenceContext\) → GovernedContext

__Syntax:__

INJECT \( constraint\_ref , context\_ref \)

__Semantics:__ INJECT installs a CONSTRAINT\_MATRIX into an inference context, producing a GovernedContext that will apply the matrix's constraints during all subsequent FUSE operations within that context\. Before installation, INJECT verifies the matrix digest field\. If the digest does not match the content of the cells field, INJECT raises a ConstraintInjectionError with code DIGEST\_MISMATCH\. A GovernedContext is an inference context decorated with a constraint matrix; it is not separately declared as a primitive but is produced exclusively by INJECT\. Once injected, the constraint matrix remains active for the lifetime of the GovernedContext and cannot be replaced without creating a new GovernedContext\.

## 4\.7 CAPTURE

__Signature:__ CAPTURE\(turn\_trace: TurnTrace\) → GovernanceReceipt

__Syntax:__

CAPTURE \( turn\_trace\_ref \) AS identifier \[WITH\_OUTCOME outcome\_literal\]

__Semantics:__ CAPTURE takes a completed TURN\_TRACE and produces a GOVERNANCE\_RECEIPT by: \(1\) extracting the identity, constraint, and trace references from the TURN\_TRACE; \(2\) computing the program\_hash as SHA\-256 of the compiled IGL program bytecode; \(3\) assembling the receipt fields; and \(4\) requesting the IOS\+ runtime to sign the assembled fields with the system ECDSA private key\. If no WITH\_OUTCOME clause is provided, the runtime infers the outcome from the COGNITIVE\_TRACE's boundary\_checks log: no violations → COMPLIANT; SOFT violations → VIOLATION; exception invocations → EXCEPTION\_APPLIED\. CAPTURE is the only mechanism for producing a GOVERNANCE\_RECEIPT and must appear exactly once in every IGL program's receipt\_block\.

## 4\.8 RECURSE

__Signature:__ RECURSE\(output: GovernedOutput, context: Context\) → RecursiveTrace

__Syntax:__

RECURSE \( governed\_output\_ref , context\_expr \)
    MAX\_DEPTH nat\_literal
    CARRYING identity\_ref
    AS identifier

__Semantics:__ RECURSE executes the IGL program body again with the governed\_output as the new input prompt and context as the updated inference context\. The CARRYING identity\_ref clause specifies which IDENTITY\_OPERAND is propagated into the recursive call; propagation respects the identity's propagation rule \(INHERIT / ISOLATE / DELEGATE\)\. Each recursive invocation produces a TURN\_TRACE whose parent\_id is set to the turn\_id of the invoking turn's COGNITIVE\_TRACE, forming a chain\. The MAX\_DEPTH limit is enforced by the runtime; if the limit is reached, RECURSE returns the most recently produced TURN\_TRACE without issuing another recursive call\. A MAX\_DEPTH of 0 is a compile\-time error\.

# 5\. Type System

IGL is a statically typed language\. All type checking is performed at compile time\. The IGL runtime does not perform dynamic type dispatch\. Type errors are fatal compile\-time failures; they are not catchable at runtime\.

## 5\.1 Type Hierarchy

IGL defines six named types organized in a strict hierarchy\. The hierarchy establishes subtype relationships that govern type compatibility in operator application and assignment\. The root type is IGLType, from which all named types derive\.

IGLType
├── IdentityType
│   ├── IdentityRef           \(scalar: resolved identity URI\)
│   ├── IdentityOperandType   \(composite: full IDENTITY\_OPERAND record\)
│   └── ProjectedIdentityType \(composite: jurisdiction\-scoped identity\)
├── BoundaryType
│   ├── BoundaryTensorType    \(composite: full BOUNDARY\_TENSOR record\)
│   └── BoundaryRef           \(scalar: reference to declared boundary\)
├── ConstraintType
│   ├── ConstraintMatrixType  \(composite: full CONSTRAINT\_MATRIX record\)
│   └── GovernedContextType   \(composite: inference context \+ matrix\)
├── TraceType
│   ├── CognitiveTraceType    \(composite: per\-turn reasoning footprint\)
│   └── TurnTraceType         \(composite: atomic governed interaction unit\)
├── ReceiptType
│   └── GovernanceReceiptType \(composite: immutable proof\-of\-computation\)
└── FusionType
    ├── AIVectorType          \(composite: raw AI probability distribution\)
    ├── GovernedOutputType    \(composite: constraint\-bounded output distribution\)
    └── RecursiveTraceType    \(composite: recursive turn trace chain\)

## 5\.2 Static Typing Rules

The following typing rules are normative\. Rules are written in the standard type\-theoretic notation Γ ⊢ e : T \(in environment Γ, expression e has type T\)\.

\[T\-IDENTITY\]
  Γ ⊢ id : IdentityRef    Γ ⊢ a : Float\[0,1\]    Γ ⊢ b : BoundaryRef
  ──────────────────────────────────────────────────────────────────────
  Γ ⊢ IDENTITY\_OPERAND \{ id=id, authority=a, boundary=b, \.\.\. \}
        : IdentityOperandType

\[T\-FUSE\]
  Γ ⊢ v : AIVectorType    Γ ⊢ M : ConstraintMatrixType
  ──────────────────────────────────────────────────────
  Γ ⊢ FUSE\(v, M\) : GovernedOutputType

\[T\-CONSTRAIN\]
  Γ ⊢ p : ReasoningPathType    Γ ⊢ B : BoundaryTensorType
  ──────────────────────────────────────────────────────────
  Γ ⊢ CONSTRAIN\(p, B\) : List\[ReasoningPathType\]

\[T\-BIND\]
  Γ ⊢ i : IdentityOperandType    Γ ⊢ t : CognitiveTraceType
  ─────────────────────────────────────────────────────────────
  Γ ⊢ BIND\(i, t\) : TurnTraceType

\[T\-VERIFY\]
  Γ ⊢ r : GovernanceReceiptType    Γ ⊢ i : IdentityOperandType
  ───────────────────────────────────────────────────────────────
  Γ ⊢ VERIFY\(r, i\) : Boolean

\[T\-PROJECT\]
  Γ ⊢ G : IdentityGraph    Γ ⊢ j : JurisdictionRef
  ──────────────────────────────────────────────────
  Γ ⊢ PROJECT\(G, j\) : ProjectedIdentityType

\[T\-INJECT\]
  Γ ⊢ M : ConstraintMatrixType    Γ ⊢ ctx : InferenceContext
  ────────────────────────────────────────────────────────────
  Γ ⊢ INJECT\(M, ctx\) : GovernedContextType

\[T\-CAPTURE\]
  Γ ⊢ tt : TurnTraceType
  ──────────────────────────────────────────
  Γ ⊢ CAPTURE\(tt\) : GovernanceReceiptType

\[T\-RECURSE\]
  Γ ⊢ out : GovernedOutputType    Γ ⊢ ctx : GovernedContextType
  Γ ⊢ id  : IdentityOperandType   n ∈ ℕ₊
  ──────────────────────────────────────────────────────────────────
  Γ ⊢ RECURSE\(out, ctx\) MAX\_DEPTH n CARRYING id : RecursiveTraceType

## 5\.3 Type Inference

IGL supports limited type inference for locally declared identifiers\. When a DECLARE statement assigns the result of an operator expression to an identifier, the type of the identifier is inferred from the operator's return type\. Explicit type annotations are not required and are not supported in IGL v1\.0\. All top\-level declarations \(IDENTITY, BOUNDARY, CONSTRAINT\) carry their type implicitly from the primitive constructor used\.

The IGL type checker performs a single\-pass bottom\-up inference over the program AST\. Cyclic type dependencies within a single scope are a type error\. Recursive calls resolved by RECURSE do not create cyclic type dependencies because RECURSE always returns RecursiveTraceType regardless of the recursive call's internal expressions\.

## 5\.4 Type Compatibility Matrix

__Left Type__

__Right Type__

__Compatible?__

__Notes__

IdentityOperandType

ProjectedIdentityType

Yes

Projected identity is a subtype; usable anywhere IdentityOperandType is expected

ConstraintMatrixType

GovernedContextType

No

GovernedContext wraps ConstraintMatrix; cannot be used in place of raw matrix

CognitiveTraceType

TurnTraceType

No

TurnTrace contains CognitiveTrace; they are distinct composite types

TurnTraceType

RecursiveTraceType

No

RecursiveTrace is a chain of TurnTraces; not directly assignable

GovernedOutputType

AIVectorType

No

Governed output is bounded; raw AI vector is unbounded; not interchangeable

IdentityRef

IdentityOperandType

No

IdentityRef is a scalar URI; IdentityOperandType is a full composite record

BoundaryRef

BoundaryTensorType

No

Ref is a pointer; full tensor is required for CONSTRAIN and FUSE operations

GovernanceReceiptType

TurnTraceType

No

Receipt is derived from TurnTrace; they are not interchangeable

## 5\.5 Coercion Rules

IGL permits a strictly limited set of implicit coercions between UDM numerical types and AI tensor types\. Coercions are performed by the runtime automatically when type\-compatible operator combinations are detected by the type checker\. No user\-initiated casting syntax exists in IGL v1\.0\.

__From Type__

__To Type__

__Coercion Rule__

UDM\.JurisdictionMatrix

ConstraintMatrixType

Structural lifting: UDM matrix fields mapped to IGL CONSTRAINT\_MATRIX fields; digest recomputed

UDM\.BoundaryVector

BoundaryTensorType

Vector promoted to rank\-1 tensor; single dimension; strictness defaults to HARD

AI\.AttentionMatrix

AIVectorType

Head\-averaged attention projection onto vocabulary space; dimension = |V|

Float\[0,1\]

AuthorityLevel

Identity coercion; value range enforced by the type checker

UUID

IdentityRef

UUID wrapped in the IGL identity namespace URI scheme: igl://identity/\{uuid\}

All other type combinations require explicit operator application and cannot be coerced\. Attempts to use incompatible types in operator arguments without applying a coercion\-valid operator first result in a compile\-time FusionTypeError\.

# 6\. Semantics

## 6\.1 Operational Semantics

IGL uses a small\-step operational semantics\. Reduction rules are written in the standard format e → e' \(expression e reduces to e' in one step\)\. The notation e →\* e' denotes the reflexive\-transitive closure \(zero or more steps\)\. Terminal expressions \(values\) are denoted with a subscript *v*\.

\[E\-FUSE\-STEP\]
  v → v'
  ──────────────────────────────────
  FUSE\(v, M\) → FUSE\(v', M\)

\[E\-FUSE\-COMPUTE\]
  v\_v is a value    M\_v is a value
  ─────────────────────────────────────────────────────────────────
  FUSE\(v\_v, M\_v\) → normalize\(v\_v ⊙ project\(M\_v, vocab\(v\_v\)\)\)

\[E\-CONSTRAIN\-STEP\]
  p → p'
  ──────────────────────────────────────
  CONSTRAIN\(p, B\) → CONSTRAIN\(p', B\)

\[E\-CONSTRAIN\-COMPUTE\]
  p\_v is a value    B\_v is a value
  ────────────────────────────────────────────────────────────
  CONSTRAIN\(p\_v, B\_v\) → \{ q ∈ p\_v | ∀d,c: B\_v\[d\]\[c\] > 0\.0 \}

\[E\-BIND\-COMPUTE\]
  i\_v is a value    t\_v is a value    M\_active is the active ConstraintMatrix
  ───────────────────────────────────────────────────────────────────────────
  BIND\(i\_v, t\_v\) → TurnTrace\{ identity=i\_v, constraint=M\_active,
                               trace=t\_v, output=current\_output,
                               sequence\_no=next\_seq\(\),
                               parent\_id=current\_parent\_id\(\) \}

\[E\-CAPTURE\-COMPUTE\]
  tt\_v is a value
  ──────────────────────────────────────────────────────────────────────
  CAPTURE\(tt\_v\) → GovernanceReceipt\{ identity\_ref=tt\_v\.identity\.id,
                                      constraint\_ref=digest\(tt\_v\.constraint\),
                                      trace\_ref=tt\_v\.trace\.turn\_id,
                                      issued\_at=now\(\),
                                      program\_hash=sha256\(program\_bytes\),
                                      signature=ios\_sign\(all\_above\),
                                      outcome=infer\_outcome\(tt\_v\) \}

\[E\-RECURSE\-BASE\]
  depth = MAX\_DEPTH
  ─────────────────────────────────────────────────────────
  RECURSE\(out, ctx\) MAX\_DEPTH depth CARRYING id → out

\[E\-RECURSE\-STEP\]
  depth > 0    out → out'
  ─────────────────────────────────────────────────────────────────────
  RECURSE\(out, ctx\) MAX\_DEPTH depth CARRYING id →
    RECURSE\(FUSE\(out', INJECT\(active\_M, ctx\)\), ctx'\)
    MAX\_DEPTH \(depth \- 1\) CARRYING propagate\(id\)

## 6\.2 Denotational Semantics for Fusion Expressions

The denotational semantics of a FUSE expression maps syntactic fusion expressions to mathematical objects in the product space of AI probability distributions and UDM constraint spaces\. Let __V__ be the vocabulary space \(a finite set of token identifiers\), __Δ\(V\)__ be the set of probability distributions over __V__, and __C__ be the UDM constraint space \(a bounded real\-valued tensor space\)\.

⟦ FUSE\(v, M\) ⟧ : Δ\(V\) × C → Δ\(V\)

  ⟦ FUSE\(v, M\) ⟧\(ρ, σ\) = normalize\( ρ\(v\) ⊙ π\_V\(σ\(M\)\) \)

  where:
    ρ   : syntactic domain \(IGL program\) → semantic domain \(distributions\)
    σ   : syntactic domain \(IGL constraints\) → semantic domain \(UDM space C\)
    π\_V : projection from UDM constraint space C onto vocabulary space Δ\(V\)
    ⊙   : elementwise product \(Hadamard product\) on ℝ^|V|

  Soundness condition:
    ∀ v, M: sum\_i\( ⟦ FUSE\(v, M\) ⟧\_i \) = 1\.0
    \(The output is always a valid probability distribution\)

  Compliance condition:
    ∀ v, M, i: ⟦ FUSE\(v, M\) ⟧\_i ≤ π\_V\(σ\(M\)\)\_i
    \(No output token receives more probability mass than permitted by the constraint\)

## 6\.3 Identity Resolution Semantics

Identity resolution is the process by which the IGL runtime resolves an IdentityRef \(a URI string\) into a fully populated IdentityOperandType by querying the Identity Graph\. Resolution proceeds as follows:

1. __URI Parsing:__ The id field is parsed as a URI of the form igl://identity/\{namespace\}/\{local\-id\}\. URIs not matching this scheme raise an IdentityResolutionError with code INVALID\_URI\_SCHEME\.
2. __Graph Lookup:__ The runtime queries the Identity Graph with the parsed URI as the lookup key\. The query returns the identity node and all adjacent edges within two hops \(authority edges and boundary edges\)\.
3. __Authority Binding:__ The authority level is read from the identity node's authority attribute\. If the attribute is absent, the default value of 0\.0 \(minimum authority\) is assigned\.
4. __Boundary Binding:__ The boundary reference is resolved from the identity node's boundary edge to a BOUNDARY\_TENSOR definition\. If the edge is absent, the runtime applies the session\-default boundary tensor specified by IOS\+\.
5. __Exception Loading:__ All exception handles reachable from the identity node via exception edges are loaded into the ExceptionList\.
6. __Resolution Finalization:__ The fully populated IDENTITY\_OPERAND is written to the runtime's identity resolution cache for this session\. Cache entries expire at session end\.

## 6\.4 Boundary Enforcement Semantics

Boundary enforcement is triggered by every FUSE and CONSTRAIN operation\. The enforcement procedure is:

1. After FUSE produces a GovernedOutputType, the runtime computes the set of token indices for which the output probability exceeds the corresponding BOUNDARY\_TENSOR value\.
2. If this set is non\-empty and the BOUNDARY\_TENSOR's strictness is HARD, a BoundaryViolationError is raised with code HARD\_BOUNDARY\_EXCEEDED\. The governed output is discarded and program execution halts\. The COGNITIVE\_TRACE is written to the audit log before halting\.
3. If this set is non\-empty and the BOUNDARY\_TENSOR's strictness is SOFT, the violation is logged to the boundary\_checks field of the active COGNITIVE\_TRACE\. Execution continues\. The GOVERNANCE\_RECEIPT will be issued with outcome = VIOLATION\.
4. Before a HARD violation halt, the runtime checks whether any exception in the IDENTITY\_OPERAND's ExceptionList applies to the violated boundary dimension\. If a matching exception is found, it is applied, the violation is re\-classified as EXCEPTION\_APPLIED, and execution continues\. The exception handle is recorded in the COGNITIVE\_TRACE\.

## 6\.5 Trace Capture Semantics

A COGNITIVE\_TRACE is written by the runtime in two phases:

- __Phase 1 — Open Write \(during inference\):__ As each FUSE or CONSTRAIN operation executes, the runtime appends to the trace's path\_ids list and boundary\_checks log\. At this phase, the trace object is mutable and held in a runtime buffer\.
- __Phase 2 — Close and Seal \(after turn completion\):__ When the body block's final statement completes, the runtime finalizes the trace: it writes the entropy and token\_count fields, sets the timestamp to the current wall\-clock time, and marks the trace as immutable\. After sealing, any write attempt to the trace raises a TraceCaptureFault\.

The sealed trace is then available as input to the BIND operator\. The runtime guarantees that trace sealing occurs atomically with respect to the program's body block; no statements from a subsequent recursive call can write to the sealed trace\. Recursive calls produce new, separate COGNITIVE\_TRACE objects that are linked via the TURN\_TRACE parent\_id chain\.

# 7\. Identity Graph Integration

## 7\.1 Identity Graph as First Operand — Formal Definition

The Identity Graph is a directed, labeled property graph __G = \(N, E, λ, μ\)__ where:

N   = finite set of identity nodes
  E   ⊆ N × N = directed edges between identity nodes
  λ : N → NodeLabel = labeling function assigning node types
  μ : E → EdgeLabel = labeling function assigning edge types

  NodeLabel ∈ \{ ENTITY, ROLE, AUTHORITY\_SCOPE, EXCEPTION, BOUNDARY\_DEF \}
  EdgeLabel ∈ \{ HAS\_AUTHORITY, HAS\_BOUNDARY, HAS\_EXCEPTION, DELEGATES\_TO,
                INHERITS\_FROM, PEER\_OF \}

The Identity Graph is maintained by the IOS\+ Orchestration Engine and is read\-only from the perspective of an executing IGL program\. IGL programs may query the graph via PROJECT and identity resolution, but may not write to it\. The graph is versioned; each IGL session records the graph version at session initialization time in the session header, and this version is captured in the GOVERNANCE\_RECEIPT's program\_hash derivation\.

## 7\.2 Authority Resolution Algorithm

Authority resolution is the algorithm by which the IGL runtime determines the effective authority level of an IDENTITY\_OPERAND for a given governance decision\. The algorithm is:

FUNCTION resolve\_authority\(identity: IdentityRef, decision\_context: Context\)
    → AuthorityLevel:

  node ← Identity\_Graph\.lookup\(identity\)
  IF node = NULL THEN RAISE IdentityResolutionError\(IDENTITY\_NOT\_FOUND\)

  base\_authority ← node\.authority

  \-\- Traverse inheritance edges \(INHERITS\_FROM\)
  FOR EACH parent\_edge IN outgoing\_edges\(node, INHERITS\_FROM\):
      parent\_authority ← resolve\_authority\(parent\_edge\.target, decision\_context\)
      base\_authority ← MAX\(base\_authority, parent\_authority\)

  \-\- Apply context\-specific authority modifiers
  FOR EACH scope IN active\_scopes\(decision\_context\):
      IF scope\.applies\_to\(node\):
          base\_authority ← base\_authority \* scope\.authority\_factor

  \-\- Clamp to \[0\.0, 1\.0\]
  RETURN CLAMP\(base\_authority, 0\.0, 1\.0\)
END FUNCTION

The algorithm is depth\-bounded by the maximum inheritance depth configured for the Identity Graph\. By default, IGL v1\.0 supports a maximum inheritance depth of 8\. Deeper inheritance chains are a runtime configuration error\.

## 7\.3 Exception Handling via Identity Exceptions

An identity exception is a declared override that permits an IDENTITY\_OPERAND to perform a computation that would otherwise be blocked by a BOUNDARY\_TENSOR with HARD strictness\. Exceptions are declared in the Identity Graph as nodes of type EXCEPTION and are referenced in the IDENTITY\_OPERAND's exceptions field\. Exception application follows these rules:

1. When a HARD boundary violation is detected, the runtime scans the IDENTITY\_OPERAND's ExceptionList in declaration order\.
2. For each exception handle, the runtime queries the Identity Graph to determine which boundary dimensions the exception covers\.
3. If the violated boundary dimension is covered by an exception, the exception is applied: the hard violation is reclassified as EXCEPTION\_APPLIED, the specific token probability values that exceeded the boundary are renormalized to the boundary maximum for that dimension, and execution continues\.
4. Exception application is recorded in the COGNITIVE\_TRACE's boundary\_checks log with the exception handle URI as the resolution reference\.
5. If no exception covers the violated dimension, the hard violation is enforced and the program halts with a BoundaryViolationError\.

## 7\.4 Identity Propagation Across Recursive Calls

The propagation field of an IDENTITY\_OPERAND controls how the identity is carried into recursive IGL calls invoked via RECURSE\. The three propagation modes and their semantics are:

__Mode__

__Semantics__

INHERIT

The child recursive call uses the same IDENTITY\_OPERAND as the parent, including the same authority level, boundary reference, and exception list\. Changes to the Identity Graph that occur between recursive calls are reflected because resolution is re\-evaluated at each level\. The child TURN\_TRACE records the same identity\_ref as the parent\.

ISOLATE

The child recursive call uses the session\-default identity specified by IOS\+ rather than the parent's identity\. The child TURN\_TRACE's parent\_id still links to the parent TURN\_TRACE for lineage purposes, but the child's identity\_ref is the session\-default identity URI\. This mode is used when a recursive call must be governed under different identity constraints than its parent\.

DELEGATE TO \{target\_uri\}

The child recursive call uses the identity identified by target\_uri, which must be reachable from the parent identity via a DELEGATES\_TO edge in the Identity Graph\. The runtime verifies the delegation edge before executing the recursive call; if the edge does not exist, a IdentityResolutionError with code DELEGATION\_NOT\_AUTHORIZED is raised\.

# 8\. UDM Integration

## 8\.1 CONSTRAINT\_MATRIX to UDM Jurisdiction Mapping

The Universal Decoding Matrix \(UDM\) organizes governance constraints as jurisdiction matrices: two\-dimensional sparse matrices where rows represent regulated entities \(agents, data sources, knowledge domains\) and columns represent constraint categories \(access control, output restrictions, mandatory disclosures, ethical boundaries, temporal constraints\)\. IGL's CONSTRAINT\_MATRIX is the runtime representation of a UDM jurisdiction matrix slice relevant to the current execution context\.

The mapping from a UDM jurisdiction matrix __J__ to an IGL CONSTRAINT\_MATRIX __M__ is performed by the IOS\+ Orchestration Engine using the following procedure:

FUNCTION udm\_to\_igl\_constraint\(J: UDM\_JurisdictionMatrix, ctx: SessionContext\)
    → CONSTRAINT\_MATRIX:

  \-\- Select the rows relevant to the current session's acting identity
  relevant\_rows ← SELECT rows FROM J WHERE row\.entity\_ref IN ctx\.identity\_scope

  \-\- Select the columns relevant to the current session's active domains
  relevant\_cols ← SELECT cols FROM J WHERE col\.category IN ctx\.domain\_scope

  \-\- Extract the submatrix and normalize values to \[0\.0, 1\.0\]
  cells ← normalize\_constraint\_values\(J\[relevant\_rows, relevant\_cols\]\)

  RETURN CONSTRAINT\_MATRIX \{
    source  : J\.udm\_module\_ref,
    rows    : relevant\_rows\.path\_identifiers,
    columns : relevant\_cols\.constraint\_categories,
    cells   : cells,
    version : J\.version,
    digest  : sha256\(cells\)
  \}
END FUNCTION

## 8\.2 Semantic Crosswalk Tensors

A semantic crosswalk tensor is a rank\-3 tensor that maps between UDM constraint semantic categories and AI model reasoning path semantic categories\. It is required because UDM constraint categories \(e\.g\., "personal data disclosure," "cross\-border data transfer," "regulatory reporting"\) are defined in the governance ontology space, while AI reasoning path categories are defined in the model's latent semantic space\. The crosswalk tensor provides the bridge\.

X ∈ ℝ^\(K × D × L\)

  where:
    K = number of UDM constraint categories
    D = number of AI reasoning path dimensions
    L = number of shared semantic latent dimensions

  Interpretation:
    X\[k, d, l\] = strength of semantic alignment between UDM category k,
                 AI path dimension d, at latent dimension l

  Used in FUSE as:
    M\_projection = einsum\('kdl, dl \-> kd', X, ai\_path\_weights\) reshaped to vocab space

Semantic crosswalk tensors are precomputed by the IOS\+ Orchestration Engine during system initialization and are stored as part of the session context\. They are not user\-configurable in IGL v1\.0\.

## 8\.3 Ontology Graph References in IGL Syntax

IGL programs may reference UDM ontology graph nodes directly in boundary expressions and constraint declarations using the udm:// URI scheme\. These references are resolved by the IGL runtime against the UDM ontology graph at compile time \(for static references\) or at INJECT time \(for dynamic references\)\.

\-\- Example: Referencing a UDM ontology node in a boundary declaration
DECLARE BOUNDARY personal\_data\_boundary AS BOUNDARY\_TENSOR \{
    dimensions  : 3,
    shape       : \[128, 64, 32\],
    jurisdiction: "udm://jurisdiction/gdpr/article\-9",
    temporal    : \["2026\-01\-01T00:00:00Z", "2027\-01\-01T00:00:00Z"\],
    strictness  : HARD
\} ;

The udm:// URI scheme is defined by the UDM specification\. IGL v1\.0 requires UDM v2\.0 or later for full ontology graph reference support\. UDM v1\.x provides only partial jurisdiction matrix support and does not expose ontology graph URIs; IGL running against UDM v1\.x must use numeric jurisdiction identifiers instead\.

## 8\.4 Reporting Window Constraints as Time\-Boundary Expressions

UDM reporting window constraints specify time windows during which certain governed computations are permitted or required\. In IGL, these map to the temporal field of the BOUNDARY\_TENSOR\. The temporal bound is a closed interval \[start, end\] expressed as ISO 8601 UTC timestamps\. The IGL runtime evaluates the temporal bound at FUSE time by comparing the current wall\-clock time \(UTC\) against the interval\. If the current time falls outside the interval:

- If strictness = HARD: a BoundaryViolationError with code TEMPORAL\_BOUNDARY\_EXCEEDED is raised and the program halts\.
- If strictness = SOFT: the temporal violation is logged to the COGNITIVE\_TRACE and a warning is written to the IOS\+ audit log\.

## 8\.5 Constraint Injection at Inference Time

UDM constraints are injected into the IGL inference context at three points in the execution lifecycle:

__Injection Point__

__Trigger__

__IGL Mechanism__

__Session Initialization__

IGL program start

IOS\+ computes the session CONSTRAINT\_MATRIX from the UDM jurisdiction matrix and injects it via INJECT before the body block begins

__Turn Boundary__

Each BIND call

IOS\+ re\-evaluates the active CONSTRAINT\_MATRIX against the current COGNITIVE\_TRACE entropy; high entropy may trigger constraint tightening

__Exception Application__

Identity exception invoked

IOS\+ produces a modified CONSTRAINT\_MATRIX with relaxed values in the exception\-covered dimensions; injected via INJECT into the current GovernedContext

# 9\. IOS\+ Orchestration Interface

## 9\.1 IOS\+ Execution Model

The IOS\+ Orchestration Engine is the runtime host for all IGL programs\. IGL programs do not execute in isolation; they execute within the IOS\+ managed execution environment, which provides the Identity Graph connection, UDM constraint matrix generation, ECDSA signing for GOVERNANCE\_RECEIPTs, audit log management, and the session sequence number service\. An IGL program that attempts to execute outside the IOS\+ environment will fail at runtime initialization because the identity resolution service, constraint injection service, and receipt signing service are all provided exclusively by IOS\+\.

The IOS\+ execution lifecycle for an IGL program is:

1. __Program Reception:__ IOS\+ receives the IGL program text \(or pre\-compiled bytecode\) and the session context from the calling agent\.
2. __Parse and Typecheck:__ The IGL compiler parses the program and performs the static type checks defined in Section 5\.2\. Type errors halt execution before any runtime initialization\.
3. __Session Initialization:__ IOS\+ allocates a session UUID, records the Identity Graph version, computes the initial CONSTRAINT\_MATRIX, and injects it into the initial GovernedContext\.
4. __Body Execution:__ IOS\+ hands control to the IGL runtime, which executes the body block statement by statement according to the small\-step reduction rules in Section 6\.1\.
5. __Receipt Generation:__ The IGL runtime calls CAPTURE on the final TURN\_TRACE; IOS\+ signs the resulting GOVERNANCE\_RECEIPT with the system ECDSA private key\.
6. __Session Termination:__ IOS\+ closes the session, flushes all COGNITIVE\_TRACE data to the audit log, and returns the GOVERNANCE\_RECEIPT to the calling agent\.

## 9\.2 Decision Surfaces

IOS\+ exposes three decision surfaces to the IGL runtime\. A decision surface is a runtime hook at which IOS\+ makes a governance decision that affects the IGL execution context\. IGL programs do not call decision surfaces directly; the runtime invokes them automatically at the appropriate points in execution\.

__Decision Surface__

__Trigger__

__IOS\+ Decisions Made__

__CONSTRAINT\_SURFACE__

Immediately before each FUSE call

Which CONSTRAINT\_MATRIX version applies; whether to tighten or relax constraints based on prior turn entropy; whether to inject a modified matrix

__IDENTITY\_SURFACE__

Immediately before each BIND call

Which IDENTITY\_OPERAND is active; whether identity propagation rules need override; whether the acting identity still has valid authority \(expiry check\)

__TRACE\_SURFACE__

At COGNITIVE\_TRACE seal time

Which trace fields must be captured per current UDM reporting obligations; whether the trace meets minimum entropy thresholds for audit purposes; whether additional trace metadata must be appended

## 9\.3 The Conductor Model

The relationship between IGL and IOS\+ is formally analogous to the relationship between a musical score and its conductor\. An IGL program is the score: it specifies the complete structure of the governed computation — the identities, constraints, fusion expressions, trace captures, and receipt generation — with precision and completeness\. IOS\+ is the conductor: it interprets the score in real time, determining which constraints apply at this moment for this session, how the identity authority is resolved in this context, and how the traces are captured for this regulatory environment\.

The conductor model has three formal properties that IGL v1\.0 enforces:

1. __Score Completeness:__ An IGL program must be a complete, closed specification\. It may not defer governance decisions to runtime calls outside the IGL operator set\. There are no escape hatches, no "eval" constructs, and no foreign function calls in IGL v1\.0\.
2. __Conductor Authority:__ IOS\+ may tighten constraints beyond what the IGL program specifies \(the conductor may play a passage more softly than marked\), but may never relax constraints below the level specified in the BOUNDARY\_TENSOR unless an identity exception explicitly authorizes it\.
3. __Receipt Non\-Repudiation:__ The GOVERNANCE\_RECEIPT signature is produced by IOS\+ and is not modifiable by the IGL program\. The IGL program may read the receipt \(via VERIFY\) but may not alter it\.

## 9\.4 Interface Contract

The interface contract between the IGL runtime and IOS\+ is specified as a set of service interfaces\. Each interface is called synchronously by the IGL runtime; IOS\+ guarantees a response within the configured timeout\. Timeout events raise a ConstraintInjectionError with code IOS\_TIMEOUT\.

__Service Interface__

__Request__

__Response__

ios\.resolveIdentity\(uri\)

IdentityRef URI string

Fully populated IdentityOperandType or IdentityResolutionError

ios\.getConstraintMatrix\(ctx\)

Session context descriptor

Current CONSTRAINT\_MATRIX or ConstraintInjectionError

ios\.signReceipt\(fields\)

Receipt field bundle \(all non\-signature fields\)

ECDSASignature or signing error

ios\.logTrace\(trace\)

Sealed COGNITIVE\_TRACE

Acknowledgment UUID or TraceCaptureFault

ios\.queryIdentityGraph\(uri, depth\)

Node URI and traversal depth

Subgraph of Identity Graph or IdentityResolutionError

ios\.nextSequenceNo\(\)

\(none\)

Monotonically increasing Nat for current session

# 10\. Sample Programs

The following five complete IGL v1\.0 programs are provided as normative examples\. Each program is presented with line\-by\-line commentary\. Line numbers are for reference only and are not part of IGL syntax\.

## 10\.1 Simple Governed Query \(Single Identity, Single Boundary\)

This program represents the simplest valid IGL program: a single governed inference turn under a single identity with a single boundary constraint\.

IGL v1\.0 PROGRAM "simple\_query\_example" ;

IDENTITY \{
    DECLARE IDENTITY agent AS IDENTITY\_OPERAND \{   \-\- \(1\) Declare the acting identity
        id          : "igl://identity/houston/agent\-001",
        authority   : 0\.5,                         \-\- \(2\) Mid\-level authority
        boundary    : public\_boundary,             \-\- \(3\) References boundary below
        propagation : INHERIT                      \-\- \(4\) Recursive calls inherit this identity
    \} ;
\}

CONSTRAINTS \{
    DECLARE BOUNDARY public\_boundary AS BOUNDARY\_TENSOR \{  \-\- \(5\) Declare boundary tensor
        dimensions  : 2,
        shape       : \[512, 128\],
        jurisdiction: "udm://jurisdiction/public\-domain",
        strictness  : HARD                                 \-\- \(6\) Hard enforcement
    \} ;

    DECLARE CONSTRAINT public\_constraint AS CONSTRAINT\_MATRIX \{ \-\- \(7\) Declare constraint
        source  : "udm://module/public\-domain\-v2",
        version : "2\.0\.1",
        digest  : "a3f9c1\.\.\."                              \-\- \(8\) Integrity digest
    \} ;
\}

BEGIN
    INJECT \( public\_constraint, inference\_ctx \) ;          \-\- \(9\) Install constraint matrix

    LET ai\_output = AI\_INFER\("What is the capital of Texas?"\) ; \-\- \(10\) Run AI inference

    LET governed\_out = FUSE \( ai\_output, public\_constraint \) ;  \-\- \(11\) Fuse: core operation

    LET trace = CAPTURE\_TRACE \( governed\_out \) INTO trace\_01 ;  \-\- \(12\) Capture trace

    LET turn = BIND \( agent, trace\_01 \) AS turn\_01 ;            \-\- \(13\) Compose TURN\_TRACE
END

RECEIPT \{
    CAPTURE \( turn\_01 \) AS final\_receipt WITH\_OUTCOME COMPLIANT ; \-\- \(14\) Issue receipt
\}

__Commentary:__ Lines 1–4 declare the program header and identity block\. Line \(9\) installs the UDM constraint matrix into the inference context before inference begins — this is mandatory; calling AI\_INFER before INJECT would be a ConstraintInjectionError\. Line \(11\) is where governance and AI computation fuse: the AI output probability vector is elementwise multiplied by the projected constraint matrix, producing a governed distribution\. Lines \(12–13\) compose the atomic trace unit\. Line \(14\) issues the cryptographically signed governance receipt\.

## 10\.2 Multi\-Identity Fusion with Authority Escalation

This program demonstrates a scenario where a base\-level agent requests escalated authority from a higher\-authority identity to access a restricted constraint zone\.

IGL v1\.0 PROGRAM "multi\_identity\_authority\_escalation" ;

IDENTITY \{
    DECLARE IDENTITY base\_agent AS IDENTITY\_OPERAND \{
        id          : "igl://identity/ops/agent\-base\-007",
        authority   : 0\.3,                              \-\- \(1\) Low authority agent
        boundary    : standard\_boundary,
        propagation : DELEGATE TO "igl://identity/ops/supervisor\-001"
    \} ;

    DECLARE IDENTITY supervisor AS IDENTITY\_OPERAND \{
        id          : "igl://identity/ops/supervisor\-001",
        authority   : 0\.85,                             \-\- \(2\) High authority supervisor
        boundary    : elevated\_boundary,
        exceptions  : \["igl://exception/restricted\-domain\-access"\],
        propagation : INHERIT
    \} ;
\}

CONSTRAINTS \{
    DECLARE BOUNDARY standard\_boundary AS BOUNDARY\_TENSOR \{
        dimensions  : 2, shape : \[256, 64\],
        jurisdiction: "udm://jurisdiction/standard",
        strictness  : HARD
    \} ;

    DECLARE BOUNDARY elevated\_boundary AS BOUNDARY\_TENSOR \{
        dimensions  : 3, shape : \[512, 256, 128\],
        jurisdiction: "udm://jurisdiction/elevated",
        strictness  : HARD
    \} ;

    DECLARE CONSTRAINT standard\_constraint AS CONSTRAINT\_MATRIX \{
        source  : "udm://module/standard\-v3",
        version : "3\.1\.0",
        digest  : "b72d40\.\.\."
    \} ;

    DECLARE CONSTRAINT elevated\_constraint AS CONSTRAINT\_MATRIX \{
        source  : "udm://module/elevated\-v1",
        version : "1\.0\.0",
        digest  : "e19a88\.\.\."
    \} ;
\}

BEGIN
    \-\- Phase 1: Base agent attempts query under standard constraints
    INJECT \( standard\_constraint, inference\_ctx \) ;
    LET base\_output = AI\_INFER\("Retrieve restricted operational data"\) ;

    \-\- Phase 2: Authority check — escalate if base authority is insufficient
    IF\_AUTHORITY \( base\_agent, LT, 0\.5 \)
    THEN \{
        \-\- \(3\) Escalate: delegate to supervisor for this computation
        LET escalated\_id = PROJECT\(
            "igl://identity\-graph/ops",
            "udm://jurisdiction/elevated"
        \) ;
        INJECT \( elevated\_constraint, inference\_ctx \) ;
        LET elevated\_output = FUSE \( base\_output, elevated\_constraint \)
                              UNDER supervisor ;
        LET trace = CAPTURE\_TRACE \( elevated\_output \) INTO trace\_escalated ;
        LET turn  = BIND \( supervisor, trace\_escalated \) AS turn\_escalated ;
    \}
    ELSE \{
        \-\- \(4\) Base authority sufficient — proceed normally
        LET governed\_out = FUSE \( base\_output, standard\_constraint \) ;
        LET trace = CAPTURE\_TRACE \( governed\_out \) INTO trace\_base ;
        LET turn  = BIND \( base\_agent, trace\_base \) AS turn\_escalated ;
    \}
END

RECEIPT \{
    CAPTURE \( turn\_escalated \) AS final\_receipt ;  \-\- \(5\) Receipt reflects actual identity used
\}

__Commentary:__ The IF\_AUTHORITY construct at step \(3\) is the IGL conditional governance mechanism — it branches purely on the resolved authority level, not on application logic\. Step \(3\) demonstrates PROJECT, which scopes the supervisor identity to the elevated jurisdiction\. The GOVERNANCE\_RECEIPT at step \(5\) will reflect the identity\_ref of whichever identity was active when BIND was called — providing a full audit trail of the authority escalation path\.

## 10\.3 Recursive Governed Reasoning Loop

This program demonstrates a governed reasoning loop where the output of each turn becomes the input to the next, with governance constraints re\-applied at every recursive level\.

IGL v1\.0 PROGRAM "recursive\_governed\_reasoning" ;

IDENTITY \{
    DECLARE IDENTITY reasoner AS IDENTITY\_OPERAND \{
        id          : "igl://identity/reasoning/loop\-agent\-001",
        authority   : 0\.6,
        boundary    : reasoning\_boundary,
        propagation : INHERIT              \-\- \(1\) All recursive levels use same identity
    \} ;
\}

CONSTRAINTS \{
    DECLARE BOUNDARY reasoning\_boundary AS BOUNDARY\_TENSOR \{
        dimensions  : 4, shape : \[256, 128, 64, 32\],
        jurisdiction: "udm://jurisdiction/reasoning\-domain",
        strictness  : SOFT                 \-\- \(2\) Soft: violations logged, not halted
    \} ;

    DECLARE CONSTRAINT reasoning\_constraint AS CONSTRAINT\_MATRIX \{
        source  : "udm://module/reasoning\-v2",
        version : "2\.3\.0",
        digest  : "c88f12\.\.\."
    \} ;
\}

BEGIN
    INJECT \( reasoning\_constraint, inference\_ctx \) ;

    \-\- \(3\) Initial inference pass
    LET initial\_output = FUSE \(
        AI\_INFER\("Analyze the governance implications of recursive AI reasoning"\),
        reasoning\_constraint
    \) ;

    \-\- \(4\) Recursive loop: each pass refines the output, max depth 3
    RECURSE \( initial\_output, inference\_ctx \)
        MAX\_DEPTH 3
        CARRYING reasoner
        AS recursive\_chain ;

    \-\- \(5\) Bind the terminal turn from the recursive chain
    LET final\_trace = CAPTURE\_TRACE \( recursive\_chain \) INTO final\_trace\_01 ;
    LET final\_turn  = BIND \( reasoner, final\_trace\_01 \) AS final\_turn\_01 ;
END

RECEIPT \{
    CAPTURE \( final\_turn\_01 \) AS final\_receipt ;
\}

__Commentary:__ Step \(2\) uses SOFT strictness on the reasoning boundary — appropriate for exploratory reasoning where boundary proximity is expected and logged rather than treated as hard failure\. Step \(4\) is the core recursive construct: with MAX\_DEPTH 3, the reasoning will pass through a maximum of 4 total governed inference steps \(1 initial \+ 3 recursive\)\. Each recursive step receives a new GovernedContext from IOS\+ via the CONSTRAINT\_SURFACE decision hook, which may tighten constraints as entropy evolves across recursive steps\. The full parent\-child TURN\_TRACE chain is preserved in the audit log\.

## 10\.4 Cross\-Jurisdiction Boundary Enforcement

This program demonstrates enforcement of multiple jurisdictional constraints simultaneously, representing a cross\-border governed computation scenario\.

IGL v1\.0 PROGRAM "cross\_jurisdiction\_enforcement"
    SESSION "a1b2c3d4\-e5f6\-7890\-abcd\-ef1234567890" ;

IDENTITY \{
    DECLARE IDENTITY global\_agent AS IDENTITY\_OPERAND \{
        id          : "igl://identity/global/cross\-border\-001",
        authority   : 0\.75,
        boundary    : multi\_jurisdiction\_boundary,
        exceptions  : \[
            "igl://exception/eu\-gdpr\-article9\-override",
            "igl://exception/us\-hipaa\-deidentified\-data"
        \],
        propagation : ISOLATE              \-\- \(1\) Recursive calls use session default identity
    \} ;
\}

CONSTRAINTS \{
    \-\- \(2\) EU jurisdiction boundary
    DECLARE BOUNDARY eu\_boundary AS BOUNDARY\_TENSOR \{
        dimensions  : 3, shape : \[512, 256, 128\],
        jurisdiction: "udm://jurisdiction/eu/gdpr",
        temporal    : \["2026\-01\-01T00:00:00Z", "2026\-12\-31T23:59:59Z"\],
        strictness  : HARD
    \} ;

    \-\- \(3\) US jurisdiction boundary
    DECLARE BOUNDARY us\_boundary AS BOUNDARY\_TENSOR \{
        dimensions  : 2, shape : \[512, 128\],
        jurisdiction: "udm://jurisdiction/us/hipaa",
        temporal    : \["2026\-01\-01T00:00:00Z", "2026\-12\-31T23:59:59Z"\],
        strictness  : HARD
    \} ;

    DECLARE BOUNDARY multi\_jurisdiction\_boundary AS BOUNDARY\_TENSOR \{
        dimensions  : 5, shape : \[512, 256, 128, 64, 32\],
        jurisdiction: "udm://jurisdiction/composite/eu\-us",
        strictness  : HARD
    \} ;

    DECLARE CONSTRAINT eu\_constraint AS CONSTRAINT\_MATRIX \{
        source  : "udm://module/gdpr\-v4",
        version : "4\.0\.0",
        digest  : "d91c03\.\.\."
    \} ;

    DECLARE CONSTRAINT us\_constraint AS CONSTRAINT\_MATRIX \{
        source  : "udm://module/hipaa\-v2",
        version : "2\.1\.0",
        digest  : "f44e55\.\.\."
    \} ;
\}

BEGIN
    \-\- \(4\) Apply EU constraints first
    INJECT \( eu\_constraint, inference\_ctx \) ;
    LET eu\_governed = FUSE \(
        AI\_INFER\("Analyze patient treatment outcomes across EU and US facilities"\),
        eu\_constraint
    \) ;

    \-\- \(5\) Verify EU boundary compliance before continuing
    WHEN\_BOUNDARY \( eu\_boundary, eu\_constraint \)
    WITHIN \{
        \-\- \(6\) Apply US constraints to EU\-governed output
        INJECT \( us\_constraint, inference\_ctx \) ;
        LET cross\_governed = FUSE \( eu\_governed, us\_constraint \) ;

        LET trace = CAPTURE\_TRACE \( cross\_governed \) INTO cross\_trace ;
        LET turn  = BIND \( global\_agent, cross\_trace \) AS cross\_turn ;
    \}
    OUTSIDE \{
        \-\- \(7\) EU boundary violated — attempt exception resolution
        UNLESS\_EXCEPTION \(
            "igl://exception/eu\-gdpr\-article9\-override",
            global\_agent
        \) \{
            LET fallback\_output = FUSE \(
                AI\_INFER\("Provide de\-identified population statistics only"\),
                eu\_constraint
            \) ;
            LET trace = CAPTURE\_TRACE \( fallback\_output \) INTO fallback\_trace ;
            LET turn  = BIND \( global\_agent, fallback\_trace \) AS cross\_turn ;
        \}
    \}
END

RECEIPT \{
    CAPTURE \( cross\_turn \) AS final\_receipt ;
\}

__Commentary:__ This program demonstrates the full conditional governance surface of IGL\. Step \(5\) uses WHEN\_BOUNDARY to guard the US constraint injection behind EU boundary compliance verification\. Step \(7\) uses UNLESS\_EXCEPTION to apply a declared exception if the EU boundary is violated — reflecting real\-world GDPR Article 9 research exception logic\. The ISOLATE propagation at step \(1\) ensures that any recursive calls \(not present here but possible in extensions\) would not inherit the global agent's elevated cross\-border authority\.

## 10\.5 Full TurnTrace Capture with Receipt Generation

This program demonstrates the complete end\-to\-end IGL lifecycle including multi\-turn trace accumulation and receipt verification\.

IGL v1\.0 PROGRAM "full\_turntrace\_receipt\_demo" ;

IDENTITY \{
    DECLARE IDENTITY audited\_agent AS IDENTITY\_OPERAND \{
        id          : "igl://identity/audit/agent\-full\-001",
        authority   : 0\.9,
        boundary    : full\_audit\_boundary,
        exceptions  : \[\],                  \-\- \(1\) No exceptions; strict governance
        propagation : INHERIT
    \} ;
\}

CONSTRAINTS \{
    DECLARE BOUNDARY full\_audit\_boundary AS BOUNDARY\_TENSOR \{
        dimensions  : 4, shape : \[1024, 512, 256, 128\],
        jurisdiction: "udm://jurisdiction/full\-audit\-zone",
        temporal    : \["2026\-08\-01T00:00:00Z", "2026\-08\-31T23:59:59Z"\],
        strictness  : HARD
    \} ;

    DECLARE CONSTRAINT audit\_constraint AS CONSTRAINT\_MATRIX \{
        source  : "udm://module/full\-audit\-v1",
        version : "1\.0\.0",
        digest  : "9a3b77\.\.\."
    \} ;
\}

BEGIN
    \-\- TURN 1: Initial governed query
    INJECT \( audit\_constraint, inference\_ctx \) ;
    LET output\_01 = FUSE \(
        AI\_INFER\("Summarize all governed AI interactions for audit period August 2026"\),
        audit\_constraint
    \) ;
    LET trace\_01 = CAPTURE\_TRACE \( output\_01 \) INTO cognitive\_trace\_01 ;
    LET turn\_01  = BIND \( audited\_agent, cognitive\_trace\_01 \) AS turn\_record\_01 ;

    \-\- TURN 2: Follow\-up governed query building on turn 1 output
    LET output\_02 = FUSE \(
        AI\_INFER\("Identify anomalous authority escalations in the audit period"\),
        audit\_constraint
    \) ;
    LET trace\_02 = CAPTURE\_TRACE \( output\_02 \) INTO cognitive\_trace\_02 ;
    LET turn\_02  = BIND \( audited\_agent, cognitive\_trace\_02 \) AS turn\_record\_02 ;

    \-\- TURN 3: Verification pass — verify that turn\_01 receipt is valid
    \-\- \(2\) Verification of a prior receipt within the same session
    LET prior\_receipt = CAPTURE \( turn\_record\_01 \) AS interim\_receipt ;
    LET is\_valid      = VERIFY \( interim\_receipt, audited\_agent \) ;

    IF\_AUTHORITY \( audited\_agent, GTE, 0\.8 \)
    THEN \{
        \-\- \(3\) High authority agent proceeds to final summary turn
        LET output\_03 = FUSE \(
            AI\_INFER\("Generate final audit summary report"\),
            audit\_constraint
        \) ;
        LET trace\_03 = CAPTURE\_TRACE \( output\_03 \) INTO cognitive\_trace\_03 ;
        LET final\_turn = BIND \( audited\_agent, cognitive\_trace\_03 \) AS turn\_record\_final ;
    \}
    ELSE \{
        LET final\_turn = turn\_record\_02 ;      \-\- \(4\) Fall back to turn 2 as terminal
    \}
END

RECEIPT \{
    \-\- \(5\) Terminal receipt — signed by IOS\+, covers full session
    CAPTURE \( turn\_record\_final \) AS session\_receipt WITH\_OUTCOME COMPLIANT ;
\}

__Commentary:__ This program demonstrates the complete multi\-turn IGL lifecycle\. Step \(2\) shows an in\-session VERIFY call — a program verifying its own intermediate receipts as a self\-audit mechanism\. Note that interim\_receipt is an intermediate GOVERNANCE\_RECEIPT produced mid\-program; IGL permits multiple receipts within a program's body block, but requires exactly one CAPTURE in the receipt\_block as the terminal program receipt\. Step \(3\) shows the IF\_AUTHORITY pattern used for authoritative branching\. The temporal constraint in full\_audit\_boundary will reject this program if executed outside August 2026 — appropriate for a time\-bounded audit zone\.

# 11\. Error Model

## 11\.1 Error Taxonomy

IGL defines five error classes\. All errors are fatal unless explicitly designated as recoverable\. Errors propagate upward through the call stack until they reach the IGL program boundary, at which point they are reported to the IOS\+ Orchestration Engine along with the partial COGNITIVE\_TRACE accumulated before the error\.

__Error Class__

__Fatal?__

__Description and Trigger Conditions__

IdentityResolutionError

Yes

Raised when the IDENTITY\_OPERAND's id field cannot be resolved against the Identity Graph, when a delegation edge is missing, when a jurisdiction projection yields an empty result, or when an identity's authority field falls outside \[0\.0, 1\.0\]\. Error codes: IDENTITY\_NOT\_FOUND, INVALID\_URI\_SCHEME, DELEGATION\_NOT\_AUTHORIZED, NO\_JURISDICTION\_SCOPE, AUTHORITY\_OUT\_OF\_RANGE\.

BoundaryViolationError

Conditional

Raised when a FUSE or CONSTRAIN operation produces output that violates a BOUNDARY\_TENSOR with HARD strictness and no applicable exception is present\. Not raised for SOFT strictness violations\. Error codes: HARD\_BOUNDARY\_EXCEEDED, TEMPORAL\_BOUNDARY\_EXCEEDED, NO\_ADMISSIBLE\_PATHS\.

ConstraintInjectionError

Yes

Raised when a CONSTRAINT\_MATRIX cannot be injected into an inference context\. Causes include: digest mismatch between declared and actual cell values, UDM module not found at the declared source URI, version mismatch, or IOS\+ timeout during matrix provision\. Error codes: DIGEST\_MISMATCH, UDM\_MODULE\_NOT\_FOUND, VERSION\_CONFLICT, IOS\_TIMEOUT\.

FusionTypeError

Yes

Raised when the FUSE operator's operands have incompatible types or dimensions\. This is primarily a type\-system enforcement error: the compile\-time type checker should prevent most FusionTypeErrors, but dimension mismatches between the AI vector and the projected constraint matrix may only be detectable at runtime if the vocabulary size is not statically known\. Error codes: DIMENSION\_MISMATCH, TYPE\_INCOMPATIBILITY, PROJECTION\_FAILURE\.

TraceCaptureFault

Yes

Raised when the COGNITIVE\_TRACE system fails to capture or seal a trace correctly\. This includes: write to a sealed trace \(integrity violation\), failure to obtain an acknowledgment UUID from IOS\+\.logTrace, sequence number gap detection, or program termination without a CAPTURE in the receipt block\. Error codes: TRACE\_INTEGRITY\_VIOLATION, LOG\_WRITE\_FAILURE, SEQUENCE\_GAP, MISSING\_RECEIPT\_CAPTURE\.

## 11\.2 Error Propagation Rules

Error propagation in IGL follows these rules, in priority order:

1. __Compile\-time errors__ \(type errors, grammar errors, MAX\_DEPTH = 0, missing structural blocks\) are reported before any runtime execution begins and produce no COGNITIVE\_TRACE and no GOVERNANCE\_RECEIPT\.
2. __Fatal runtime errors__ halt execution at the point of the error\. The IGL runtime seals the partial COGNITIVE\_TRACE at that point \(with the error event appended to the boundary\_checks log as a special error entry\), and writes the partial trace to the IOS\+ audit log\. No GOVERNANCE\_RECEIPT is issued for programs that halt with a fatal error\. IOS\+ records the error and the partial trace under the session UUID for audit purposes\.
3. __Errors in recursive calls__ propagate to the calling level\. If a RECURSE call raises a fatal error, the error propagates to the parent call level\. If the parent has an applicable exception for the error type, the exception is applied and execution continues at the parent level\. If no exception applies, the error propagates to the program boundary\.
4. __BoundaryViolationError with SOFT strictness__ does not halt execution and is not propagated as a runtime error\. Instead, it is logged to the COGNITIVE\_TRACE and results in a GOVERNANCE\_RECEIPT with outcome = VIOLATION\.

## 11\.3 Recovery Semantics

IGL v1\.0 does not provide a general\-purpose try\-catch or exception\-handling construct\. Recovery from errors is a governance decision, not an application decision, and is therefore handled by the IGL conditional governance constructs \(IF\_AUTHORITY, WHEN\_BOUNDARY, UNLESS\_EXCEPTION\) and by the IDENTITY\_OPERAND's declared exceptions list\. The design rationale is:

__DESIGN RATIONALE — IGL\-DR\-003__

A general try\-catch construct in IGL would allow programs to silently handle governance failures, potentially masking boundary violations and identity resolution failures from the audit trail\. IGL's philosophy is that governance failures must be visible: they either halt the program \(fatal\), or they are explicitly recorded in the COGNITIVE\_TRACE and reflected in the GOVERNANCE\_RECEIPT outcome field \(SOFT violations, EXCEPTION\_APPLIED\)\. No governance event in an IGL program is ever silently discarded\.

The available recovery mechanisms are:

- __Exception declarations__ in IDENTITY\_OPERAND allow pre\-authorized boundary overrides\. These must be declared before the program runs; they cannot be added dynamically during execution\.
- __UNLESS\_EXCEPTION blocks__ provide alternative execution paths that are activated only when a declared exception matches the current governance condition\.
- __SOFT strictness boundaries__ allow boundary\-proximate computation to continue under logging, rather than requiring pre\-authorization of specific exceptions\.
- __Authority escalation via IF\_AUTHORITY__ allows programs to route computations through higher\-authority identities when the base identity's authority is insufficient\.

# 12\. Version History & Roadmap

## 12\.1 v1\.0 Scope and Known Limitations

IGL v1\.0, published 07 August 2026, constitutes the initial complete release of the Identity Governance Language\. The following table documents the known limitations of the v1\.0 specification and identifies the planned version in which each limitation will be addressed\.

__Known Limitation__

__Severity__

__Workaround Available?__

__Target Version__

Single\-node execution only; no distributed multi\-node IGL programs

Medium

Partial: multiple single\-node programs with shared session UUID

v1\.1

Maximum recursion depth is static \(declared at compile time\); no dynamic depth adjustment based on runtime entropy

Low

Yes: conservative MAX\_DEPTH declaration

v1\.1

No IGL\-native inter\-program messaging; programs cannot pass GOVERNANCE\_RECEIPTs to other programs as inputs

Medium

No: requires external orchestration layer

v1\.2

CONSTRAINT\_MATRIX dimensions must be statically known at compile time; dynamic matrix shapes are not supported

Medium

Partial: declare maximum\-size matrix and use zero\-padding

v1\.1

No native support for streaming token\-by\-token output; FUSE operates on the full probability distribution per turn

High

No: streaming requires IGL v1\.1 STREAM\_FUSE operator

v1\.1

Identity Graph is read\-only from IGL programs; programs cannot create or modify identity nodes

Low

Yes: Identity Graph modifications via IOS\+ administrative API

v2\.0

Type inference is single\-pass; mutually recursive type definitions within a single program are not supported

Low

Yes: restructure program to avoid mutual recursion at type level

v1\.2

No native float quantization support for BOUNDARY\_TENSOR values; full precision \(FP64\) required

Low

No direct workaround; increases memory footprint for large tensors

v1\.1

## 12\.2 Planned v1\.1 Features

IGL v1\.1 is targeted for release in Q1 2027\. The following features are planned for inclusion, in priority order:

1. __STREAM\_FUSE Operator:__ A streaming variant of the FUSE operator that applies constraint matrix projection token\-by\-token during generation, enabling real\-time governed streaming output without buffering the full probability distribution per turn\.
2. __Dynamic CONSTRAINT\_MATRIX Shapes:__ Support for runtime\-determined matrix dimensions via the DYNAMIC keyword in CONSTRAINT\_MATRIX declarations, allowing IOS\+ to provide appropriately sized matrices without compile\-time dimension declarations\.
3. __Dynamic MAX\_DEPTH:__ A MAX\_DEPTH AUTO option for RECURSE that allows IOS\+ to determine the maximum recursion depth based on the current session entropy trajectory, preventing runaway recursion in high\-entropy reasoning scenarios\.
4. __Quantized Tensor Support:__ FP16 and INT8 quantization options for BOUNDARY\_TENSOR and CONSTRAINT\_MATRIX values, reducing memory footprint and improving performance on inference hardware with quantization support\.
5. __Distributed Execution Primitives:__ Initial primitives for distributing an IGL program across multiple IGL runtime nodes, with IOS\+ coordinating cross\-node identity resolution and constraint injection\.
6. __GOVERNANCE\_RECEIPT Chaining:__ A mechanism for passing a prior session's GOVERNANCE\_RECEIPT as input to a new IGL program, enabling governed computation chains across session boundaries with full audit trail continuity\.

## 12\.3 Compatibility Guarantees

The following compatibility guarantees are normative for IGL v1\.x:

__Guarantee__

__Specification__

__Forward Compatibility \(v1\.0 → v1\.x\)__

All IGL v1\.0 programs are guaranteed to execute correctly and produce semantically equivalent results on any IGL v1\.x runtime \(x >= 0\)\. MINOR version increments add features without modifying existing grammar, operator semantics, or type rules\.

__Backward Compatibility \(v1\.x → v1\.0\)__

IGL programs written to use v1\.x features \(x > 0\) that are not present in v1\.0 will be rejected by the v1\.0 runtime at parse time\. The runtime will report the minimum required IGL version in the error message\.

__Receipt Verifiability__

GOVERNANCE\_RECEIPTs issued under IGL v1\.0 must remain verifiable by any IGL v1\.x VERIFY operator\. The receipt schema is frozen for the v1\.x series; new fields, if added in v1\.x, must be optional and must not invalidate v1\.0 receipt signatures\.

__UDM Version Compatibility__

IGL v1\.0 requires UDM v2\.0 or later for full ontology URI support\. IGL v1\.0 will operate in degraded mode against UDM v1\.x, substituting numeric jurisdiction IDs for URI references\. All other IGL v1\.0 features are available in degraded mode\.

__IOS\+ Interface Stability__

The six IOS\+ service interfaces defined in Section 9\.4 are frozen for the IGL v1\.x series\. IOS\+ implementations upgrading to support IGL v1\.1\+ features must extend these interfaces without breaking existing callers\. Interface versioning is handled at the IOS\+ service level, not at the IGL program level\.

__Type System Stability__

The six named types and their subtype hierarchy are frozen for the v1\.x series\. New types, if introduced in v1\.x, are added as leaves to the existing hierarchy and do not alter the compatibility matrix in Section 5\.4 for existing type pairs\.

__IGL v1\.0 Specification — Identity Governance Language__  
 Document Number: IGL\-SPEC\-2026\-001  |  Version: 1\.0 Final  |  Published: 07 August 2026  
 Author: Chris, Houston, TX  |  Classification: Engineering Specification  
 © 2026 IGL Working Group\. All rights reserved\. This specification may be reproduced for conformance implementation purposes\.
