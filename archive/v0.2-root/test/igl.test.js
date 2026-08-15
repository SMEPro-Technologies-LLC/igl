import { test } from "node:test";
import assert from "node:assert/strict";
import { lex } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import { check } from "../src/check.js";
import { Interpreter } from "../src/interpreter.js";
import { IdentityRuntime, UDMRuntime, AIRuntime, IOSRuntime } from "../src/runtime.js";

/* ---------------- fixtures ---------------- */
const identity = new IdentityRuntime({
  actors: {
    Allco: { roles: ["Operator", "Compliance"], defaultRole: "Operator", footprint: { org: "Allco Energy" } },
    Hobson: { roles: ["Counsel", "Paralegal"], defaultRole: "Counsel" },
  },
});
const udm = () => new UDMRuntime({
  boundaries: {
    Jurisdiction: { values: ["TX-RRC", "NM-OCD", "US-TX"] },
    Commodity: { values: ["Oil", "Gas"] },
    Period: { values: ["2026-Q3", "2026-Q2"] },
    Matter: { values: ["2026-CV-04417"] },
  },
  forms: { "TX-RRC": { forms: ["PR-202", "H-10", "W-10"] } },
  constraints: { named: { NonNegativeVolume: v => Number(v) >= 0 } },
});
const models = { "claude-sonnet-5": { version: "2026-05-01" } };

const mkInterp = (opts = {}) => new Interpreter({
  identity,
  udm: opts.udm || udm(),
  ai: opts.ai || new AIRuntime({ models, invoke: async () => ({ text: "ok", confidence: 0.9 }) }),
  ios: opts.ios || new IOSRuntime(),
  handlers: opts.handlers || {},
});

const PROG = `%igl 0.2
# a governed compliance packet
ID[Allco:Operator | Jurisdiction:TX-RRC, Commodity:Oil, Period:2026-Q3]
  :: Intent[Generate_Compliance_Packet, Mode=Full]
  => Compute[
       UDM.Resolve(AgencyCode=TX-RRC, RequiredForms=[PR-202, H-10]),
       AI.Infer(Task=Missing_Fields, Model=claude-sonnet-5, MinConfidence=0.6),
       IOS.Trace(Channels=[Reasoning, Tools, Code, Search, Context])
     ]
  -> Output[Compliance_Packet, TurnTrace_ID];
`;

/* ---------------- lexer ---------------- */
test("lexer reads the codes the spec's own examples use", () => {
  const toks = lex("TX-RRC 2026-Q3 PR-202 TRC-004982 Jurisdiction 42 -1.5e3");
  const kinds = toks.filter(t => t.type !== "EOF").map(t => t.type);
  assert.deepEqual(kinds, ["CODE", "CODE", "CODE", "CODE", "IDENT", "NUMBER", "NUMBER"]);
});

test("lexer handles comments, strings with escapes, and unicode arrows", () => {
  const toks = lex(`# note\n"a \\"quoted\\" x" ⇒ →`);
  assert.equal(toks[0].type, "STRING");
  assert.equal(toks[0].value, 'a "quoted" x');
  assert.equal(toks[1].type, "ARROW_INTENT");
  assert.equal(toks[2].type, "ARROW_OUT");
});

test("lexer rejects an unterminated string with position", () => {
  assert.throws(() => lex('x = "abc'), e => e.code === "IGL_UNTERMINATED_STRING" && e.line === 1);
});

/* ---------------- parser ---------------- */
test("parses the canonical statement into the documented AST shape", () => {
  const ast = parse(PROG);
  assert.equal(ast.version, "0.2");
  assert.equal(ast.statements.length, 1);
  const st = ast.statements[0];
  assert.deepEqual(st.identity.actor, ["Allco", "Operator"]);
  assert.equal(st.identity.boundary.length, 3);
  assert.equal(st.intent.name, "Generate_Compliance_Packet");
  assert.equal(st.compute.steps.length, 3);
  assert.deepEqual(st.output.items.map(i => i.name), ["Compliance_Packet", "TurnTrace_ID"]);
});

test("positional arguments are admitted (the v0.1 grammar forbade its own example)", () => {
  const ast = parse(`ID[Allco:Operator | Jurisdiction:TX-RRC, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet]
    => Compute[UDM.Resolve(TX-RRC, [PR-202]), IOS.Trace(Channels=[Reasoning])]
    -> Output[Compliance_Packet];`);
  const args = ast.statements[0].compute.steps[0].args;
  assert.equal(args[0].kind, "Positional");
  assert.equal(args[0].value.value, "TX-RRC");
});

