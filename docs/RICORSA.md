# Ricorsa and IGL

Ricorsa (ricorsa.com) is the consumer product SMEPro Technologies built on Identity Governed Logic before the platform contract existed. Its product document describes IGL the way Ricorsa uses it: not a module, but a set of behaviors spread across the identity graph, the connectors, the Spaces and the provenance chain. This page maps those behaviors to the repository, so a reader of either can find the other, and so neither side overstates what the other does. Everything below was checked against the Ricorsa product document (version 1.8, October 7, 2026) and against the code in this repository.

## The same idea, two implementations

Ricorsa keeps a graph of what it has learned about one person from their own questions: topics, entities, goals, expertise, style, the conversations that taught each one, and the connections between them. The model is a replaceable component behind the graph. The graph is the asset; it stays in one account, is never shared or used for training, can be paused, pruned, reset and exported, and everything derived from it carries a SHA-256 provenance id chained from the state it came from.

The platform keeps a graph of what a tenant holds about many identities: people, organizations, assets, documents and systems, their relationships, the facts asserted about them, the obligations they carry and the consent they have given, with provenance on every record. The model is a replaceable component behind the graph (`GET /capabilities` reports which one is running). The graph stays in one tenant, the model never sees the raw store, every answer cites the records it used or is refused, and every action leaves a signed receipt and an entry in a hash chain.

These are the same design at different scales. Ricorsa is one person's graph, learned implicitly from conversation. The platform is an organization's graph, written explicitly by applications, with governance over who may see which part of it for which purpose. Ricorsa's rule set is what the platform enforces as a contract.

## Vocabulary

| Ricorsa | Platform | Notes |
|---|---|---|
| Identity graph, one per user | Identities, relationships, facts, context, in one tenant | Ricorsa's graph is a document per user; the platform's is relational and multi-identity |
| Identity region (people, organizations, tools, places) | Identity service: `Person`, `Organization`, `System`, `Agent`, `Asset`, `Place` identity types | |
| Memory region (conversations, documents, Spaces) | Identity context entries (`POST /identities/{id}/context`), `Document` identities, interaction records | A Space, the governed ring around a set of threads, is a purpose profile plus consent on the platform |
| Knowledge region (topics, expertise) | Knowledge service: facts and entities; context entries of kind `expertise` | |
| Opportunity region (goals, intents) | Context entries of kind `goal`, `project`, `interest`; outcomes | |
| Action region (what was built and run) | Agents, workflows, runs | |
| Communication region (style, connectors) | Context entries of kind `preference`; webhooks | |
| Pathways (nodes learned together) | Relationships, with `proposed` or `certified` status | Ricorsa's edges are weights; the platform's carry status, provenance and confidence |
| Intent (a one-sentence reading of what the person is trying to do) | Purpose on every projection; `IntelligenceRequest.question` | |
| Profile (the paragraph placed in the system prompt) | Projection under a purpose: the nodes the model may see, what was withheld and why | The platform's version is bounded by four gates and explains itself |
| Provenance id, fingerprint, lineage chain | Governance receipts (Ed25519), per-tenant audit chain, `fingerprint` and `lineage` in an identity export | Both are SHA-256; the platform's receipts are signed with a published key and carry the chain head |
| Pause, forget, reset, export | The Subject service (contract 0.3): `/learning`, `/forget`, `/reset`, `/export` | Each is policy-evaluated, receipted and chained |
| Discover (traversal with the IGL check at each hop; ideas with lineage ids) | `POST /graph/paths`, `GET /identities?q=`, `POST /crosswalk`, `POST /investigate` | Every hop is a certified or proposed relationship; proposed ones never become authority |
| Recursive learning loop (a question adds nodes, the graph shapes the next answer, outcomes strengthen weights) | Outcomes and measurements (`POST /outcomes`), interaction records, confidence that decays unless re-derived (runtime) | The runtime's IOS loop is the formal version: context selection is explicit and recorded, inherited inference decays |
| VDRPros Vault custody chain | Audit chain with append-only triggers; runtime journal with checkpoints | |

