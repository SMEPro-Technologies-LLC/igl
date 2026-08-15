# IGL — Identity-Governed Language

Reference implementation of IGL v0.2: lexer, parser, static checker, and an
interpreter with pluggable UDM / AI / IOS runtimes.

> Every computation is bound to an identity, governed by a declared boundary,
> assisted by pinned models, and preserved as a replayable trace — so that
> intelligence accumulates where it is anchored and decays where it is not.

```
src/lexer.js         tokens: Identifier, Code, Number, String
src/parser.js        AST
src/check.js         static semantics — nothing runs if anything fails here
src/builtins.js      declared signatures for UDM.* / AI.* / IOS.*, intent registry
src/runtime.js       UDMRuntime, AIRuntime, IOSRuntime (TurnTrace store), static IdentityRuntime
src/graph.js         GraphRuntime — boundary/footprint as a fold over the trace stream
src/bridge.js        Bridge — the UDM↔AI translation: γ, α, and the numbers rule
src/store.js         MemoryJournal / FileJournal / D1Journal — hash-chained event substrate
src/sign.js          Signer — Ed25519 trace and chain-head receipts; keyed attestation
src/interpreter.js   fixed evaluation order, two-phase commit, OnFail

docs/SPEC.md         the specification
docs/CRITIQUE.md     what was wrong with v0.1 and how v0.2 answers it
docs/GRAPH.md        the recursive identity graph: layers, promotion, decay, reconstruction
docs/BRIDGE.md       discrete ↔ continuous: soundness, projection, span references

examples/vdrpros-ussh.igl    the USSH discovery pipeline as IGL
examples/run-vdrpros.js      executes it and prints the trace ledger
test/igl.test.js             30 tests — language and interpreter
test/graph.test.js           15 tests — identity graph, containment, promotion
test/bridge.test.js          26 tests — γ/α, automaton (incl. BPE edge), projection, soundness + span-fidelity fuzz
test/extract.test.js          9 tests — AI.Extract end to end, anchor gating
test/store.test.js            9 tests — chain verification, load-refusal on tamper, restart persistence, head-CAS
test/sign.test.js            15 tests — envelope signing, registry pinning, rotation, domain separation, class gating
```

## Run

```bash
node --test test/*.test.js       # 105 passing
node examples/run-vdrpros.js     # execution ledger for the USSH matter
```

## Use

```js
import { Interpreter, IdentityRuntime, UDMRuntime, AIRuntime, IOSRuntime } from "./src/index.js";

const interp = new Interpreter({
  identity: new IdentityRuntime({ actors: { Allco: { roles: ["Operator"], defaultRole: "Operator" } } }),
  udm: new UDMRuntime({ boundaries: { Jurisdiction: { values: ["TX-RRC"] }, Period: { values: ["2026-Q3"] } },
                        forms: { "TX-RRC": { forms: ["PR-202"] } } }),
  ai:  new AIRuntime({ models: { "claude-sonnet-5": { version: "2026-05-01" } },
                       invoke: async call => ({ text: "…", confidence: 0.9 }) }),
  ios: new IOSRuntime({ decay: 0.75, floor: 0.4, maxDepth: 3 }),
});

const { results, traces } = await interp.run(`
  ID[Allco:Operator | Jurisdiction:TX-RRC, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet, Mode=Full]
    => Compute[UDM.Resolve(AgencyCode=TX-RRC, RequiredForms=[PR-202]),
               AI.Infer(Task=Missing_Fields, Model=claude-sonnet-5, Seed=7),
               IOS.Trace(Channels=[Reasoning, Tools, Context])]
    -> Output[Compliance_Packet, TurnTrace_ID];
`);
```

The four runtimes are seams. Point `IdentityRuntime` at the identity graph,
`UDMRuntime` at `udmcore`, `AIRuntime.invoke` at a model gateway, and
`IOSRuntime`'s store at D1 or R2, and the same programs run against production.

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
a signed grant does (`graph.js` §2.1). In the bridge, no confidence of *having
found* a value makes the value an anchor unless the location itself cleared the
admissible band (`bridge.js` R2). Both are the same rule: the probabilistic
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