test("a positional argument after a named one is rejected", () => {
  assert.throws(() => parse(`ID[A:Operator | Jurisdiction:TX-RRC]
    :: Intent[Generate_Compliance_Packet] => Compute[UDM.Resolve(AgencyCode=TX-RRC, [PR-202])] -> Output[X];`),
    e => e.code === "IGL_ARG_ORDER");
});

test("an identity block with no boundary does not parse — governance is not optional", () => {
  assert.throws(() => parse(`ID[Allco:Operator] :: Intent[X] => Compute[IOS.Trace(Channels=[Reasoning])] -> Output[Y];`),
    e => e.code === "IGL_NO_BOUNDARY");
});

/* ---------------- checker ---------------- */
test("clean program produces no static errors", () => {
  assert.deepEqual(check(parse(PROG)).map(e => e.code), []);
});

test("unpinned model is a static error", () => {
  const errs = check(parse(`ID[Allco:Operator | Jurisdiction:TX-RRC, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet]
    => Compute[AI.Infer(Task=X), IOS.Trace(Channels=[Reasoning])] -> Output[Compliance_Packet];`));
  assert.ok(errs.some(e => e.code === "IGL_UNPINNED_MODEL"));
});

test("a statement with no IOS.Trace is rejected before execution", () => {
  const errs = check(parse(`ID[Allco:Operator | Jurisdiction:TX-RRC, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet]
    => Compute[UDM.Resolve(AgencyCode=TX-RRC)] -> Output[Compliance_Packet];`));
  assert.ok(errs.some(e => e.code === "IGL_UNTRACED"));
});

test("role not authorised for the intent is caught statically", () => {
  const errs = check(parse(`ID[Hobson:Paralegal | Matter:2026-CV-04417]
    :: Intent[Compile_Findings]
    => Compute[IOS.Trace(Channels=[Reasoning])] -> Output[Findings_Memo];`));
  assert.ok(errs.some(e => e.code === "IGL_UNAUTHORISED"));
});

test("missing required boundary key is caught statically", () => {
  const errs = check(parse(`ID[Allco:Operator | Jurisdiction:TX-RRC]
    :: Intent[File_Production_Report]
    => Compute[IOS.Trace(Channels=[Reasoning]), IOS.Attest(Signer=jh, Role=Operator)] -> Output[Filed_Report];`));
  assert.ok(errs.some(e => e.code === "IGL_BOUNDARY_INCOMPLETE"));
});

test("an undeclared output is rejected", () => {
  const errs = check(parse(`ID[Allco:Operator | Jurisdiction:TX-RRC, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet]
    => Compute[IOS.Trace(Channels=[Reasoning])] -> Output[Bank_Transfer];`));
  assert.ok(errs.some(e => e.code === "IGL_UNDECLARED_OUTPUT"));
});

test("an intent requiring attestation will not check without IOS.Attest", () => {
  const errs = check(parse(`ID[Allco:Operator | Jurisdiction:TX-RRC, Commodity:Oil, Period:2026-Q3]
    :: Intent[File_Production_Report]
    => Compute[IOS.Trace(Channels=[Reasoning])] -> Output[Filed_Report];`));
  assert.ok(errs.some(e => e.code === "IGL_NO_ATTESTATION"));
});

test("forward and unbound references are rejected", () => {
  const errs = check(parse(`ID[Allco:Operator | Jurisdiction:TX-RRC, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet]
    => Compute[UDM.Validate(Target=@Nonexistent), IOS.Trace(Channels=[Reasoning])] -> Output[Compliance_Packet];`));
  assert.ok(errs.some(e => e.code === "IGL_UNBOUND_REF"));
});

/* ---------------- interpreter ---------------- */
test("executes a statement and returns a committed trace", async () => {
  const it = mkInterp();
  const { results } = await it.run(PROG);
  assert.equal(results[0].status, "committed");
  assert.match(results[0].traceId, /^TRC-\d{6}$/);
  const t = results[0].trace;
  assert.equal(t.intent, "Generate_Compliance_Packet");
  assert.deepEqual(t.boundary, { Jurisdiction: "TX-RRC", Commodity: "Oil", Period: "2026-Q3" });
  assert.deepEqual(t.channels, ["Reasoning", "Tools", "Code", "Search", "Context"]);
  assert.equal(t.attestation, "ai");                 // an AI assertion is present
});

