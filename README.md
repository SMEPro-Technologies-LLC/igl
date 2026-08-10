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
src/runtime.js       IdentityRuntime, UDMRuntime, AIRuntime, IOSRuntime (TurnTrace store)
src/interpreter.js   fixed evaluation order, two-phase commit, OnFail

docs/SPEC.md         the specification
docs/CRITIQUE.md     what was wrong with v0.1 and how v0.2 answers it

examples/vdrpros-ussh.igl    the USSH discovery pipeline as IGL
examples/run-vdrpros.js      executes it and prints the trace ledger
test/igl.test.js             30 tests
```

## Run

```bash
node --test test/igl.test.js     # 30 passing
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

See `docs/SPEC.md` §9 and `docs/CRITIQUE.md` §C1.
