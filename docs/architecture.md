# IGL Platform — Architecture

> **Status & lineage (v0.2 reconciliation).** This document is the v1.0
> platform architecture. §1–§4 remain the **target topology** — `igl-bk` and
> `d1-igl` exist on the account, `udmcore` is provisioned, and the ERD is the
> intended governance store. §5 and §6 are **superseded by the v0.2 reference
> implementation** in `src/`, specified in [`docs/SPEC.md`](./docs/SPEC.md);
> they are retained below, annotated, because the deltas are decisions, not
> drift. Concept map, v1.0 → v0.2:
>
> | v1.0 (this doc) | v0.2 (built) | Where |
> |---|---|---|
> | `graph.js` — UDME ontology · authority | `graph.js` — two-layer fold; authority moves **only** on signed grants; observation never promotes | `docs/GRAPH.md` |
> | `crypto.js` — SHA-256 chain · Ed25519 | `store.js` (hash-chained journal, `digest_i = sha256(digest_{i−1} ‖ canonical(entry))`) + `sign.js` (Ed25519 trace and head receipts; keyed `IOS.Attest`) | `src/store.js`, `src/sign.js` |
> | `types.js` · `entail.js` · `adapters.js` | `check.js` (static semantics) · `builtins.js` (governed surface) · runtime seams (`D1Journal`, `AIRuntime.invoke`) | `docs/SPEC.md` §7 |
> | §2 `p ⊙ w → renormalize` (distribution fusion) | `bridge.js` — prefix automaton (γ) + projection onto the admissible set (α), soundness `α(γ(S)) ⊆ ↓S ∪ {ABSTAIN}`. Support restriction is enforced *structurally* rather than by renormalising mass | `docs/BRIDGE.md` |
> | §4 `udm_matrix_cells REAL 0.0–1.0` | Not built. v0.2 boundaries are set/lattice-valued, not graded — a graded matrix layers on later without changing the containment tests | — |
> | §6 receipt bound to matrix digest | per-envelope `schemaDigest`/`scopeDigest` (SHA-256, canonical JSON) + journal chain head | `src/bridge.js`, `src/store.js` |
> | §6 smoke test `valid: false, brokenAt: <step>` | `journal.verify()` → `{ ok: false, at: <seq>, reason }` — the property is real; the field is **`at`** | `test/store.test.js` |

All diagrams are Mermaid and render natively on GitHub. Companion documents:
[point-of-inflection.md](./point-of-inflection.md) (canonical fusion math and
halt semantics) and [../DEPLOY.md](../DEPLOY.md) (deploy runbook).

## 1. Deployment topology

```mermaid
flowchart TB
    subgraph Clients
        UI["Wellsite / Console UI"]
        SDK["curl · SDK · IOS+ callers"]
    end

    subgraph Cloudflare
        BK["igl-bk<br/>apex: igl.dev (pending routing)<br/>public API surface"]
        API["igl-api<br/>governed execution<br/>(embeds igl-core)"]
        DIGL["d1-igl<br/>udm.igl.dev — LIVE<br/>UDM governance surface"]
        DB[("D1: udmcore<br/>18 tables · shared store")]
    end

    UI --> BK
    SDK -->|"POST /v1/execute"| API
    API -->|"GET /udm/matrix/get"| DIGL
    API -->|"traces · turns · receipts"| DB
    DIGL -->|"matrices · boundaries · authority<br/>crosswalks · windows"| DB
    BK -. "planned: mount igl-api handlers" .-> API
```

## 2. Governed execution — one session

```mermaid
sequenceDiagram
    participant C as Caller
    participant A as igl-api (Session)
    participant G as Identity Graph
    participant U as udm.igl.dev
    participant D as D1 udmcore

    C->>A: POST /v1/execute { program }
    A->>A: compile (lex → parse → typecheck)
    A->>G: resolve IDENTITY_OPERAND(s)
    G-->>A: authority · exceptions · jurisdiction stack
    A->>U: getMatrix(udm://module/…)
    U-->>A: cells · version · digest
    A->>A: verify digest, stage constraints
    loop per FUSE turn
        A->>A: p ⊙ w → renormalize (support restriction)
        A->>A: boundary check (ceilings · temporal · exceptions)
        A->>D: append hash-chained trace step
    end
    A->>A: BIND turn(s) · CAPTURE receipt (Ed25519)
    A->>D: persist turns + receipt
    A-->>C: { status, output, receipt }
    C->>A: GET /v1/chain?session=…
    A->>D: read steps
    A-->>C: { valid, root, leaf } — third-party verification
```

## 3. Session lifecycle