test("an ungoverned boundary value is rejected by UDM at runtime", async () => {
  const it = mkInterp();
  const src = `ID[Allco:Operator | Jurisdiction:XX-FAKE, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet]
    => Compute[IOS.Trace(Channels=[Reasoning])] -> Output[Compliance_Packet];`;
  const { results } = await it.run(src);
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].error.code, "IGL_BOUNDARY_REJECTED");
});

test("FAIL-CLOSED: when the trace store fails, no output is released", async () => {
  const brokenIOS = new IOSRuntime();
  brokenIOS.write = () => { throw new Error("store unavailable"); };
  const it = mkInterp({ ios: brokenIOS });
  const { results } = await it.run(PROG);
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].error.code, "IGL_TRACE_FAILED");
  assert.equal(it.env.has("Compliance_Packet"), false, "no output may survive a failed trace");
});

test("ATTESTATION GATE: a filing intent stages but does not commit without a signer", async () => {
  const it = mkInterp();
  const staged = await it.run(`ID[Allco:Operator | Jurisdiction:TX-RRC, Commodity:Oil, Period:2026-Q3]
    :: Intent[File_Production_Report, Mode=Full]
    => Compute[UDM.Resolve(AgencyCode=TX-RRC, RequiredForms=[PR-202]), IOS.Trace(Channels=[Reasoning]), IOS.Attest(Signer=jhayes, Role=Operator)]
    -> Output[Filed_Report];`);
  assert.equal(staged.results[0].status, "committed");
  assert.equal(staged.results[0].trace.assertions.some(a => a.assertion === "attestation"), true);
});

test("attestation-required intent without IOS.Attest is stopped by the checker, never executed", async () => {
  const it = mkInterp();
  await assert.rejects(
    () => it.run(`ID[Allco:Operator | Jurisdiction:TX-RRC, Commodity:Oil, Period:2026-Q3]
      :: Intent[File_Production_Report] => Compute[IOS.Trace(Channels=[Reasoning])] -> Output[Filed_Report];`),
    e => e.code === "IGL_STATIC_ERRORS" && e.errors.some(x => x.code === "IGL_NO_ATTESTATION"));
  assert.equal(it.ios.traces.length, 0, "nothing may execute when static checks fail");
});

test("IDEMPOTENCY: the same statement run twice files once", async () => {
  const it = mkInterp();
  const a = await it.run(PROG);
  const b = await it.run(PROG);
  assert.equal(a.results[0].status, "committed");
  assert.equal(b.results[0].status, "idempotent");
  assert.equal(b.results[0].traceId, a.results[0].traceId);
  assert.equal(it.ios.traces.length, 1);
});

test("OnFail[Halt] surfaces a governed halt rather than a raw throw", async () => {
  const it = mkInterp();
  await assert.rejects(() => it.run(`ID[Allco:Operator | Jurisdiction:XX-FAKE, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet]
    => Compute[IOS.Trace(Channels=[Reasoning])]
    -> Output[Compliance_Packet]
    OnFail[Halt];`), e => e.code === "IGL_HALTED");
});

test("OnFail[Remediate] runs the configured handler and records it", async () => {
  const seen = [];
  const it = mkInterp({ handlers: { Remediate: async ({ args }) => { seen.push(args); return "notified"; } } });
  const { results } = await it.run(`ID[Allco:Operator | Jurisdiction:XX-FAKE, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet]
    => Compute[IOS.Trace(Channels=[Reasoning])]
    -> Output[Compliance_Packet]
    OnFail[Remediate(Notify=compliance_lead)];`);
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].actions[0].result, "notified");
  assert.deepEqual(seen[0], { Notify: "compliance_lead" });
});

test("statements pass outputs downstream via @refs", async () => {
  const it = mkInterp();
  const { results } = await it.run(`
    ID[Hobson:Counsel | Matter:2026-CV-04417]
      :: Intent[Classify_Discovery_Corpus, Scheme=Hybrid]
      => Compute[IOS.Trace(Channels=[Reasoning])]
      -> Output[Evidentiary_Index];
    ID[Hobson:Counsel | Matter:2026-CV-04417]
      :: Intent[Assess_Production_Integrity]
      => Compute[UDM.Validate(Target=@Evidentiary_Index), IOS.Trace(Channels=[Reasoning])]
      -> Output[Integrity_Report];`);
  assert.equal(results[1].status, "committed");
  const v = results[1].trace.assertions.find(a => a.assertion === "validation");
  assert.ok(v, "the downstream statement validated the upstream artifact");
});

