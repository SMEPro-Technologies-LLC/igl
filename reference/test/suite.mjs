/* Battle-testing suite for the IGL v1.0 reference runtime.
   Positive conformance plus the negative and adversarial cases that a governed
   language has to survive: tamper detection, fail-closed behaviour, support
   restriction, delegation denial, and static rejection. */

import { readFileSync } from "node:fs";
import { run, verify, recomputeFuse } from "../src/index.js";
import { Interpreter } from "../src/interpreter.js";
import { VOCAB } from "../src/iosplus.js";

let passed = 0, failed = 0;
function ok(name, cond, extra = "") {
  if (cond) { passed++; console.log("  ok   " + name); }
  else { failed++; console.log("  FAIL " + name + (extra ? "  [" + extra + "]" : "")); }
}
function throwsWith(name, fn, code) {
  try { fn(); ok(name, false, "did not throw"); }
  catch (e) {
    const hit = !code || e.code === code || (e.errors && e.errors.some(x => x.code === code));
    ok(name, hit, "threw " + (e.code || "") + (e.errors ? " / " + e.errors.map(x => x.code).join(",") : ""));
  }
}

const prog = (body) => `IGL v1.0 PROGRAM "t" ;
IDENTITY { DECLARE IDENTITY a AS IDENTITY_OPERAND { id:"igl://identity/x/a", authority:0.9, boundary:b, propagation:INHERIT } ; }
CONSTRAINTS {
  DECLARE BOUNDARY b AS BOUNDARY_TENSOR { dimensions:1, shape:[8], jurisdiction:"udm://j/x", strictness:HARD } ;
  DECLARE CONSTRAINT c AS CONSTRAINT_MATRIX { source:"udm://m/x", version:"1.0.0", digest:"x" } ;
}
BEGIN
${body}
END
RECEIPT { CAPTURE ( turn ) AS r ; }`;

console.log("A. Positive conformance (Schedule C + WellSite)");
{
  const files = { WellSite: "../programs/wellsite.igl" };
  // samples are exercised by test/samples.mjs; here confirm WellSite end to end
  const src = readFileSync(new URL(files.WellSite, import.meta.url), "utf8");
  const r = run(src, { seed: 7 });
  ok("WellSite executes and issues a receipt", !!r.receipt.signature);
  ok("WellSite receipt verifies", verify(r.receipt).ok);
  const f = r.traces.map(t => t.trace.fuse).find(Boolean);
  ok("WellSite FUSE recomputes independently", recomputeFuse(f).ok);
  ok("terminal receipt bound to compliance identity (escalation happened)",
    r.receipt.boundIdentity === "igl://identity/allco/compliance-001", r.receipt.boundIdentity);
}

console.log("B. Support restriction (Section 5.01)");
{
  const src = prog(`  INJECT ( c, ctx ) ;
  LET o = AI_INFER("q", ctx) ;
  LET g = FUSE ( o, c ) ;
  LET t = CAPTURE_TRACE ( g ) INTO ct ;
  LET turn = BIND ( a, ct ) AS turn ;`);
  const r = run(src, { seed: 7 });
  const fuse = r.traces.map(t => t.trace.fuse).find(Boolean);
  const denyIdx = VOCAB.indexOf("deny"), redactIdx = VOCAB.indexOf("redact");
  ok("forbidden token 'deny' has zero mass", fuse.outputDist[denyIdx] === 0);
  ok("forbidden token 'redact' has zero mass", fuse.outputDist[redactIdx] === 0);
  ok("distribution sums to one", Math.abs(fuse.outputDist.reduce((x, y) => x + y, 0) - 1) < 1e-6);
}

console.log("C. Fail-closed: zero partition (Section 5.01 / point-of-inflection.md)");
{
  const interp = new Interpreter({ seed: 1 });
  const allZero = { cells: VOCAB.map(() => 0), digest: "z" };
  throwsWith("every-token-forbidden raises PROJECTION_FAILURE",
    () => interp.fuseDist(VOCAB.map(() => 1 / VOCAB.length), allZero, {}, interp.ios, null), "PROJECTION_FAILURE");
}

