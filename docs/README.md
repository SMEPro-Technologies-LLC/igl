# IGL v1.0 — `docs/` index

This directory holds the architecture and conceptual documents for IGL v1.0.
For the quickstart and runtime overview, see the root
[`README.md`](../README.md). For the reference runtime, see
[`igl-v1/README.md`](../igl-v1/README.md).

> Every computation is bound to an identity, governed by a declared boundary,
> assisted by pinned models, and preserved as a replayable trace — so that
> intelligence accumulates where it is anchored and decays where it is not.

## Documents in this directory

```
SPEC.md                  the IGL v1.0 language specification
CRITIQUE.md              what was wrong in earlier designs and how v1.0 answers it
GRAPH.md                 the recursive identity graph: layers, promotion, decay,
                         reconstruction
BRIDGE.md                discrete ↔ continuous: soundness, projection, span
                         references
RELEASE_CHECKLIST.md     pre-public-flip and pre-production milestones
SCOPE.md                 project scope and stated limits
architecture.md          runtime architecture notes
```

## v1.0 runtime file map

The canonical runtime lives under `igl-v1/src/`. Earlier generations are in
`archive/` and are not part of the v1.0 product line.

```
igl-v1/src/lexer.js         tokens for the block grammar of Schedule A
igl-v1/src/parser.js        recursive-descent parser to an AST
igl-v1/src/check.js         static checks: block structure, INJECT before
                             inference, RECURSE depth, one terminal CAPTURE
igl-v1/src/iosplus.js       IOS+ orchestrator: identity resolution, authority
                             resolution, constraint matrix provision, receipt
                             signing, trace logging, sequence numbers
igl-v1/src/interpreter.js   the eight operators (INJECT, FUSE, RECURSE, CAPTURE,
                             GOVERN, PROJECT, DELEGATE, OBSERVE), boundary
                             enforcement, cognitive trace sealing, receipt
                             issuance
igl-v1/src/sign.js          Ed25519 Governance Receipts, canonical JSON,
                             standalone verify
igl-v1/src/udm.js           live UDM client: constraint matrix fetch and apply
igl-v1/src/govern.js        governance-layer plumbing
igl-v1/src/decoder.js       governed token-by-token decode with a sealed trace
igl-v1/src/gateway.js       OpenAI-compatible governed gateway
igl-v1/src/adapters.js      model seam: logprobs, logits, and uniform adapters
igl-v1/src/vendors.js       cross-vendor proof harness
igl-v1/src/d1.js            Cloudflare D1 storage adapter
igl-v1/src/index.js         public exports
```

Decision records are in `igl-v1/docs/adr/`. ADR 0002 is the authority law.

## Run the suite

From `igl-v1/`:

```bash
cd igl-v1
npm test
```

## The two properties that make it IGL

Everything else is an orchestration DSL with governance vocabulary. These are
the two that aren't:

**Two-phase commit on trace.** Outputs are staged; the trace is written first;
only a durable trace releases the output. A trace failure discards the work. The
system would rather do nothing than do something unobserved.

**Damped recursion.** Assertions are classed `deterministic`, `human`, or `ai`.
AI-class confidence is multiplied by a decay factor each time it is *inherited*
rather than re-derived, and becomes inadmissible below a floor; a derivation-depth
cap bounds AI-to-AI inference chains. Without this, a structurally valid but
factually wrong inference is stored, re-loaded next turn as precedent, agreed
with, and re-asserted with growing apparent support — a feedback loop with no
damping term. UDM catches violations of structure; it cannot catch an inference
that is well-formed and wrong. Decay and the depth cap are what make the loop
converge rather than merely repeat.

**Learning that cannot grant itself authority.** Boundary and footprint are folds
over the trace stream — continuously current, richer every turn. But the fold
maintains two layers: `granted` (what an actor may do) moves only on an explicit
signed grant, while `observed` (what an actor does) accumulates freely and
authorises nothing. AI-class evidence never reaches the governing layer at any
volume; it raises a promotion candidate for a human to act on. Otherwise the
system grants permissions by habit, and the brake becomes learnable.

> The graph learns from everything and is authorised by almost nothing.

**A translation with a proof obligation.** UDM computes over a discrete lattice;
the model computes over continuous geometry. `Bridge` is an adjoint pair —
γ turns an admissible set into a constraint on the model's arithmetic, α projects
the output back onto that set — with the soundness condition `α(γ(S)) ⊆ S`
asserted by fuzzing 1,200 adversarial round trips. And no quantity is ever
generated: the model returns a span reference, the bridge reads the bytes.

> AI locates. UDM computes.

**One principle, enforced at two layers.** The identity graph and the bridge
apply the same asymmetry to different substrates:

> Observation does not confer authority. Location does not confer determinism.

In the graph, no volume of observed activity widens what an actor may do — only
a signed grant does (`igl-v1/src/iosplus.js`, authority resolution). In the
bridge, no confidence of *having found* a value makes the value an anchor unless
the location itself cleared the admissible band (`docs/BRIDGE.md` R2). Both are
the same rule: the probabilistic
channel may propose, accumulate, and inform, but the step that upgrades its
output into governing fact is always deterministic or human. Everything else in
the codebase is machinery for holding that line.

**A receipt that survives the process — and names its signer.** The event
substrate — graph events and TurnTraces alike — writes through a hash-chained
journal (`digest_i = sha256(digest_{i-1} + canonical(entry))`). A tampered
journal refuses to *load*, not merely to verify: authority is folded from the
list, so the doctored grant must never be live. `FileJournal` persists across
restarts (footprints replay identically; idempotency holds across a restart, so
the same statement cannot file twice even after a crash); `D1Journal` is the
Worker adapter — schema-enforced append-only (UPDATE/DELETE abort at the
engine), CAS-fast-path + constraint-guarded batched flush, awaited *inside*
two-phase commit so a lost append race discards staged outputs. On top of the
chain, `Signer` adds Ed25519 receipts: a keyed `IOS.Attest` signs the canonical
trace before it enters the journal, so a third party holding nothing but the
journal can verify both the record and who stood behind it. The signature
covers the full envelope — digest, signer name, timestamp — under a
domain-separated prefix, so names cannot be swapped, receipts cannot be
backdated, and a head signature can never replay as a trace signature. Signing
keys are journal events in the identity graph, bound and revoked by named
grantors, so registry-backed verification pins a receipt to the key the graph
vouched for *at signing time* — rotation does not invalidate prior
attestations, and a revoked key cannot make new ones. And the `human` class is
gated on `keyed`: an unkeyed attestation commits its statement but is classed
`ai` — it decays, it counts toward depth, and §9's non-decaying class is not
mintable by deployment configuration. Tamper-evident → load-refusing →
attributable, where attributable means *pinned to a key the graph vouched for
when the signature was made*.

See `docs/SPEC.md` §9, `docs/CRITIQUE.md` §C1, `docs/GRAPH.md`, `docs/BRIDGE.md`.
