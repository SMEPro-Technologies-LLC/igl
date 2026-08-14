__IDENTITY GOVERNANCE LANGUAGE__

__SPECIFICATION AND GOVERNING TECHNICAL INSTRUMENT__

Version 1\.0

Instrument No\. IGL\-SPEC\-2026\-001

Adopted as of 7 August 2026

IGL Working Group — Houston, Texas

*This instrument restates and supersedes the draft engineering specification of even number and date\. Deviations from this instrument by an implementing team require an approved Architecture Decision Record under Section 12\.04\.*

__TABLE OF CONTENTS__

[__RECITALS__	1](#_Toc237027975)

[__ARTICLE I — DEFINITIONS AND INTERPRETATION__	1](#_Toc237027976)

[__Section 1\.01\.  Definitions\.__	1](#_Toc237027977)

[__Section 1\.02\.  Interpretation\.__	1](#_Toc237027978)

[__ARTICLE II — PURPOSE, SCOPE AND CONFORMANCE__	1](#_Toc237027979)

[__Section 2\.01\.  Purpose\.__	1](#_Toc237027980)

[__Section 2\.02\.  Design Commitments\.__	1](#_Toc237027981)

[__Section 2\.03\.  Scope; Exclusions\.__	1](#_Toc237027982)

[__Section 2\.04\.  Conformance\.__	1](#_Toc237027983)

[__ARTICLE III — FOUNDATIONAL PRIMITIVES__	1](#_Toc237027984)

[__Section 3\.01\.  IDENTITY\_OPERAND\.__	1](#_Toc237027985)

[__Section 3\.02\.  BOUNDARY\_TENSOR\.__	1](#_Toc237027986)

[__Section 3\.03\.  CONSTRAINT\_MATRIX\.__	1](#_Toc237027987)

[__Section 3\.04\.  COGNITIVE\_TRACE\.__	1](#_Toc237027988)

[__Section 3\.05\.  GOVERNANCE\_RECEIPT\.__	1](#_Toc237027989)

[__Section 3\.06\.  TURN\_TRACE\.__	1](#_Toc237027990)

[__ARTICLE IV — PROGRAM STRUCTURE AND SYNTAX__	1](#_Toc237027991)

[__Section 4\.01\.  Required Structure\.__	1](#_Toc237027992)

[__Section 4\.02\.  Conditional Governance Constructs\.__	1](#_Toc237027993)

[__Section 4\.03\.  Recursion\.__	1](#_Toc237027994)

[__ARTICLE V — OPERATORS__	1](#_Toc237027995)

[__Section 5\.01\.  FUSE\.__	1](#_Toc237027996)

[__Section 5\.02\.  CONSTRAIN\.__	1](#_Toc237027997)

[__Section 5\.03\.  BIND\.__	1](#_Toc237027998)

[__Section 5\.04\.  VERIFY\.__	1](#_Toc237027999)

[__Section 5\.05\.  PROJECT\.__	1](#_Toc237028000)

[__Section 5\.06\.  INJECT\.__	1](#_Toc237028001)

[__Section 5\.07\.  CAPTURE\.__	1](#_Toc237028002)

[__Section 5\.08\.  RECURSE\.__	1](#_Toc237028003)

[__ARTICLE VI — TYPE SYSTEM__	1](#_Toc237028004)

[__Section 6\.01\.  Static Typing\.__	1](#_Toc237028005)

[__Section 6\.02\.  Hierarchy, Compatibility and Coercion\.__	1](#_Toc237028006)

[__ARTICLE VII — EXECUTION SEMANTICS__	1](#_Toc237028007)

[__Section 7\.01\.  Reduction\.__	1](#_Toc237028008)

[__Section 7\.02\.  Identity Resolution Procedure\.__	1](#_Toc237028009)

[__Section 7\.03\.  Boundary Enforcement\.__	1](#_Toc237028010)

[__Section 7\.04\.  Trace Lifecycle\.__	1](#_Toc237028011)

[__ARTICLE VIII — THE IDENTITY GRAPH__	1](#_Toc237028012)

[__Section 8\.01\.  Structure\.__	1](#_Toc237028013)

[__Section 8\.02\.  Authority Resolution\.__	1](#_Toc237028014)

[__Section 8\.03\.  Exceptions\.__	1](#_Toc237028015)

[__Section 8\.04\.  Propagation\.__	1](#_Toc237028016)

[__ARTICLE IX — UDM INTEGRATION__	1](#_Toc237028017)

[__Section 9\.01\.  Jurisdiction Mapping\.__	1](#_Toc237028018)

[__Section 9\.02\.  Crosswalk Tensors; Temporal Bounds\.__	1](#_Toc237028019)

[__Section 9\.03\.  Injection Points; Version Requirements\.__	1](#_Toc237028020)

[__ARTICLE X — ORCHESTRATION BY IOS\+__	1](#_Toc237028021)

[__Section 10\.01\.  Hosted Execution\.__	1](#_Toc237028022)

[__Section 10\.02\.  Decision Surfaces\.__	1](#_Toc237028023)

[__Section 10\.03\.  Relationship of Program to Orchestrator\.__	1](#_Toc237028024)

[__Section 10\.04\.  Service Interface\.__	1](#_Toc237028025)

[__ARTICLE XI — ERRORS, VIOLATIONS AND REMEDIES__	1](#_Toc237028026)

[__Section 11\.01\.  Error Classes\.__	1](#_Toc237028027)

[__Section 11\.02\.  Propagation\.__	1](#_Toc237028028)

[__Section 11\.03\.  No General Exception Handling\.__	1](#_Toc237028029)

[__ARTICLE XII — VERSIONING, COMPATIBILITY AND AMENDMENT__	1](#_Toc237028030)

[__Section 12\.01\.  Version Numbering\.__	1](#_Toc237028031)

[__Section 12\.02\.  Known Limitations of v1\.0\.__	1](#_Toc237028032)

[__Section 12\.03\.  Matters Reserved for Engineering Decision\.__	1](#_Toc237028033)

[__Section 12\.04\.  Amendment\.__	1](#_Toc237028034)

[__ARTICLE XIII — GENERAL PROVISIONS__	1](#_Toc237028035)

[__Section 13\.01\.  Order of Precedence\.__	1](#_Toc237028036)

[__Section 13\.02\.  Severability\.__	1](#_Toc237028037)

[__Section 13\.03\.  Referenced Standards\.__	1](#_Toc237028038)

[__Section 13\.04\.  Entire Specification; Effective Date\.__	1](#_Toc237028039)

[__ADOPTION__	1](#_Toc237028040)

[__SCHEDULE A — GRAMMAR \(EBNF\)__	1](#_Toc237028041)

[__SCHEDULE B — TYPE HIERARCHY, TYPING RULES AND REDUCTION RULES__	1](#_Toc237028042)

[__SCHEDULE C — SAMPLE PROGRAMS__	1](#_Toc237028043)

[__SCHEDULE D — ERROR CODE CATALOGUE__	1](#_Toc237028044)

# <a id="_Toc237027975"></a>__RECITALS__

This Specification and Governing Technical Instrument \(this __"Specification"__\) is adopted by the IGL Working Group \(the __"Working Group"__\) as of 7 August 2026 \(the __"Effective Date"__\), with reference to the following facts:

__WHEREAS, __a large language model produces its output by sampling from a probability distribution computed over a token vocabulary at each generation step, and that computation is continuous and numerical in character;

__WHEREAS, __governance obligations — jurisdictional boundaries, authority hierarchies, reporting windows, and the like — are categorical: a given reasoning path either satisfies an obligation or it does not, and the Universal Decoding Matrix \("UDM"\) expresses such obligations as deterministic constraint structures;

__WHEREAS, __the languages commonly proposed for governing model output each operate in only one of these two spaces — query and logic languages in the symbolic space, tensor frameworks in the numerical space — and none provides a mechanism for binding a resolved identity to a constrained generation computation and proving, after the fact, that the constraint was applied;

__WHEREAS, __filtering model output after generation permits non\-compliant content to be produced before it is discarded, leaves no verifiable record of what was suppressed or why, and is for those reasons inadequate as a primary enforcement mechanism; and

__WHEREAS, __the Working Group has determined that these deficiencies are best addressed by a purpose\-built language in which governance constraints participate in the generation computation itself;

__NOW, THEREFORE, __the Working Group adopts this Specification as the authoritative statement of the Identity Governance Language, Version 1\.0\.

# <a id="_Toc237027976"></a>__ARTICLE I — DEFINITIONS AND INTERPRETATION__

## <a id="_Toc237027977"></a>__Section 1\.01\.  Definitions\.__

As used in this Specification, the following terms have the meanings set forth below\. Terms defined in the singular include the plural and vice versa\.

__"Approved Signature Algorithm"__ means Ed25519 or ECDSA over curve P\-256, as designated for a given deployment by the operator of IOS\+\. A deployment shall designate exactly one Approved Signature Algorithm and shall publish the corresponding public key to its key directory\.

__"Authority Level"__ means a scalar value in the closed interval \[0\.0, 1\.0\] expressing the authority of an identity, where 1\.0 is maximum authority\. Values outside that interval are invalid and shall be rejected at parse time\.

__"Boundary Tensor"__ means the numerical representation of the jurisdictional, contextual, and temporal limits within which a governed computation must remain, as further specified in Section 3\.02\. Each value in a Boundary Tensor states the maximum probability mass that may be allocated to the corresponding reasoning dimension; 0\.0 marks a forbidden region and 1\.0 an unrestricted one\.

__"Cognitive Trace"__ means the per\-turn record of reasoning activity captured from the model engine, as further specified in Section 3\.04, including attention weights, activated reasoning paths, boundary check outcomes, token count, and output entropy\.

__"Conformant Runtime"__ means an execution environment that implements this Specification in full, subject to the degraded\-mode allowance of Section 9\.03\(c\)\.

__"Constraint Matrix"__ means the UDM\-derived rule structure injected into an inference context, as further specified in Section 3\.03: a matrix mapping reasoning path identifiers to constraint categories, each cell carrying a weight from 0\.0 \(prohibited\) to 1\.0 \(permitted\)\.

__"Governance Receipt"__ means the signed proof\-of\-computation record specified in Section 3\.05, binding an Identity Operand, a Constraint Matrix digest, and a Cognitive Trace reference for a completed governed computation\.

__"Governed Context"__ means an inference context into which a Constraint Matrix has been installed by the INJECT operator\. A Governed Context is produced only by INJECT and its matrix cannot be replaced during the life of that context\.

__"Governed Output"__ means a token distribution, or output derived from one, produced by the FUSE operator and therefore bounded by an injected Constraint Matrix\.

__"Identity Graph"__ means the directed, labeled property graph of identities, authorities, boundaries, and exceptions maintained by IOS\+ and described in Article VIII\. The Identity Graph is read\-only from the perspective of an executing Program\.

__"Identity Operand"__ means the first\-class value representing who or what is acting in a governed computation, as further specified in Section 3\.01\.

__"IOS\+"__ means the Identity Orchestration System Plus, the orchestration engine that hosts execution of Programs and provides identity resolution, constraint provision, receipt signing, and audit services, as described in Article X\.

__"Program"__ means a text conforming to the grammar in Schedule A, comprising a header, an identity block, a constraint block, a body block, and a receipt block\.

__"Session"__ means a single hosted execution of a Program by IOS\+, identified by a session UUID assigned at initialization\.

__"Turn Trace"__ means the composite record binding an Identity Operand, the active Constraint Matrix, a Cognitive Trace, and the Governed Output of a turn into one indivisible unit, as further specified in Section 3\.06\.

__"UDM"__ means the Universal Decoding Matrix, the deterministic governance framework whose jurisdiction matrices and ontology graph this Specification integrates under Article IX\.

## <a id="_Toc237027978"></a>__Section 1\.02\.  Interpretation\.__

\(a\)  Headings are for convenience only and do not affect construction\. \(b\)  "Shall" and "must" state mandatory requirements; "should" states a recommendation; "may" states a permission\. \(c\)  "Including" means including without limitation\. \(d\)  References to Articles, Sections, and Schedules are to this Specification unless stated otherwise\. \(e\)  The Schedules are incorporated into and form part of this Specification; in the event of conflict between the body and a Schedule on a matter of syntax, Schedule A controls, and on any other matter, the body controls\. \(f\)  Code identifiers \(FUSE, IDENTITY\_OPERAND, and similar\) retain their literal spelling wherever they appear and are not altered by the capitalization conventions of legal drafting\.

# <a id="_Toc237027979"></a>__ARTICLE II — PURPOSE, SCOPE AND CONFORMANCE__

## <a id="_Toc237027980"></a>__Section 2\.01\.  Purpose\.__

The Identity Governance Language \("IGL"\) exists to close a specific gap\. Model inference and governance rules live in different computational spaces, and every current integration technique couples them either before inference \(input guardrails, which act without knowledge of the reasoning they would prevent\) or after it \(output filters, which act too late to prevent anything and can only discard\)\. IGL couples them during inference: an IGL expression takes a model probability vector and a UDM constraint structure as operands of equal standing and produces output whose every token was drawn from a distribution already shaped by the constraint\. The language also requires that each such computation be attributable — bound to a resolved identity — and provable, by way of a signed Governance Receipt\.

Nothing in this Specification limits the use of input screening or output review as supplementary measures\. They are inadequate as the primary mechanism, for the reasons stated in the Recitals, and a Conformant Runtime shall not rely on them as such\.

## <a id="_Toc237027981"></a>__Section 2\.02\.  Design Commitments\.__

\(a\)  Identity precedes computation\. No operator that produces output may be evaluated in a context whose Identity Operand is unresolved\. An expression that cannot resolve its Identity Operand is in error, not partially valid\.

\(b\)  Every Program that produces output shall produce a Governance Receipt\. A Program that terminates without one has committed a TraceCaptureFault \(Article XI\)\. Experience with post\-hoc audit regimes shows that optional receipts decay into absent receipts; the obligation is therefore structural and enforced at program exit\.

## <a id="_Toc237027982"></a>__Section 2\.03\.  Scope; Exclusions\.__

This Specification governs the grammar \(Schedule A\), the six foundational primitives \(Article III\), the eight operators \(Article V\), the type system \(Article VI and Schedule B\), execution semantics \(Article VII and Schedule B\), Identity Graph integration \(Article VIII\), UDM integration \(Article IX\), the IOS\+ interface \(Article X\), and the error model \(Article XI and Schedule D\)\. It does not govern distributed multi\-node execution, compilation to native code, hot\-reload semantics, or inter\-program message passing, each of which is reserved to a future version as set out in Section 12\.02\.

## <a id="_Toc237027983"></a>__Section 2\.04\.  Conformance\.__

A runtime claiming conformance with IGL v1\.0 shall implement every mandatory provision of this Specification\. Partial implementations shall not be described as conformant\. A runtime operating against UDM v1\.x may claim conformance in degraded mode only as permitted by Section 9\.03\(c\)\.

# <a id="_Toc237027984"></a>__ARTICLE III — FOUNDATIONAL PRIMITIVES__

IGL defines six primitives\. Each is a first\-class value; none may be subclassed or redefined by a user Program\. This Article states the required fields and operative semantics of each; declaration syntax appears in Schedule A\.

## <a id="_Toc237027985"></a>__Section 3\.01\.  IDENTITY\_OPERAND\.__

The Identity Operand records who is acting\. Its fields are:

__Field__

__Type__

__Required__

__Content__

id

IdentityRef

Yes

URI\-format reference into the Identity Graph namespace \(igl://identity/\.\.\.\)\.

authority

Float \[0,1\]

Yes

The Authority Level\.

boundary

BoundaryRef

Yes

Reference to a declared Boundary Tensor\.

exceptions

ExceptionList

No

Ordered list of declared exception handles; absence is equivalent to an empty list\.

propagation

PropagationRule

Yes

INHERIT, ISOLATE, or DELEGATE TO a named identity \(Section 8\.04\)\.

Upon encountering an Identity Operand declaration, the runtime shall resolve the id field against the Identity Graph before evaluating any other field\. Failed resolution raises IdentityResolutionError and halts the Program\.

## <a id="_Toc237027986"></a>__Section 3\.02\.  BOUNDARY\_TENSOR\.__

The Boundary Tensor carries dimensions, a shape vector, flat\-packed float values in row\-major order, a UDM jurisdiction reference, an optional temporal validity window, and a strictness mode of HARD or SOFT\. After each FUSE evaluation the runtime shall project the governed output through the applicable Boundary Tensor\. A HARD violation halts the computation with BoundaryViolationError, subject to the exception procedure of Section 8\.03; a SOFT violation is logged to the Cognitive Trace and execution continues\.

__*Drafting note \(v1\.0 adoption\): *__*The prior draft defined a values field for this primitive but provided no grammar production through which a Program could declare one\. Schedule A now includes the optional values clause\. Where values are omitted, the tensor is populated by IOS\+ from the referenced UDM jurisdiction\.*

## <a id="_Toc237027987"></a>__Section 3\.03\.  CONSTRAINT\_MATRIX\.__

The Constraint Matrix is constructed by IOS\+ at Program initialization from the applicable UDM jurisdiction matrix \(Section 9\.01\) and is installed by the INJECT operator\. It carries its source module reference, version, cell values, and an integrity digest computed as SHA\-256 over the cell values\. The runtime shall verify the digest before injection; a mismatch raises ConstraintInjectionError with code DIGEST\_MISMATCH\. The matrix version is recorded in the Governance Receipt so that the governing rule version is auditable\.

## <a id="_Toc237027988"></a>__Section 3\.04\.  COGNITIVE\_TRACE\.__

The Cognitive Trace is written at the completion of each generation turn and sealed under Section 7\.04\. Once sealed it is immutable; a write to a sealed trace raises TraceCaptureFault with code TRACE\_INTEGRITY\_VIOLATION\. The entropy field records the Shannon entropy of the output distribution\. IOS\+ may treat elevated entropy as grounds to tighten constraints in later turns \(Section 10\.02\); nothing in this Section obliges it to\.

## <a id="_Toc237027989"></a>__Section 3\.05\.  GOVERNANCE\_RECEIPT\.__

The Governance Receipt binds, at minimum: a receipt UUID; the bound identity reference; the Constraint Matrix digest; the Cognitive Trace reference; the time of issuance; the program hash; the Identity Graph version in effect for the Session; an outcome of COMPLIANT, VIOLATION, or EXCEPTION\_APPLIED; and a signature over all preceding fields produced by IOS\+ under the Approved Signature Algorithm\. For clarity: the program hash is SHA\-256 over the compiled Program bytecode, and nothing else; the Identity Graph version is carried as its own field\.

__*Drafting note \(v1\.0 adoption\): *__*The prior draft defined program\_hash in two incompatible ways — once as the hash of the Program, and once as a derivation that also absorbed the Identity Graph version\. This Section separates the two values\. Receipts serialized under the prior draft cannot be migrated and remain verifiable only under the draft schema\.*

## <a id="_Toc237027990"></a>__Section 3\.06\.  TURN\_TRACE\.__

The Turn Trace is the atomic unit of governed interaction, composed by the BIND operator from the resolved Identity Operand, the active Constraint Matrix, the sealed Cognitive Trace, and the Governed Output\. Its sequence number is assigned by the runtime and increases monotonically within a Session; a gap in sequence numbers indicates a missing turn and shall be flagged by IOS\+\. In recursive Programs the parent\_id field links each Turn Trace to its parent, forming a chain from which the full reasoning lineage can be reconstructed\.

# <a id="_Toc237027991"></a>__ARTICLE IV — PROGRAM STRUCTURE AND SYNTAX__

## <a id="_Toc237027992"></a>__Section 4\.01\.  Required Structure\.__

Every Program shall contain exactly one identity block, one constraint block, one body block, and one receipt block, in that order, following the program header\. A Program missing any of the four is syntactically invalid and shall be rejected by the parser before any evaluation, including identity resolution, begins\. The complete grammar is set out in Schedule A\.

## <a id="_Toc237027993"></a>__Section 4\.02\.  Conditional Governance Constructs\.__

IGL provides three conditionals, none of which is a general\-purpose branch: IF\_AUTHORITY branches on the resolved Authority Level of an identity; WHEN\_BOUNDARY branches on boundary satisfaction, with WITHIN and OUTSIDE arms; and UNLESS\_EXCEPTION branches on whether a declared exception applies to the current expression\. The restriction is deliberate\. A general conditional would let application logic masquerade as governance logic, and the audit value of a trace depends on the two being distinguishable\.

## <a id="_Toc237027994"></a>__Section 4\.03\.  Recursion\.__

A Program may invoke itself through the RECURSE operator \(Section 5\.08\)\. Every recursive construct shall declare a maximum depth; unbounded recursion is a compile\-time error, as is a declared maximum depth of zero\.

# <a id="_Toc237027995"></a>__ARTICLE V — OPERATORS__

IGL defines eight operators\. They are referentially transparent as to their return type but are not pure: trace writes and receipt generation are observable side effects, and are the point of the language\. Error conditions referenced below are catalogued in Schedule D\.

## <a id="_Toc237027996"></a>__Section 5\.01\.  FUSE\.__

FUSE\(v, M\) computes normalize\(v ⊙ M\_projection\), where v is the model probability vector over vocabulary V, M\_projection is the projection of the Constraint Matrix onto V, ⊙ is the elementwise product, and normalize rescales the result to a valid distribution\. The optional UNDER clause asserts that fusion occurs within the authority scope of a named identity; if the executing context's resolved authority is lower, BoundaryViolationError is raised before FUSE executes\. FUSE records the operand pair and resulting output in the active Cognitive Trace and updates its entropy field\.

The guarantee FUSE makes is support restriction: any token whose projected constraint value is 0\.0 receives exactly zero probability in the output, and the output always sums to one\. FUSE does not guarantee that a token's renormalized probability stays at or below a fractional constraint cap — renormalization can raise it\. Where an absolute per\-token ceiling matters, the Boundary Tensor check that follows every FUSE \(Section 3\.02\) is the enforcement mechanism, and HARD strictness should be used\.

__*Drafting note \(v1\.0 adoption\): *__*The prior draft asserted an elementwise "compliance condition" on the renormalized output that fails on a two\-token example and could not be satisfied together with the normalization requirement\. The guarantee is restated above in the form the mathematics supports\.*

## <a id="_Toc237027997"></a>__Section 5\.02\.  CONSTRAIN\.__

CONSTRAIN\(paths, B\) filters a candidate set of reasoning paths against a Boundary Tensor\. A path is excluded if any of its coordinates falls in a region where B carries 0\.0\. Coordinates with intermediate values are not exclusionary at this stage; their values act as penalty weights applied to the path score, consistent with the mass\-ceiling semantics of Section 3\.02\. If the surviving set is empty, BoundaryViolationError is raised with code NO\_ADMISSIBLE\_PATHS\. Every rejected path, and the coordinate that rejected it, is written to the boundary check log of the active Cognitive Trace\.

## <a id="_Toc237027998"></a>__Section 5\.03\.  BIND\.__

BIND\(identity, trace\) composes the Turn Trace described in Section 3\.06 and assigns the next Session sequence number atomically\. BIND either succeeds completely or raises TraceCaptureFault leaving no partial record\.

## <a id="_Toc237027999"></a>__Section 5\.04\.  VERIFY\.__

VERIFY\(receipt, identity\) returns TRUE only if the signature verifies under the deployment's Approved Signature Algorithm and public key, the receipt's identity reference matches the supplied operand, and the constraint digest matches a matrix version known to the current Session\. VERIFY never raises; on failure it returns FALSE and writes the reason to the audit log\. This is intentional — verification is a query about the world, not an assertion about it, and a failed query is information rather than an error\.

## <a id="_Toc237028000"></a>__Section 5\.05\.  PROJECT\.__

PROJECT\(graph, jurisdiction\) returns the maximal subgraph of an identity valid within the named jurisdiction, usable thereafter as an Identity Operand\. An empty result raises IdentityResolutionError with code NO\_JURISDICTION\_SCOPE\.

## <a id="_Toc237028001"></a>__Section 5\.06\.  INJECT\.__

INJECT\(matrix, context\) verifies the matrix digest and installs the matrix, producing a Governed Context\. The matrix remains in force for the life of that context and cannot be replaced within it; a Program needing different constraints obtains a new Governed Context\. Calling any inference operation on a context that has not been the subject of INJECT is a ConstraintInjectionError\.

## <a id="_Toc237028002"></a>__Section 5\.07\.  CAPTURE\.__

CAPTURE\(turn\_trace\) produces a Governance Receipt: it extracts the identity, constraint, and trace references; computes the program hash; assembles the fields of Section 3\.05; and requests signature from IOS\+\. If no WITH\_OUTCOME clause is supplied, the outcome is inferred from the boundary check log \(no violations → COMPLIANT; SOFT violations → VIOLATION; exception invocations → EXCEPTION\_APPLIED\)\. CAPTURE may appear in the body block to issue interim receipts, for instance in self\-auditing Programs; the receipt block shall contain exactly one CAPTURE, which produces the terminal receipt for the Session\.

__*Drafting note \(v1\.0 adoption\): *__*The prior draft stated that CAPTURE "must appear exactly once" while its own Sample Program 5 issued an interim receipt mid\-body\. The rule above adopts the sample's behavior and confines the uniqueness requirement to the receipt block, which was evidently the intent\.*

## <a id="_Toc237028003"></a>__Section 5\.08\.  RECURSE\.__

RECURSE\(output, context\) re\-executes the Program body with the Governed Output as new input, to a declared maximum depth, carrying an identity under the propagation rules of Section 8\.04\. Each recursive turn produces its own Turn Trace whose parent\_id points to the invoking turn\. When the depth budget is exhausted, RECURSE returns the most recent Turn Trace without issuing a further call\. The corrected reduction rules appear in Schedule B\.

# <a id="_Toc237028004"></a>__ARTICLE VI — TYPE SYSTEM__

## <a id="_Toc237028005"></a>__Section 6\.01\.  Static Typing\.__

IGL is statically typed\. All checking occurs at compile time; there is no dynamic dispatch, and type errors are not catchable at runtime\. One caveat: a dimension mismatch between a model vector and a projected constraint matrix may be undetectable until runtime where the vocabulary size is not statically known, in which case it surfaces as FusionTypeError\.

## <a id="_Toc237028006"></a>__Section 6\.02\.  Hierarchy, Compatibility and Coercion\.__

Six named types descend from the root IGLType: IdentityType, BoundaryType, ConstraintType, TraceType, ReceiptType, and FusionType, with the subtypes shown in Schedule B\. Only one subtype relationship is usable interchangeably: a jurisdiction\-scoped ProjectedIdentityType may stand wherever IdentityOperandType is expected\. All other composite pairs — matrix and governed context, cognitive trace and turn trace, receipt and turn trace, governed output and raw vector — are deliberately not interchangeable, because each conversion between them is itself a governed operation with side effects\.

Implicit coercions are limited to five, all runtime\-performed: UDM jurisdiction matrix to Constraint Matrix \(structural lifting, digest recomputed\); UDM boundary vector to rank\-1 Boundary Tensor \(strictness defaulting to HARD\); scalar in \[0,1\] to Authority Level; UUID to IdentityRef under the igl://identity/ scheme; and attention\-derived projections to model vectors, which is flagged for re\-examination in Section 12\.03\. No user\-facing cast syntax exists in v1\.0\.

# <a id="_Toc237028007"></a>__ARTICLE VII — EXECUTION SEMANTICS__

## <a id="_Toc237028008"></a>__Section 7\.01\.  Reduction\.__

Execution follows small\-step operational semantics; the reduction rules, restated with corrections, appear in Schedule B\.

## <a id="_Toc237028009"></a>__Section 7\.02\.  Identity Resolution Procedure\.__

Resolution of an IdentityRef proceeds as follows: \(a\) the URI is parsed against the scheme igl://identity/\{namespace\}/\{local\-id\}, failing with INVALID\_URI\_SCHEME otherwise; \(b\) the Identity Graph is queried for the node and its edges within two hops; \(c\) the Authority Level is read from the node, defaulting to 0\.0 where absent; \(d\) the boundary edge is resolved to a Boundary Tensor, or the Session default supplied by IOS\+ is applied where the edge is absent; \(e\) reachable exception handles are loaded; and \(f\) the completed operand is cached for the Session, expiring at Session end\.

## <a id="_Toc237028010"></a>__Section 7\.03\.  Boundary Enforcement\.__

After each FUSE, the runtime computes the set of tokens whose output probability exceeds the corresponding Boundary Tensor ceiling\. If the set is non\-empty: under SOFT strictness, the event is logged and execution continues, with the eventual receipt marked VIOLATION; under HARD strictness, the runtime first consults the identity's exception list under Section 8\.03, and only if no exception applies does it discard the output, write the Cognitive Trace to the audit log, and halt with HARD\_BOUNDARY\_EXCEEDED\.

## <a id="_Toc237028011"></a>__Section 7\.04\.  Trace Lifecycle\.__

A Cognitive Trace passes through two phases\. While the turn is open, FUSE and CONSTRAIN append to its path list and boundary check log in a runtime buffer\. When the body block's final statement completes, the runtime seals the trace — writing entropy, token count, and timestamp — after which it is immutable\. Sealing is atomic with respect to the body block; recursive calls write to their own traces, never to a sealed parent\.

# <a id="_Toc237028012"></a>__ARTICLE VIII — THE IDENTITY GRAPH__

## <a id="_Toc237028013"></a>__Section 8\.01\.  Structure\.__

The Identity Graph is a directed, labeled property graph G = \(N, E, λ, μ\): nodes typed as ENTITY, ROLE, AUTHORITY\_SCOPE, EXCEPTION, or BOUNDARY\_DEF; edges typed as HAS\_AUTHORITY, HAS\_BOUNDARY, HAS\_EXCEPTION, DELEGATES\_TO, INHERITS\_FROM, or PEER\_OF\. The graph is versioned; the version in effect at Session initialization is recorded in the Session header and in the Governance Receipt \(Section 3\.05\)\. Programs read the graph through PROJECT and resolution; they cannot write to it\.

## <a id="_Toc237028014"></a>__Section 8\.02\.  Authority Resolution\.__

Effective authority is the node's own level, raised to the maximum found along INHERITS\_FROM edges \(bounded by a configured inheritance depth, default eight\), then scaled by any context\-specific authority factors, and finally clamped to \[0\.0, 1\.0\]\. Chains deeper than the configured bound are a runtime configuration error, not a Program error\. Pseudocode appears in Schedule B\.

## <a id="_Toc237028015"></a>__Section 8\.03\.  Exceptions\.__

An identity exception is a pre\-authorized override of a HARD boundary, declared as an EXCEPTION node and referenced from the identity's exception list\. On a HARD violation the runtime scans the list in declaration order; where a listed exception covers the violated dimension, the violation is reclassified as EXCEPTION\_APPLIED, the offending token probabilities are renormalized down to the boundary ceiling for that dimension, the exception handle is recorded in the trace, and execution continues\. Exceptions cannot be added during execution; that would defeat their character as pre\-authorization\.

## <a id="_Toc237028016"></a>__Section 8\.04\.  Propagation\.__

The propagation rule of an Identity Operand governs recursive calls\. INHERIT carries the same identity into the child call, re\-resolved at each level so that intervening graph changes are honored\. ISOLATE substitutes the Session\-default identity in the child while preserving the parent link for lineage\. DELEGATE TO names a target identity that must be reachable from the parent by a DELEGATES\_TO edge, verified before the call; absence of the edge raises DELEGATION\_NOT\_AUTHORIZED\.

# <a id="_Toc237028017"></a>__ARTICLE IX — UDM INTEGRATION__

## <a id="_Toc237028018"></a>__Section 9\.01\.  Jurisdiction Mapping\.__

IOS\+ derives each Session's Constraint Matrix from the applicable UDM jurisdiction matrix by selecting the rows within the Session identity's scope and the columns within its active domains, normalizing cell values to \[0\.0, 1\.0\], and computing the digest\. The derivation procedure appears in Schedule B\.

## <a id="_Toc237028019"></a>__Section 9\.02\.  Crosswalk Tensors; Temporal Bounds\.__

UDM constraint categories are defined in the governance ontology; model reasoning paths are defined in the model's latent space\. A precomputed rank\-3 crosswalk tensor maps between them and is applied during projection in FUSE\. Crosswalk tensors are provisioned by IOS\+ at initialization and are not user\-configurable in v1\.0\. UDM reporting windows map to the Boundary Tensor's temporal field, a closed ISO 8601 UTC interval evaluated at FUSE time; an out\-of\-window computation is a TEMPORAL\_BOUNDARY\_EXCEEDED violation under the strictness rules of Section 7\.03\.

## <a id="_Toc237028020"></a>__Section 9\.03\.  Injection Points; Version Requirements\.__

\(a\)  Constraints are injected at Session initialization \(before the body block\), and may additionally be re\-evaluated at each turn boundary and upon exception application, in each case through INJECT into the applicable Governed Context\. \(b\)  Ontology nodes are referenced in Programs by the udm:// URI scheme, resolved at compile time for static references and at injection for dynamic ones\. \(c\)  Full ontology URI support requires UDM v2\.0 or later\. Against UDM v1\.x a runtime operates in degraded mode, substituting numeric jurisdiction identifiers; all other features remain available, and degraded\-mode operation shall be disclosed in the receipt metadata\.

# <a id="_Toc237028021"></a>__ARTICLE X — ORCHESTRATION BY IOS\+__

## <a id="_Toc237028022"></a>__Section 10\.01\.  Hosted Execution\.__

Programs execute only within IOS\+\. The lifecycle is: reception of Program text or bytecode with Session context; parse and typecheck \(failures here produce no trace and no receipt\); Session initialization, at which the UUID is allocated, the graph version recorded, and the initial matrix injected; body execution under the reduction rules; receipt signature; and Session termination, at which traces are flushed to the audit log and the receipt returned to the caller\.

## <a id="_Toc237028023"></a>__Section 10\.02\.  Decision Surfaces\.__

IOS\+ intervenes at three defined points, invoked by the runtime rather than by Programs: before each FUSE, where it selects the applicable matrix version and may tighten constraints in light of prior\-turn entropy; before each BIND, where it confirms the active identity and the continuing validity of its authority; and at trace sealing, where it determines which fields current UDM reporting obligations require and whether additional metadata must be appended\.

## <a id="_Toc237028024"></a>__Section 10\.03\.  Relationship of Program to Orchestrator\.__

A useful shorthand: the Program is a score and IOS\+ its conductor\. The binding rules beneath the shorthand are these\. A Program is a closed specification — no eval construct, no foreign calls, no deferral of governance decisions outside the operator set\. IOS\+ may apply constraints more strictly than the Program specifies, but may never relax them below the Boundary Tensor except through a declared identity exception\. And the receipt signature belongs to IOS\+ alone; a Program may read its receipts through VERIFY but cannot alter them\.

## <a id="_Toc237028025"></a>__Section 10\.04\.  Service Interface\.__

The six service interfaces below are called synchronously; IOS\+ shall respond within the configured timeout, and a timeout raises ConstraintInjectionError with code IOS\_TIMEOUT\.

__Interface__

__Request__

__Response__

ios\.resolveIdentity\(uri\)

IdentityRef URI

Populated Identity Operand, or IdentityResolutionError

ios\.getConstraintMatrix\(ctx\)

Session context descriptor

Current Constraint Matrix, or ConstraintInjectionError

ios\.signReceipt\(fields\)

Receipt fields \(unsigned\)

Signature under the Approved Signature Algorithm

ios\.logTrace\(trace\)

Sealed Cognitive Trace

Acknowledgment UUID, or TraceCaptureFault

ios\.queryIdentityGraph\(uri, depth\)

Node URI, traversal depth

Subgraph, or IdentityResolutionError

ios\.nextSequenceNo\(\)

\(none\)

Next monotonic sequence number for the Session

# <a id="_Toc237028026"></a>__ARTICLE XI — ERRORS, VIOLATIONS AND REMEDIES__

## <a id="_Toc237028027"></a>__Section 11\.01\.  Error Classes\.__

Five error classes are defined: IdentityResolutionError, BoundaryViolationError, ConstraintInjectionError, FusionTypeError, and TraceCaptureFault\. All are fatal except BoundaryViolationError under SOFT strictness, which is recorded rather than raised\. The full code catalogue is Schedule D\.

## <a id="_Toc237028028"></a>__Section 11\.02\.  Propagation\.__

Compile\-time errors are reported before execution and yield neither trace nor receipt\. A fatal runtime error halts execution at the point of the error; the runtime seals the partial Cognitive Trace with the error event appended, writes it to the audit log under the Session UUID, and issues no Governance Receipt\. An error in a recursive call propagates to the parent level, where an applicable declared exception may absorb it; failing that, it propagates to the Program boundary\.

## <a id="_Toc237028029"></a>__Section 11\.03\.  No General Exception Handling\.__

IGL v1\.0 has no try\-catch\. Recovery from a governance failure is a governance decision, and the available mechanisms are accordingly all pre\-authorized and all visible in the audit record: declared identity exceptions; UNLESS\_EXCEPTION alternative paths; SOFT\-strictness boundaries; and authority escalation through IF\_AUTHORITY\. A silent handler would let a Program absorb a boundary violation without a record, which is precisely the outcome the receipt regime exists to prevent\. No governance event in an IGL Program is discarded without trace\.

# <a id="_Toc237028030"></a>__ARTICLE XII — VERSIONING, COMPATIBILITY AND AMENDMENT__

## <a id="_Toc237028031"></a>__Section 12\.01\.  Version Numbering\.__

Versioning is semantic \(MAJOR\.MINOR\)\. A MAJOR increment signals breaking changes to grammar, type rules, or operator semantics; a MINOR increment is backward\-compatible\. A v1\.0 Program shall execute with equivalent results on any v1\.x runtime\. A Program using v1\.x features is rejected by a v1\.0 runtime at parse time with the minimum required version stated in the error\.

## <a id="_Toc237028032"></a>__Section 12\.02\.  Known Limitations of v1\.0\.__

__Limitation__

__Severity__

__Interim position__

Single\-node execution only

Medium

Multiple single\-node Programs may share a Session UUID; distributed primitives targeted for v1\.1\.

No streaming output; FUSE operates per\-turn on full distributions

High

No workaround; STREAM\_FUSE targeted for v1\.1\.

Static recursion depth only

Low

Declare conservatively; MAX\_DEPTH AUTO targeted for v1\.1\.

Constraint Matrix dimensions fixed at compile time

Medium

Declare maximum size and zero\-pad; dynamic shapes targeted for v1\.1\.

No inter\-program receipt passing

Medium

External orchestration required; receipt chaining targeted for v1\.2\.

Identity Graph read\-only from Programs

Low

Administrative API only; write access reconsidered at v2\.0\.

Single\-pass type inference; no mutually recursive types

Low

Restructure affected Programs; targeted for v1\.2\.

Boundary Tensor precision requirements unsettled

Low

See Section 12\.03\.

## <a id="_Toc237028033"></a>__Section 12\.03\.  Matters Reserved for Engineering Decision\.__

Two items identified in review of the prior draft are recorded here rather than resolved, because each requires measurement rather than drafting: \(a\) the coercion of attention\-derived structures to model vectors is retained provisionally but its stated mechanism \("head\-averaged projection onto vocabulary space"\) is not well defined and shall be respecified or removed by v1\.1; and \(b\) the prior draft required FP64 for Boundary Tensor values while related tooling operates in float32 — the required precision, and the alignment procedure between UDM numeric types and inference tensor types, shall be fixed by v1\.1 after profiling\. Until then, deployments shall document the precision they use in receipt metadata\.

## <a id="_Toc237028034"></a>__Section 12\.04\.  Amendment\.__

Amendments to this Specification shall be proposed as Architecture Decision Records and adopted by the Working Group\. Changes touching Article V or Schedule B additionally require review of the affected formal rules and validation against the reference test suite before adoption\. Receipt schema fields are frozen for the v1\.x series; fields added in v1\.x shall be optional and shall not invalidate v1\.0 signatures\.

# <a id="_Toc237028035"></a>__ARTICLE XIII — GENERAL PROVISIONS__

## <a id="_Toc237028036"></a>__Section 13\.01\.  Order of Precedence\.__

In the event of conflict: this Specification prevails over any implementation documentation; within this Specification, precedence follows Section 1\.02\(e\)\.

## <a id="_Toc237028037"></a>__Section 13\.02\.  Severability\.__

If any provision of this Specification is determined to be unimplementable as written, the remaining provisions continue in effect, and the Working Group shall amend the affected provision under Section 12\.04 rather than permit divergent implementations\.

## <a id="_Toc237028038"></a>__Section 13\.03\.  Referenced Standards\.__

Timestamps are ISO 8601 UTC\. Digests are SHA\-256\. Signatures are governed by the Approved Signature Algorithm\. Version strings follow Semantic Versioning 2\.0\.0\. URIs follow RFC 3986 under the igl:// and udm:// schemes defined respectively by this Specification and by UDM\.

## <a id="_Toc237028039"></a>__Section 13\.04\.  Entire Specification; Effective Date\.__

This Specification, together with its Schedules, is the entire statement of IGL v1\.0 and takes effect on the Effective Date\. This instrument may be reproduced for conformance implementation purposes\.

# <a id="_Toc237028040"></a>__ADOPTION__

ADOPTED AND APPROVED by the IGL Working Group as of the Effective Date\.

 

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

__Chris — Lead Author, IGL Working Group__

Houston, Texas · 7 August 2026

 

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Reviewer, Runtime — approval pending

 

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Reviewer, UDM Integration — approval pending

# <a id="_Toc237028041"></a>__SCHEDULE A — GRAMMAR \(EBNF\)__

Non\-terminals are lowercase with underscores; terminals are quoted or upper\-case\. \[ \] marks an option, \+ one\-or\-more, \* zero\-or\-more, | alternatives\.

igl\_program        ::= program\_header identity\_block constraint\_block body\_block receipt\_block

program\_header     ::= "IGL" version\_literal "PROGRAM" string\_literal ";"

                     | "IGL" version\_literal "PROGRAM" string\_literal "SESSION" uuid\_literal ";"

version\_literal    ::= "v" DIGIT\+ "\." DIGIT\+

identity\_block     ::= "IDENTITY" "\{" identity\_decl\+ "\}"

constraint\_block   ::= "CONSTRAINTS" "\{" constraint\_decl\+ "\}"

body\_block         ::= "BEGIN" statement\+ "END"

receipt\_block      ::= "RECEIPT" "\{" capture\_stmt "\}"

 

identity\_decl      ::= "DECLARE" "IDENTITY" identifier "AS" identity\_operand\_expr ";"

identity\_operand\_expr ::= "IDENTITY\_OPERAND" "\{"

                       "id" ":" identity\_ref ","

                       "authority" ":" float\_literal ","

                       "boundary" ":" boundary\_ref ","

                       \[ "exceptions" ":" exception\_list "," \]

                       "propagation" ":" propagation\_rule "\}"

identity\_ref       ::= uri\_literal

boundary\_ref       ::= identifier | uri\_literal

propagation\_rule   ::= "INHERIT" | "ISOLATE" | "DELEGATE" "TO" identity\_ref

exception\_list     ::= "\[" exception\_handle \("," exception\_handle\)\* "\]"

exception\_handle   ::= uri\_literal

 

boundary\_decl      ::= "DECLARE" "BOUNDARY" identifier "AS" boundary\_tensor\_expr ";"

boundary\_tensor\_expr ::= "BOUNDARY\_TENSOR" "\{"

                       "dimensions" ":" nat\_literal ","

                       "shape" ":" "\[" nat\_literal \("," nat\_literal\)\* "\]" ","

                       \[ "values" ":" float\_array "," \]        \(\* added at v1\.0 adoption; Section 3\.02 \*\)

                       "jurisdiction" ":" jurisdiction\_ref ","

                       \[ "temporal" ":" temporal\_bound "," \]

                       "strictness" ":" strictness\_mode "\}"

strictness\_mode    ::= "HARD" | "SOFT"

temporal\_bound     ::= "\[" iso8601\_literal "," iso8601\_literal "\]"

jurisdiction\_ref   ::= uri\_literal

float\_array        ::= "\[" float\_literal \("," float\_literal\)\* "\]"

 

constraint\_decl    ::= "DECLARE" "CONSTRAINT" identifier "AS" constraint\_matrix\_expr ";"

                     | inject\_stmt

constraint\_matrix\_expr ::= "CONSTRAINT\_MATRIX" "\{"

                       "source" ":" udm\_ref ","

                       "version" ":" semver\_literal ","

                       "digest" ":" sha256\_literal "\}"

inject\_stmt        ::= "INJECT" "\(" identifier "," context\_expr "\)" ";"

udm\_ref            ::= uri\_literal

context\_expr       ::= identifier | inference\_context\_expr

 

fusion\_expr        ::= "FUSE" "\(" ai\_vector\_expr "," udm\_matrix\_expr "\)" \[ "UNDER" identity\_ref \]

ai\_vector\_expr     ::= identifier | model\_call\_expr

udm\_matrix\_expr    ::= identifier | constraint\_matrix\_expr

model\_call\_expr    ::= "AI\_INFER" "\(" prompt\_expr \[ "," context\_expr \] "\)"

prompt\_expr        ::= string\_literal | identifier

 

trace\_stmt         ::= "CAPTURE\_TRACE" "\(" identifier "\)" "INTO" identifier ";"

                     | "BIND" "\(" identity\_ref "," trace\_ref "\)" "AS" identifier ";"

capture\_stmt       ::= "CAPTURE" "\(" turn\_trace\_ref "\)" "AS" identifier

                       \[ "WITH\_OUTCOME" outcome\_literal \] ";"

outcome\_literal    ::= "COMPLIANT" | "VIOLATION" | "EXCEPTION\_APPLIED"

 

conditional\_stmt   ::= authority\_cond | boundary\_cond | exception\_cond

authority\_cond     ::= "IF\_AUTHORITY" "\(" identity\_ref "," authority\_op "," float\_literal "\)"

                       "THEN" block\_stmt \[ "ELSE" block\_stmt \]

boundary\_cond      ::= "WHEN\_BOUNDARY" "\(" boundary\_ref "," constraint\_ref "\)"

                       "WITHIN" block\_stmt \[ "OUTSIDE" block\_stmt \]

exception\_cond     ::= "UNLESS\_EXCEPTION" "\(" exception\_handle "," identity\_ref "\)"

                       block\_stmt \[ "ELSE" block\_stmt \]

authority\_op       ::= "GTE" | "LTE" | "EQ" | "GT" | "LT"

block\_stmt         ::= "\{" statement\+ "\}"

 

recursive\_block    ::= "RECURSE" "\(" governed\_output\_ref "," context\_expr "\)"

                       "MAX\_DEPTH" nat\_literal "CARRYING" identity\_ref "AS" identifier ";"

# <a id="_Toc237028042"></a>__SCHEDULE B — TYPE HIERARCHY, TYPING RULES AND REDUCTION RULES__

__B\-1  Type hierarchy\.__

IGLType

├── IdentityType

│   ├── IdentityRef                \(scalar: resolved identity URI\)

│   ├── IdentityOperandType        \(composite: full IDENTITY\_OPERAND record\)

│   └── ProjectedIdentityType      \(composite: jurisdiction\-scoped identity\)

├── BoundaryType

│   ├── BoundaryTensorType         \(composite: full BOUNDARY\_TENSOR record\)

│   └── BoundaryRef                \(scalar: reference to declared boundary\)

├── ConstraintType

│   ├── ConstraintMatrixType       \(composite: full CONSTRAINT\_MATRIX record\)

│   └── GovernedContextType        \(composite: inference context \+ matrix\)

├── TraceType

│   ├── CognitiveTraceType         \(composite: per\-turn reasoning footprint\)

│   └── TurnTraceType              \(composite: atomic governed interaction unit\)

├── ReceiptType

│   └── GovernanceReceiptType      \(composite: signed proof\-of\-computation\)

└── FusionType

    ├── AIVectorType               \(composite: raw model probability distribution\)

    ├── GovernedOutputType         \(composite: constraint\-bounded distribution\)

    └── RecursiveTraceType         \(composite: recursive turn trace chain\)

__B\-2  Typing rules__ \(Γ ⊢ e : T reads "in environment Γ, e has type T"\)\.

\[T\-IDENTITY\]  Γ ⊢ id : IdentityRef    Γ ⊢ a : Float\[0,1\]    Γ ⊢ b : BoundaryRef

              ────────────────────────────────────────────────────────────────

              Γ ⊢ IDENTITY\_OPERAND \{ id, authority=a, boundary=b, \.\.\. \} : IdentityOperandType

 

\[T\-FUSE\]      Γ ⊢ v : AIVectorType    Γ ⊢ M : ConstraintMatrixType

              ──────────────────────────────────────────────────

              Γ ⊢ FUSE\(v, M\) : GovernedOutputType

 

\[T\-CONSTRAIN\] Γ ⊢ p : ReasoningPathType    Γ ⊢ B : BoundaryTensorType

              ─────────────────────────────────────────────────────

              Γ ⊢ CONSTRAIN\(p, B\) : List\[ReasoningPathType\]

 

\[T\-BIND\]      Γ ⊢ i : IdentityOperandType    Γ ⊢ t : CognitiveTraceType

              ───────────────────────────────────────────────────────

              Γ ⊢ BIND\(i, t\) : TurnTraceType

 

\[T\-VERIFY\]    Γ ⊢ r : GovernanceReceiptType    Γ ⊢ i : IdentityOperandType

              ──────────────────────────────────────────────────────────

              Γ ⊢ VERIFY\(r, i\) : Boolean

 

\[T\-PROJECT\]   Γ ⊢ G : IdentityGraph    Γ ⊢ j : JurisdictionRef

              ───────────────────────────────────────────────

              Γ ⊢ PROJECT\(G, j\) : ProjectedIdentityType

 

\[T\-INJECT\]    Γ ⊢ M : ConstraintMatrixType    Γ ⊢ ctx : InferenceContext

              ─────────────────────────────────────────────────────────

              Γ ⊢ INJECT\(M, ctx\) : GovernedContextType

 

\[T\-CAPTURE\]   Γ ⊢ tt : TurnTraceType

              ─────────────────────────────────

              Γ ⊢ CAPTURE\(tt\) : GovernanceReceiptType

 

\[T\-RECURSE\]   Γ ⊢ out : GovernedOutputType   Γ ⊢ ctx : GovernedContextType

              Γ ⊢ id : IdentityOperandType   n ∈ ℕ₊

              ────────────────────────────────────────────────────────────

              Γ ⊢ RECURSE\(out, ctx\) MAX\_DEPTH n CARRYING id : RecursiveTraceType

__B\-3  Reduction rules__ \(small\-step; e → e′ is one step\)\.

\[E\-FUSE\-STEP\]      v → v′

                   ─────────────────────────

                   FUSE\(v, M\) → FUSE\(v′, M\)

 

\[E\-FUSE\-COMPUTE\]   v\_v value    M\_v value

                   ────────────────────────────────────────────────────

                   FUSE\(v\_v, M\_v\) → normalize\(v\_v ⊙ project\(M\_v, vocab\(v\_v\)\)\)

 

\[E\-CONSTRAIN\]      p\_v value    B\_v value

                   ─────────────────────────────────────────────

                   CONSTRAIN\(p\_v, B\_v\) → \{ q ∈ p\_v | ∀d,c: B\_v\[d\]\[c\] > 0\.0 \}

 

\[E\-BIND\]           i\_v value    t\_v value    M\_active = active ConstraintMatrix

                   ─────────────────────────────────────────────────────────

                   BIND\(i\_v, t\_v\) → TurnTrace\{ identity=i\_v, constraint=M\_active,

                        trace=t\_v, output=current\_output, sequence\_no=next\_seq\(\),

                        parent\_id=current\_parent\_id\(\) \}

 

\[E\-RECURSE\-BASE\]   depth = 0

                   ───────────────────────────────────────────────

                   RECURSE\(out, ctx\) MAX\_DEPTH depth CARRYING id → out

 

\[E\-RECURSE\-STEP\]   depth > 0    out → out′

                   ──────────────────────────────────────────────────────────

                   RECURSE\(out, ctx\) MAX\_DEPTH depth CARRYING id →

                     RECURSE\(FUSE\(out′, INJECT\(active\_M, ctx\)\), ctx′\)

                       MAX\_DEPTH \(depth − 1\) CARRYING propagate\(id\)

__*Drafting note \(v1\.0 adoption\): *__*The prior draft's base rule fired at depth = MAX\_DEPTH, which is satisfied on first evaluation and would prevent recursion entirely\. The base condition is corrected to depth = 0; the step rule decrements as before\. This matches the worked example in Schedule C\-3 \(declared depth 3, up to four governed steps\)\.*

__B\-4  Authority resolution \(pseudocode\)\.__

FUNCTION resolve\_authority\(identity, decision\_context\) → AuthorityLevel:

    node ← IdentityGraph\.lookup\(identity\)

    IF node = NULL: RAISE IdentityResolutionError\(IDENTITY\_NOT\_FOUND\)

    a ← node\.authority

    FOR EACH e IN outgoing\_edges\(node, INHERITS\_FROM\):        \-\- depth\-bounded, default 8

        a ← MAX\(a, resolve\_authority\(e\.target, decision\_context\)\)

    FOR EACH scope IN active\_scopes\(decision\_context\):

        IF scope\.applies\_to\(node\): a ← a × scope\.authority\_factor

    RETURN CLAMP\(a, 0\.0, 1\.0\)

__B\-5  UDM\-to\-IGL constraint derivation \(pseudocode\)\.__

FUNCTION udm\_to\_igl\_constraint\(J, ctx\) → CONSTRAINT\_MATRIX:

    rows  ← SELECT r FROM J WHERE r\.entity\_ref IN ctx\.identity\_scope

    cols  ← SELECT c FROM J WHERE c\.category  IN ctx\.domain\_scope

    cells ← normalize\_constraint\_values\(J\[rows, cols\]\)          \-\- into \[0\.0, 1\.0\]

    RETURN CONSTRAINT\_MATRIX\{ source: J\.udm\_module\_ref, rows, cols,

                              cells, version: J\.version, digest: sha256\(cells\) \}

# <a id="_Toc237028043"></a>__SCHEDULE C — SAMPLE PROGRAMS__

Five worked Programs follow\. They are normative examples: a Conformant Runtime shall accept each and produce the behavior described in the accompanying notes\.

__C\-1  Simple governed query\.__

IGL v1\.0 PROGRAM "simple\_query\_example" ;

 

IDENTITY \{

  DECLARE IDENTITY agent AS IDENTITY\_OPERAND \{

    id          : "igl://identity/houston/agent\-001",

    authority   : 0\.5,

    boundary    : public\_boundary,

    propagation : INHERIT

  \} ;

\}

 

CONSTRAINTS \{

  DECLARE BOUNDARY public\_boundary AS BOUNDARY\_TENSOR \{

    dimensions  : 2,

    shape       : \[512, 128\],

    jurisdiction: "udm://jurisdiction/public\-domain",

    strictness  : HARD

  \} ;

  DECLARE CONSTRAINT public\_constraint AS CONSTRAINT\_MATRIX \{

    source  : "udm://module/public\-domain\-v2",

    version : "2\.0\.1",

    digest  : "a3f9c1\.\.\."

  \} ;

\}

 

BEGIN

  INJECT \( public\_constraint, inference\_ctx \) ;

  LET ai\_output    = AI\_INFER\("What is the capital of Texas?"\) ;

  LET governed\_out = FUSE \( ai\_output, public\_constraint \) ;

  LET trace        = CAPTURE\_TRACE \( governed\_out \) INTO trace\_01 ;

  LET turn         = BIND \( agent, trace\_01 \) AS turn\_01 ;

END

 

RECEIPT \{

  CAPTURE \( turn\_01 \) AS final\_receipt WITH\_OUTCOME COMPLIANT ;

\}

Notes\. INJECT must precede AI\_INFER; the reverse order is a ConstraintInjectionError\. The FUSE line is where the two operand spaces meet\.

__C\-2  Multi\-identity fusion with authority escalation\.__

IGL v1\.0 PROGRAM "multi\_identity\_authority\_escalation" ;

 

IDENTITY \{

  DECLARE IDENTITY base\_agent AS IDENTITY\_OPERAND \{

    id          : "igl://identity/ops/agent\-base\-007",

    authority   : 0\.3,

    boundary    : standard\_boundary,

    propagation : DELEGATE TO "igl://identity/ops/supervisor\-001"

  \} ;

  DECLARE IDENTITY supervisor AS IDENTITY\_OPERAND \{

    id          : "igl://identity/ops/supervisor\-001",

    authority   : 0\.85,

    boundary    : elevated\_boundary,

    exceptions  : \["igl://exception/restricted\-domain\-access"\],

    propagation : INHERIT

  \} ;

\}

 

CONSTRAINTS \{

  DECLARE BOUNDARY standard\_boundary AS BOUNDARY\_TENSOR \{

    dimensions : 2, shape : \[256, 64\],

    jurisdiction: "udm://jurisdiction/standard", strictness : HARD \} ;

  DECLARE BOUNDARY elevated\_boundary AS BOUNDARY\_TENSOR \{

    dimensions : 3, shape : \[512, 256, 128\],

    jurisdiction: "udm://jurisdiction/elevated", strictness : HARD \} ;

  DECLARE CONSTRAINT standard\_constraint AS CONSTRAINT\_MATRIX \{

    source : "udm://module/standard\-v3", version : "3\.1\.0", digest : "b72d40\.\.\." \} ;

  DECLARE CONSTRAINT elevated\_constraint AS CONSTRAINT\_MATRIX \{

    source : "udm://module/elevated\-v1", version : "1\.0\.0", digest : "e19a88\.\.\." \} ;

\}

 

BEGIN

  INJECT \( standard\_constraint, inference\_ctx \) ;

  LET base\_output = AI\_INFER\("Retrieve restricted operational data"\) ;

 

  IF\_AUTHORITY \( base\_agent, LT, 0\.5 \) THEN \{

    LET escalated\_id    = PROJECT\( "igl://identity\-graph/ops", "udm://jurisdiction/elevated" \) ;

    INJECT \( elevated\_constraint, inference\_ctx \) ;

    LET elevated\_output = FUSE \( base\_output, elevated\_constraint \) UNDER supervisor ;

    LET trace           = CAPTURE\_TRACE \( elevated\_output \) INTO trace\_escalated ;

    LET turn            = BIND \( supervisor, trace\_escalated \) AS turn\_escalated ;

  \} ELSE \{

    LET governed\_out = FUSE \( base\_output, standard\_constraint \) ;

    LET trace        = CAPTURE\_TRACE \( governed\_out \) INTO trace\_base ;

    LET turn         = BIND \( base\_agent, trace\_base \) AS turn\_escalated ;

  \}

END

 

RECEIPT \{

  CAPTURE \( turn\_escalated \) AS final\_receipt ;

\}

Notes\. IF\_AUTHORITY branches on resolved authority only — it is not an application conditional\. The receipt records whichever identity was bound when BIND ran, so the escalation path is fully auditable\.

__C\-3  Recursive governed reasoning loop\.__

IGL v1\.0 PROGRAM "recursive\_governed\_reasoning" ;

 

IDENTITY \{

  DECLARE IDENTITY reasoner AS IDENTITY\_OPERAND \{

    id          : "igl://identity/reasoning/loop\-agent\-001",

    authority   : 0\.6,

    boundary    : reasoning\_boundary,

    propagation : INHERIT

  \} ;

\}

 

CONSTRAINTS \{

  DECLARE BOUNDARY reasoning\_boundary AS BOUNDARY\_TENSOR \{

    dimensions : 4, shape : \[256, 128, 64, 32\],

    jurisdiction: "udm://jurisdiction/reasoning\-domain", strictness : SOFT \} ;

  DECLARE CONSTRAINT reasoning\_constraint AS CONSTRAINT\_MATRIX \{

    source : "udm://module/reasoning\-v2", version : "2\.3\.0", digest : "c88f12\.\.\." \} ;

\}

 

BEGIN

  INJECT \( reasoning\_constraint, inference\_ctx \) ;

  LET initial\_output = FUSE \(

    AI\_INFER\("Analyze the governance implications of recursive AI reasoning"\),

    reasoning\_constraint \) ;

  RECURSE \( initial\_output, inference\_ctx \) MAX\_DEPTH 3 CARRYING reasoner AS recursive\_chain ;

  LET final\_trace = CAPTURE\_TRACE \( recursive\_chain \) INTO final\_trace\_01 ;

  LET final\_turn  = BIND \( reasoner, final\_trace\_01 \) AS final\_turn\_01 ;

END

 

RECEIPT \{

  CAPTURE \( final\_turn\_01 \) AS final\_receipt ;

\}

Notes\. SOFT strictness suits exploratory reasoning, where boundary proximity is expected and worth logging rather than fatal\. With a declared depth of 3, the Program performs at most four governed inference steps — the initial pass plus three recursive ones — under the corrected base rule of Schedule B\-3\. IOS\+ may tighten constraints between recursive steps as entropy evolves\.

__C\-4  Cross\-jurisdiction boundary enforcement\.__

IGL v1\.0 PROGRAM "cross\_jurisdiction\_enforcement"

        SESSION "a1b2c3d4\-e5f6\-7890\-abcd\-ef1234567890" ;

 

IDENTITY \{

  DECLARE IDENTITY global\_agent AS IDENTITY\_OPERAND \{

    id          : "igl://identity/global/cross\-border\-001",

    authority   : 0\.75,

    boundary    : multi\_jurisdiction\_boundary,

    exceptions  : \[ "igl://exception/eu\-gdpr\-article9\-override",

                    "igl://exception/us\-hipaa\-deidentified\-data" \],

    propagation : ISOLATE

  \} ;

\}

 

CONSTRAINTS \{

  DECLARE BOUNDARY eu\_boundary AS BOUNDARY\_TENSOR \{

    dimensions : 3, shape : \[512, 256, 128\],

    jurisdiction: "udm://jurisdiction/eu/gdpr",

    temporal : \["2026\-01\-01T00:00:00Z", "2026\-12\-31T23:59:59Z"\],

    strictness : HARD \} ;

  DECLARE BOUNDARY us\_boundary AS BOUNDARY\_TENSOR \{

    dimensions : 2, shape : \[512, 128\],

    jurisdiction: "udm://jurisdiction/us/hipaa",

    temporal : \["2026\-01\-01T00:00:00Z", "2026\-12\-31T23:59:59Z"\],

    strictness : HARD \} ;

  DECLARE BOUNDARY multi\_jurisdiction\_boundary AS BOUNDARY\_TENSOR \{

    dimensions : 5, shape : \[512, 256, 128, 64, 32\],

    jurisdiction: "udm://jurisdiction/composite/eu\-us", strictness : HARD \} ;

  DECLARE CONSTRAINT eu\_constraint AS CONSTRAINT\_MATRIX \{

    source : "udm://module/gdpr\-v4", version : "4\.0\.0", digest : "d91c03\.\.\." \} ;

  DECLARE CONSTRAINT us\_constraint AS CONSTRAINT\_MATRIX \{

    source : "udm://module/hipaa\-v2", version : "2\.1\.0", digest : "f44e55\.\.\." \} ;

\}

 

BEGIN

  INJECT \( eu\_constraint, inference\_ctx \) ;

  LET eu\_governed = FUSE \(

    AI\_INFER\("Analyze patient treatment outcomes across EU and US facilities"\),

    eu\_constraint \) ;

 

  WHEN\_BOUNDARY \( eu\_boundary, eu\_constraint \) WITHIN \{

    INJECT \( us\_constraint, inference\_ctx \) ;

    LET cross\_governed = FUSE \( eu\_governed, us\_constraint \) ;

    LET trace          = CAPTURE\_TRACE \( cross\_governed \) INTO cross\_trace ;

    LET turn           = BIND \( global\_agent, cross\_trace \) AS cross\_turn ;

  \} OUTSIDE \{

    UNLESS\_EXCEPTION \( "igl://exception/eu\-gdpr\-article9\-override", global\_agent \) \{

      LET fallback\_output = FUSE \(

        AI\_INFER\("Provide de\-identified population statistics only"\),

        eu\_constraint \) ;

      LET trace = CAPTURE\_TRACE \( fallback\_output \) INTO fallback\_trace ;

      LET turn  = BIND \( global\_agent, fallback\_trace \) AS cross\_turn ;

    \}

  \}

END

 

RECEIPT \{

  CAPTURE \( cross\_turn \) AS final\_receipt ;

\}

Notes\. The WHEN\_BOUNDARY guard sequences the two jurisdictions: US constraints are applied only to output that has already cleared the EU boundary\. The OUTSIDE arm shows the exception pattern for a declared GDPR Article 9 research override\. ISOLATE propagation ensures any recursive extension would not inherit this agent's elevated cross\-border authority\.

__C\-5  Multi\-turn trace capture with interim receipt verification\.__

IGL v1\.0 PROGRAM "full\_turntrace\_receipt\_demo" ;

 

IDENTITY \{

  DECLARE IDENTITY audited\_agent AS IDENTITY\_OPERAND \{

    id          : "igl://identity/audit/agent\-full\-001",

    authority   : 0\.9,

    boundary    : full\_audit\_boundary,

    exceptions  : \[\],

    propagation : INHERIT

  \} ;

\}

 

CONSTRAINTS \{

  DECLARE BOUNDARY full\_audit\_boundary AS BOUNDARY\_TENSOR \{

    dimensions : 4, shape : \[1024, 512, 256, 128\],

    jurisdiction: "udm://jurisdiction/full\-audit\-zone",

    temporal : \["2026\-08\-01T00:00:00Z", "2026\-08\-31T23:59:59Z"\],

    strictness : HARD \} ;

  DECLARE CONSTRAINT audit\_constraint AS CONSTRAINT\_MATRIX \{

    source : "udm://module/full\-audit\-v1", version : "1\.0\.0", digest : "9a3b77\.\.\." \} ;

\}

 

BEGIN

  \-\- Turn 1

  INJECT \( audit\_constraint, inference\_ctx \) ;

  LET output\_01 = FUSE \(

    AI\_INFER\("Summarize all governed AI interactions for audit period August 2026"\),

    audit\_constraint \) ;

  LET trace\_01  = CAPTURE\_TRACE \( output\_01 \) INTO cognitive\_trace\_01 ;

  LET turn\_01   = BIND \( audited\_agent, cognitive\_trace\_01 \) AS turn\_record\_01 ;

 

  \-\- Turn 2

  LET output\_02 = FUSE \(

    AI\_INFER\("Identify anomalous authority escalations in the audit period"\),

    audit\_constraint \) ;

  LET trace\_02  = CAPTURE\_TRACE \( output\_02 \) INTO cognitive\_trace\_02 ;

  LET turn\_02   = BIND \( audited\_agent, cognitive\_trace\_02 \) AS turn\_record\_02 ;

 

  \-\- Turn 3: interim receipt and self\-verification \(Section 5\.07\)

  LET prior\_receipt = CAPTURE \( turn\_record\_01 \) AS interim\_receipt ;

  LET is\_valid      = VERIFY \( interim\_receipt, audited\_agent \) ;

 

  IF\_AUTHORITY \( audited\_agent, GTE, 0\.8 \) THEN \{

    LET output\_03  = FUSE \( AI\_INFER\("Generate final audit summary report"\), audit\_constraint \) ;

    LET trace\_03   = CAPTURE\_TRACE \( output\_03 \) INTO cognitive\_trace\_03 ;

    LET final\_turn = BIND \( audited\_agent, cognitive\_trace\_03 \) AS turn\_record\_final ;

  \} ELSE \{

    LET final\_turn = turn\_record\_02 ;

  \}

END

 

RECEIPT \{

  CAPTURE \( turn\_record\_final \) AS session\_receipt WITH\_OUTCOME COMPLIANT ;

\}

Notes\. The interim CAPTURE in the body is the self\-audit pattern now expressly permitted by Section 5\.07; the receipt block still contains exactly one terminal CAPTURE\. The temporal bound confines execution to August 2026, which is the point of a time\-boxed audit zone\.

# <a id="_Toc237028044"></a>__SCHEDULE D — ERROR CODE CATALOGUE__

__Class__

__Fatal__

__Codes and triggers__

IdentityResolutionError

Yes

IDENTITY\_NOT\_FOUND; INVALID\_URI\_SCHEME; DELEGATION\_NOT\_AUTHORIZED; NO\_JURISDICTION\_SCOPE; AUTHORITY\_OUT\_OF\_RANGE\. Raised on failed graph lookup, missing delegation edge, empty jurisdiction projection, or authority outside \[0\.0, 1\.0\]\.

BoundaryViolationError

HARD only

HARD\_BOUNDARY\_EXCEEDED; TEMPORAL\_BOUNDARY\_EXCEEDED; NO\_ADMISSIBLE\_PATHS\. SOFT\-strictness events are logged, not raised, and surface as outcome VIOLATION in the receipt\.

ConstraintInjectionError

Yes

DIGEST\_MISMATCH; UDM\_MODULE\_NOT\_FOUND; VERSION\_CONFLICT; IOS\_TIMEOUT\. Raised when a matrix cannot be verified, located, or provisioned in time\.

FusionTypeError

Yes

DIMENSION\_MISMATCH; TYPE\_INCOMPATIBILITY; PROJECTION\_FAILURE\. Mostly prevented at compile time; dimension mismatches may surface at runtime where |V| is not statically known\.

TraceCaptureFault

Yes

TRACE\_INTEGRITY\_VIOLATION; LOG\_WRITE\_FAILURE; SEQUENCE\_GAP; MISSING\_RECEIPT\_CAPTURE\. Raised on writes to sealed traces, unacknowledged log writes, sequence gaps, or termination without a terminal CAPTURE\.

__End of instrument\. __*© 2026 IGL Working Group\. Reproduction permitted for conformance implementation purposes\.*