## Ricorsa's IGL rules, as platform guarantees

The product document states the rules in one sentence: the graph stays inside one account, it is never shared or used for training, learning can be paused, any node can be forgotten, and everything derived from it is stamped with a provenance id. Where each one lives on the platform:

**One account.** Every key belongs to one tenant, `X-IGL-Tenant-Id` must match it, and a platform key is the only thing that can act across tenants. Ricorsa's Space-scoped connectors (a connector kept inside one client's Space so no other thread sees it) are purpose profiles and consent records on the platform: a projection admits a node only if the purpose permits its type, its sensitivity is within the profile's ceiling, a consent record covers the identity and purpose, and the jurisdiction allows it.

**Never shared or used for training.** The model never sees the tenant's store. The service assembles a context of records the caller is allowed to see, hands the model that context with record ids, and requires every claim in the answer to cite one. Nothing is sent to a model provider for any purpose but the answer; nothing is retained by the service for training.

**Learning can be paused.** `POST /identities/{id}/learning` with `paused: true`. While paused, context, facts and relationships that would add to the identity's record are refused with 409 `learning_paused`; what is already known is still served under its purposes.

**Any node can be forgotten.** `POST /identities/{id}/forget` with the targets. Each is emptied in place and marked `forgotten`, which removes it from every projection, search, path, list and intelligence context at once. A tombstone keeps the id, the kind, the time and a SHA-256 of the record as it was; the audit chain records the act with the same hash and never the content. The forgetting is itself verifiable: a holder of the original record can prove it was the record that was forgotten, and nobody can quietly undo it, because the tombstone table is append-only.

**Reset.** `POST /identities/{id}/reset` forgets everything learned (all facts, relationships and context) in one governed action, with the identity id repeated in the body as confirmation. The identity, its declared attributes, its obligations and its consents remain; they were declared, not learned.

**Provenance on everything derived.** Every projection, intelligence answer, run, refusal and subject control produces a governance receipt signed with the service's Ed25519 key, published at `auth.id-me.ai/.well-known/jwks.json`. Every receipt carries the audit chain head at the moment it was issued, so a receipt held outside the system is a checkpoint the database cannot rewrite.

**Export.** `GET /identities/{id}/export` returns the whole record (identity, context, facts, relationships, obligations, consents, learning state, tombstones) with a fingerprint over the canonical form, the sentence that says how to recompute it, the lineage of every chain event about the identity (sequence and hash), and a receipt that signs the fingerprint. This is Ricorsa's `GET /api/graph/export`, with a signature.

## What the platform does that Ricorsa does not

Purpose profiles with four gates and a per-node explanation; consent records; obligations with attested or proposed status; policies that fail closed with the refusal record (which rule fired, on which identity and object, under which policy as it stood); agents and workflows parked at `human_approval`; a conformance suite that runs all 51 operations before every deploy. Ricorsa does not need most of these for one person's graph. An enterprise deployment of Ricorsa does, and that is what the platform is for.

## What Ricorsa does that the platform does not

Learn implicitly from conversation. The platform records what applications tell it; it does not read a conversation and decide what to remember. Ricorsa's answer pipeline, Discover, the Build studio, gas and billing are product features above the platform, not platform operations. The seven MCP tools are read-only plus `record_interaction`; the subject controls are deliberately not MCP tools, because a model must not be able to change what is learned about a person. The person does, through the application.

## Where to look

The contract: `spec/openapi.yaml`, the Subject service under the `Subject` tag. The implementation: `platform/api/src/lib/subject.js` and the `Subject` section of `platform/api/src/handlers.js`. The test that proves the behavior: `platform/api/test/conformance.test.mjs`, "subject controls". The runtime's version of the learning loop and its damping: `src/runtime.js` (`IOSRuntime`) and `docs/SPEC.md`. The mapping between runtime and platform terms: `docs/PLATFORM.md`.