/* ---------------- the recursive loop ---------------- */
test("DRIFT DAMPING: an ai-class trace decays out of admissibility as it is reused", () => {
  const ios = new IOSRuntime({ decay: 0.75, floor: 0.4 });
  const t = { id: "TRC-1", intent: "I", identity: { actor: "Allco" }, boundary: {}, attestation: "ai", confidence: 0.8, reuseCount: 0, depth: 1 };
  ios.write(t);
  const conf = [];
  for (let i = 0; i < 5; i++) { conf.push(ios.effectiveConfidence(t)); ios.markReused([t]); }
  assert.ok(conf[0] > conf[1] && conf[1] > conf[2], "confidence must fall on each inheritance");
  assert.ok(ios.effectiveConfidence(t) < 0.4, "an unanchored inference must fall below the admissibility floor");
  const sel = ios.select({ mode: "Recent", n: 10 }, { identity: { actor: "Allco" }, boundary: {}, intent: "I" });
  assert.equal(sel.traces.length, 0, "a decayed inference is no longer loadable as context");
});

test("DRIFT DAMPING: human- and deterministic-class traces never decay", () => {
  const ios = new IOSRuntime({ decay: 0.5, floor: 0.9 });
  for (const cls of ["human", "deterministic"]) {
    const t = { id: "T-" + cls, intent: "I", identity: { actor: "A" }, boundary: {}, attestation: cls, confidence: 1, reuseCount: 9 };
    assert.equal(ios.effectiveConfidence(t), 1, `${cls} assertions are anchors and must not decay`);
  }
});

test("DEPTH CAP: inference stacked beyond the cap is refused rather than inherited", async () => {
  const ios = new IOSRuntime({ maxDepth: 2, decay: 1, floor: 0 });
  /* seed a trace already at the depth limit */
  ios.write({ id: "TRC-seed", statementKey: "seed", intent: "Generate_Compliance_Packet",
    identity: { actor: "Allco" }, boundary: { Jurisdiction: "TX-RRC", Period: "2026-Q3" },
    attestation: "ai", confidence: 0.95, depth: 2, reuseCount: 0 });
  const it = mkInterp({ ios });
  const { results } = await it.run(`ID[Allco:Operator | Jurisdiction:TX-RRC, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet]
    => Context[Traces=Recent(5), MaxDepth=2],
       Compute[AI.Infer(Task=Extend, Model=claude-sonnet-5), IOS.Trace(Channels=[Reasoning, Context])]
    -> Output[Compliance_Packet];`);
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].error.code, "IGL_DEPTH_EXCEEDED");
});

test("context selection is recorded in the trace so a reviewer can see what was read", async () => {
  const it = mkInterp();
  const { results } = await it.run(`ID[Allco:Operator | Jurisdiction:TX-RRC, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet]
    => Context[Traces=Recent(5), MaxDepth=3],
       Compute[UDM.Resolve(AgencyCode=TX-RRC), IOS.Trace(Channels=[Reasoning, Context])]
    -> Output[Compliance_Packet];`);
  const p = results[0].trace.contextPredicate;
  assert.equal(p.n, 5);
  assert.equal(p.maxDepth, 3);
  assert.ok("floor" in p && "decay" in p, "the damping parameters in force are part of the record");
});

test("low-confidence inference is held for review rather than asserted", async () => {
  const it = mkInterp({ ai: new AIRuntime({ models, invoke: async () => ({ text: "maybe", confidence: 0.21 }) }) });
  const { results } = await it.run(PROG);
  const inf = results[0].trace.assertions.find(a => a.assertion === "inference");
  assert.equal(inf.belowThreshold, true);
  assert.match(inf.note, /held for human review/);
});

test("the trace records model version, seed and temperature so it can be replayed", async () => {
  const it = mkInterp();
  const { results } = await it.run(`ID[Allco:Operator | Jurisdiction:TX-RRC, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet]
    => Compute[AI.Infer(Task=X, Model=claude-sonnet-5, Temperature=0, Seed=7), IOS.Trace(Channels=[Reasoning])]
    -> Output[Compliance_Packet];`);
  const inf = results[0].trace.assertions.find(a => a.assertion === "inference");
  assert.equal(inf.modelVersion, "2026-05-01");
  assert.equal(inf.seed, 7);
  assert.equal(inf.temperature, 0);
});
