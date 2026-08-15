import { Interpreter, IOSPlus, verify, VOCAB } from "../src/index.js";

let passed = 0, failed = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { passed++; console.log("  ok   " + name); }
  else { failed++; console.log("  FAIL " + name + (extra ? "  [" + extra + "]" : "")); }
};

const oneHot = (n, i) => Array.from({ length: n }, (_, k) => (k === i ? 1 : 0));

function program({ strictness = "HARD", receipt = "RECEIPT { CAPTURE ( turn ) AS r ; }", body }) {
  return `IGL v1.0 PROGRAM "boundary-tests" ;
IDENTITY {
  DECLARE IDENTITY a AS IDENTITY_OPERAND { id:"igl://identity/test/a", authority:0.9, boundary:b, propagation:INHERIT } ;
  DECLARE IDENTITY b_actor AS IDENTITY_OPERAND { id:"igl://identity/test/b", authority:0.9, boundary:b, propagation:INHERIT } ;
}
CONSTRAINTS {
  DECLARE BOUNDARY b AS BOUNDARY_TENSOR { dimensions:1, shape:[8], jurisdiction:"udm://juris/test", strictness:${strictness} } ;
  DECLARE CONSTRAINT c AS CONSTRAINT_MATRIX { source:"udm://m/x", version:"1.0.0", digest:"x" } ;
}
BEGIN
${body}
END
${receipt}`;
}

function minCeilingIndex(ios, tight = true) {
  const tensor = { fields: { jurisdiction: { kind: "Str", value: "udm://juris/test" } } };
  const ceilings = ios.ceilingsFor(tensor, { tight });
  const blocked = new Set(["deny", "redact", "ABSTAIN"]);
  let idx = VOCAB.findIndex(t => !blocked.has(t));
  for (let i = 0; i < ceilings.length; i++) {
    if (blocked.has(VOCAB[i])) continue;
    if (ceilings[i] < ceilings[idx]) idx = i;
  }
  return idx < 0 ? 0 : idx;
}

console.log("A. HARD boundary violation halts, seals partial trace, and signs nothing");
{
  const ios = new IOSPlus({ offline: true });
  const idx = minCeilingIndex(ios, true);
  const interp = new Interpreter({
    ios,
    offline: true,
    boundaryMode: "tight",
    invoke: () => ({ dist: oneHot(8, idx) }),
  });
  let result = null, err = null;
  try {
    result = interp.run(program({
      strictness: "HARD",
      body: `  INJECT ( c, ctx ) ;
  LET g = FUSE ( AI_INFER("q", ctx), c ) ;
  LET t = CAPTURE_TRACE ( g ) INTO ct ;
  LET turn = BIND ( a, ct ) AS turn ;`,
    }));
  } catch (e) { err = e; }
  const partial = ios.traceStore.find(t => t.trace && t.trace.partial);
  ok("HARD violation throws BOUNDARY_VIOLATION", err?.code === "BOUNDARY_VIOLATION", err?.code || "");
  ok("partial trace is sealed", !!partial?.trace?.sealed && partial.trace.partial === true);
  ok("no signed receipt is issued", !result?.receipt?.signature);
}

console.log("B. SOFT violation continues and records boundaryLog");
{
  const ios = new IOSPlus({ offline: true });
  const idx = minCeilingIndex(ios, true);
  const interp = new Interpreter({
    ios,
    offline: true,
    boundaryMode: "tight",
    invoke: () => ({ dist: oneHot(8, idx) }),
  });
  const r = interp.run(program({
    strictness: "SOFT",
    body: `  INJECT ( c, ctx ) ;
  LET g = FUSE ( AI_INFER("q", ctx), c ) ;
  LET t = CAPTURE_TRACE ( g ) INTO ct ;
  LET turn = BIND ( a, ct ) AS turn ;`,
  }));
  const trace = r.traces.find(t => Array.isArray(t.trace.boundaryLog) && t.trace.boundaryLog.length > 0)?.trace;
  const log = trace?.boundaryLog?.[0] || {};
  ok("run completes with signed receipt", !!r.receipt.signature);
  ok("outcome is SOFT_VIOLATION", r.receipt.outcome === "SOFT_VIOLATION", r.receipt.outcome);
  ok("boundaryLog entry carries dimension/ceiling/observed/class",
    typeof log.dimension === "string" && typeof log.ceiling === "number" && typeof log.observedMass === "number" && log.class === "SOFT_VIOLATION");
}

console.log("C. Compliant run still signs a verifying receipt");
{
  const r = new Interpreter({ offline: true, boundaryMode: "normal" }).run(program({
    strictness: "HARD",
    body: `  INJECT ( c, ctx ) ;
  LET g = FUSE ( AI_INFER("q", ctx), c ) ;
  LET t = CAPTURE_TRACE ( g ) INTO ct ;
  LET turn = BIND ( a, ct ) AS turn ;`,
  }));
  ok("receipt remains COMPLIANT", r.receipt.outcome === "COMPLIANT", r.receipt.outcome);
  ok("receipt verifies", verify(r.receipt).ok);
}

console.log("D. WHEN_BOUNDARY can reach OUTSIDE on computed violation");
{
  const ios = new IOSPlus({ offline: true });
  const idx = minCeilingIndex(ios, true);
  const interp = new Interpreter({
    ios,
    offline: true,
    boundaryMode: "tight",
    invoke: () => ({ dist: oneHot(8, idx) }),
  });
  const r = interp.run(program({
    strictness: "SOFT",
    body: `  INJECT ( c, ctx ) ;
  LET g = FUSE ( AI_INFER("q", ctx), c ) ;
  LET t = CAPTURE_TRACE ( g ) INTO ct ;
  WHEN_BOUNDARY ( b, c ) WITHIN {
    LET final_turn = BIND ( a, ct ) AS turn_within ;
  } OUTSIDE {
    LET final_turn = BIND ( b_actor, ct ) AS turn_outside ;
  }
  LET turn = final_turn ;`,
  }));
  ok("OUTSIDE branch selected", r.receipt.boundIdentity === "igl://identity/test/b", r.receipt.boundIdentity);
}

console.log("E. WITH_OUTCOME mismatch is rejected and no receipt is signed");
{
  const ios = new IOSPlus({ offline: true });
  const idx = minCeilingIndex(ios, true);
  const interp = new Interpreter({
    ios,
    offline: true,
    boundaryMode: "tight",
    invoke: () => ({ dist: oneHot(8, idx) }),
  });
  let result = null, err = null;
  try {
    result = interp.run(program({
      strictness: "SOFT",
      receipt: "RECEIPT { CAPTURE ( turn ) AS r WITH_OUTCOME COMPLIANT ; }",
      body: `  INJECT ( c, ctx ) ;
  LET g = FUSE ( AI_INFER("q", ctx), c ) ;
  LET t = CAPTURE_TRACE ( g ) INTO ct ;
  LET turn = BIND ( a, ct ) AS turn ;`,
    }));
  } catch (e) { err = e; }
  ok("mismatch raises OUTCOME_ASSERTION_MISMATCH", err?.code === "OUTCOME_ASSERTION_MISMATCH", err?.code || "");
  ok("no signed receipt is issued", !result?.receipt?.signature);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
