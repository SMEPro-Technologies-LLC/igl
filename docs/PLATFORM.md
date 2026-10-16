# The runtime and the platform

This repository holds two layers of one system. This page explains how they fit together so nobody has to guess.

## Layers

```
Customer applications  (Ricorsa, WellSite, LeaseXPlorer, VDRPros, TortGraph, RealEChat, RealStar, and others)
        │  call
        ▼
IGL API, the platform contract in spec/openapi.yaml, served at api.id-me.ai/v1
        │  resolves against
        ▼
Six governed graphs: Identity, Authority, Knowledge, Policy, Evidence, Outcome
        │  enforced and recorded by
        ▼
IGL runtime, this repository's src/: identity binding, boundary enforcement, intent, hash-chained trace
        │  reasoning delegated to
        ▼
Reasoning layer, any model pinned per request (Anthropic on the hosted service today), agents, tools (interchangeable)
```

The runtime is open source (Apache-2.0) and its own MCP surface today is the provisioning service's seven tools (`check_health`, `list_graphs`, `get_graph`, `search`, `fetch`, `identity_graph_whoami`, `provision_identity`); the platform's seven tools below are the governed-projection surface specified by contract 0.2. The hosted platform is a product of SMEPro Technologies LLC; its contract is open so that applications and model callers can be built and verified against it independently.

## Concept mapping

| Runtime (this repo) | Platform (contract) | Notes |
|---|---|---|
| BOUNDARY graph (company) | Identity + Authority graphs for an organization | A tenant's organizational boundary |
| FOOTPRINT graph (individual) | Identity projection of a person | Served under a purpose; see below |
| Reuse decay, `Traces=None`, journal tombstone of a failure | Subject service (contract 0.3): pause, forget, reset, export | The platform gives the person the controls; the runtime gives the journal the discipline. `docs/RICORSA.md` maps both to Ricorsa |
| `granted` | `certified` relationship / `attested` obligation / active `Policy` | Human- or signer-attested authority |
| `observed: governing` | `proposed` with deterministic provenance | Promotion candidate |
| `observed: proposed` | `proposed` with model provenance | Never promotes to authority |
| Journal (`store.js`), hash-chained | `AuditEvent` with `previousHash` / `eventHash`; `GET /audit/events` | Same chain discipline |
| Merkle inclusion proof | `GovernanceReceipt` + `GET /audit/receipts/{id}` | Selective disclosure to auditors |
| Signed receipt with runtime attestation | `GovernanceReceipt.outputHash`, `Provenance.model` | Which build produced what |
| `IGL_FOOTPRINT_DENIED` | `AuthorityDecision.effect = deny` (403, problem+json) | Refusal before model work |
| `identity_graph_whoami` (provisioning MCP) | `GET /identities/me?purpose=` | Caller resolution |
| `provision_identity`, `list_graphs`, `get_graph` (provisioning MCP) | `POST /identities`, `GET /identities`, `GET /identities/{id}` | Provisioning becomes identity creation |
| `D1Journal` (`store.js`) | Hosted journal behind `/audit/events` | The reference runtime already runs as a Cloudflare Worker with D1 (`docs/SCOPE.md`); the platform is deployed on the same substrate |

## Purposes and projections (contract 0.2)

A projection is a deliberately partial view of an identity, admitted node by node through four gates in order: **node type** (does the purpose profile permit it), **sensitivity** (below the profile's ceiling), **consent** (an active record covers this purpose), **jurisdiction** (the transfer policy allows serving it where the caller is). The first failure is the reason, and `GET /identities/{id}/projection/explain` returns it verbatim so a caller can pass it through rather than paraphrase it.

Four signals change what a caller should say: `truncated: true` (node budget hit; context is incomplete), `emptyWarning` (identity exists, context does not, usually no consent), proposed relationships never appear, and an obligation's `status` of `proposed` is not a confirmed date.

## MCP tools and their REST equivalents

| MCP tool | REST (0.2) |
|---|---|
| `whoami` | `GET /identities/me?purpose=` |
| `list_purposes` | `GET /purposes` |
| `get_identity_context` | `GET /identities/{id}/projection` |
| `explain_projection` | `GET /identities/{id}/projection/explain` |
| `list_obligations` | `GET /identities/{id}/obligations` |
| `search_graph` | `GET /identities?q=` and `POST /graph/paths` |
| `record_interaction` | `POST /audit/interactions` |

## What the contract does not do

It cannot change governance. There are no calls to edit a purpose profile, grant consent or attest something. Those belong to the control plane, and the separation is deliberate: if a model could rewrite the policy that governs it, it would not be governed at all.