console.log("D. Tamper evidence on the receipt");
{
  const src = readFileSync(new URL("../programs/wellsite.igl", import.meta.url), "utf8");
  const r = run(src, { seed: 7 });
  ok("clean receipt verifies", verify(r.receipt).ok);
  const flippedOutcome = { ...r.receipt, outcome: "VIOLATION" };
  ok("flipping outcome breaks verification", verify(flippedOutcome).ok === false);
  const flippedIdentity = { ...r.receipt, boundIdentity: "igl://identity/attacker" };
  ok("swapping bound identity breaks verification", verify(flippedIdentity).ok === false);
  const flippedDigest = { ...r.receipt, constraintMatrixDigest: "deadbeef" };
  ok("altering the constraint digest breaks verification", verify(flippedDigest).ok === false);
}

console.log("E. Tamper evidence on the FUSE record");
{
  const src = readFileSync(new URL("../programs/wellsite.igl", import.meta.url), "utf8");
  const r = run(src, { seed: 7 });
  const fuse = r.traces.map(t => t.trace.fuse).find(Boolean);
  ok("clean FUSE record recomputes", recomputeFuse(fuse).ok);
  const doctored = { ...fuse, outputDist: fuse.outputDist.map((x, i) => i === 0 ? Math.min(1, x + 0.1) : x) };
  ok("editing the governed output is caught", recomputeFuse(doctored).ok === false);
}

console.log("F. Delegation and authority (Section 5.01, 8.02)");
{
  // FUSE UNDER a higher authority without a delegation must be refused
  const noDelegate = `IGL v1.0 PROGRAM "t" ;
IDENTITY {
  DECLARE IDENTITY low AS IDENTITY_OPERAND { id:"igl://identity/x/low", authority:0.3, boundary:b, propagation:INHERIT } ;
  DECLARE IDENTITY high AS IDENTITY_OPERAND { id:"igl://identity/x/high", authority:0.9, boundary:b, propagation:INHERIT } ;
}
CONSTRAINTS {
  DECLARE BOUNDARY b AS BOUNDARY_TENSOR { dimensions:1, shape:[8], jurisdiction:"udm://j/x", strictness:HARD } ;
  DECLARE CONSTRAINT c AS CONSTRAINT_MATRIX { source:"udm://m/x", version:"1.0.0", digest:"x" } ;
}
BEGIN
  INJECT ( c, ctx ) ;
  LET o = AI_INFER("q", ctx) ;
  LET g = FUSE ( o, c ) UNDER high ;
  LET t = CAPTURE_TRACE ( g ) INTO ct ;
  LET turn = BIND ( high, ct ) AS turn ;
END
RECEIPT { CAPTURE ( turn ) AS r ; }`;
  throwsWith("FUSE UNDER higher authority without delegation is refused", () => run(noDelegate, { seed: 1 }), "BOUNDARY_VIOLATION");
}

console.log("G. Static rejection before execution (Article IV, Section 4.03, 5.06)");
{
  throwsWith("RECURSE MAX_DEPTH 0 is a compile-time error",
    () => run(prog(`  INJECT ( c, ctx ) ;
  LET g = FUSE ( AI_INFER("q", ctx), c ) ;
  RECURSE ( g, ctx ) MAX_DEPTH 0 CARRYING a AS turn ;`)), "BAD_MAX_DEPTH");

  throwsWith("AI_INFER on a context before INJECT is rejected",
    () => run(prog(`  LET o = AI_INFER("q", ctx) ;
  LET g = FUSE ( o, c ) ;
  LET t = CAPTURE_TRACE ( g ) INTO ct ;
  LET turn = BIND ( a, ct ) AS turn ;`)), "INFER_BEFORE_INJECT");

  throwsWith("missing IDENTITY block fails to parse",
    () => run(`IGL v1.0 PROGRAM "t" ;\nCONSTRAINTS { DECLARE CONSTRAINT c AS CONSTRAINT_MATRIX { source:"s", version:"1.0.0", digest:"x" } ; }\nBEGIN\n  LET x = AI_INFER("q") ;\nEND\nRECEIPT { CAPTURE ( x ) AS r ; }`));
}

console.log("H. Governed Context and injection (Section 5.06)");
{
  const clean = prog(`  INJECT ( c, ctx ) ;
  LET g = FUSE ( AI_INFER("q", ctx), c ) ;
  LET t = CAPTURE_TRACE ( g ) INTO ct ;
  LET turn = BIND ( a, ct ) AS turn ;`);
  const r = run(clean, { seed: 3 });
  ok("single INJECT then FUSE is COMPLIANT", r.receipt.outcome === "COMPLIANT");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