```mermaid
stateDiagram-v2
    [*] --> COMPILE
    COMPILE --> FAILED_STATIC: IGLCompileError<br/>(no trace, no receipt)
    COMPILE --> IDENTITY: AST valid
    IDENTITY --> FAILURE: IDENTITY_NOT_FOUND /<br/>DELEGATION_NOT_AUTHORIZED
    IDENTITY --> CONSTRAINTS
    CONSTRAINTS --> FAILURE: DIGEST_MISMATCH /<br/>UDM_MODULE_NOT_FOUND
    CONSTRAINTS --> BODY
    BODY --> BODY: FUSE turn OK<br/>(trace step appended)
    BODY --> EXCEPTION_PATH: HARD violation +<br/>declared exception applies
    EXCEPTION_PATH --> BODY: reclassified EXCEPTION_APPLIED
    BODY --> FAILURE: HARD violation,<br/>no exception → seal partial trace
    BODY --> RECEIPT: body complete
    RECEIPT --> CLOSED: terminal CAPTURE signed
    FAILURE --> CLOSED_NO_RECEIPT: audit record persisted,<br/>no receipt issued
    CLOSED --> [*]
    CLOSED_NO_RECEIPT --> [*]
```

## 4. udmcore data model

```mermaid
erDiagram
    jurisdictions ||--o{ agencies : governs
    jurisdictions ||--o{ jurisdictions : "parent_code"
    jurisdictions ||--o{ boundary_vectors : bounds
    jurisdictions ||--o{ udm_matrix : scopes
    udm_matrix ||--o{ udm_matrix_cells : contains
    jurisdictions ||--o{ reporting_windows : schedules
    authority_nodes ||--o{ authority_nodes : "parent_urn"
    authority_nodes ||--o{ authority_delegations : delegates
    authority_nodes ||--o{ identity_exceptions : declares

    igl_trace_steps ||--o{ igl_turn_traces : "hash-chained into"
    igl_turn_traces ||--o{ igl_receipts : "bound by"

    udm_matrix_cells {
        REAL value "0.0 prohibited … 1.0 permitted"
    }
    boundary_vectors {
        REAL ceiling
        TEXT strictness "HARD | SOFT"
    }
    igl_receipts {
        TEXT signature "Ed25519"
        TEXT outcome "COMPLIANT | VIOLATION | EXCEPTION_APPLIED"
    }
```

## 5. igl-core module graph — *superseded; see the status table above*

The graph below is the v1.0 plan. The shipped module graph is:
`lexer → parser → check → interpreter`, with `builtins` (governed call surface
+ intent registry), `runtime` (UDM/AI/IOS), `graph` (identity fold), `bridge`
(UDM↔AI translation), and `store` (hash-chained journal: Memory/File/D1).

```mermaid
flowchart LR
    subgraph "language pipeline"
        L[lexer.js] --> P[parser.js] --> T[types.js]
    end
    subgraph "governed runtime"
        R[runtime.js<br/>8 operators · Session]
        CR[crypto.js<br/>SHA-256 chain · Ed25519]
    end
    subgraph "identity & entailment"
        G[graph.js<br/>UDME ontology · authority]
        E[entail.js<br/>LENS · FORECAST · WATCH]
    end
    subgraph "integration"
        AD[adapters.js<br/>udmAdapter · d1Store · runGoverned]
    end
    T --> R
    R --> CR
    R --> G
    G --> E
    AD --> R
    I[index.js<br/>compile · run] --> P
    I --> R
```

## 6. Trust chain

```mermaid
flowchart LR
    Z["session_id"] -->|"SHA-256(GENESIS:id)"| H0["hash₀"]
    H0 --> S1["step₁ record"] -->|"SHA-256(hash₀ ‖ record)"| H1["hash₁"]
    H1 --> S2["step₂ record"] --> H2["hash₂ …"]
    H2 --> TT["turn traces<br/>(sequence + parent links)"]
    TT --> RC["GOVERNANCE_RECEIPT<br/>identity · matrix digest · root/leaf"]
    RC -->|"Ed25519 sign"| SIG["signature"]
    SIG --> V["/v1/chain + VERIFY<br/>third-party recomputation"]
    style RC fill:#e7f6f0,stroke:#0e8f62
```

Tampering with any step record changes its recomputed hash, which breaks every
subsequent link. In v0.2 this is `journal.verify()` returning
`{ ok: false, at: <seq>, reason: "body does not reproduce its digest" }` —
demonstrated in `test/store.test.js` by doctoring a persisted `TX-RRC` grant to
`US` and by deleting a mid-chain record — in both cases the journal now refuses
to load. The `RC → SIG` edge above is built: `src/sign.js` signs trace digests
and verified chain heads with Ed25519, a keyed `IOS.Attest` embeds the receipt
in the trace before the chain covers it, and `Signer.verifyHeadReceipt` /
`verifyTraceReceipt` are the third-party recomputation this diagram promises.
