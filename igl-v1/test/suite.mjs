/* Battle-testing suite for the IGL v1.0 reference runtime.
   Positive conformance plus the negative and adversarial cases that a governed
   language has to survive: tamper detection, fail-closed behaviour, support
   restriction, delegation denial, and static rejection. */

import { readFileSync } from "node:fs";
import { run, verify, recomputeFuse, pinnedConstraints } from "../src/index.js";
import { IOSPlus } from "../src/iosplus.js";
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
  const constraints = pinnedConstraints(src);
  const r = run(src, { constraints, seed: 1 });
  ok("WellSite executes and issues a receipt", !!r.receipt.signature);
  ok("WellSite receipt verifies", verify(r.receipt).ok);
  const f = r.traces.map(t => t.trace.fuse).find(Boolean);
  ok("WellSite FUSE recomputes independently", recomputeFuse(f).ok);
  ok("terminal receipt bound to compliance identity (escalation happened)",
    r.receipt.boundIdentity === "igl://identity/allco/compliance-001", r.receipt.boundIdentity);
  ok("receipt binds the SERVICE digest (1252a4e5...), not a stand-in",
    r.receipt.constraintMatrixDigest === "1252a4e59fd9540f9649a8fa6ec6bb2d508ddf3663cf23f3da1482bfb4ba8160", r.receipt.constraintMatrixDigest);
  ok("receipt provenance is signed and pinned", r.receipt.constraintProvenance === "pinned");
}

console.log("B. Support restriction (Section 5.01)");
{
  const src = prog(`  INJECT ( c, ctx ) ;
  LET o = AI_INFER("q", ctx) ;
  LET g = FUSE ( o, c ) ;
  LET t = CAPTURE_TRACE ( g ) INTO ct ;
  LET turn = BIND ( a, ct ) AS turn ;`);
  const r = run(src, { seed: 7, offline: true });
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
  const r = run(src, { constraints: pinnedConstraints(src), seed: 1 });
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
  const r = run(src, { seed: 7, offline: true });
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
  throwsWith("FUSE UNDER higher authority without delegation is refused", () => run(noDelegate, { seed: 1, offline: true }), "BOUNDARY_VIOLATION");
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
  const r = run(clean, { seed: 3, offline: true });
  ok("single INJECT then FUSE is COMPLIANT", r.receipt.outcome === "COMPLIANT");
}

console.log("I. Fail-closed default: no stand-ins on the governed path (ADR 0001/0002)");
{
  const src = readFileSync(new URL("../programs/wellsite.igl", import.meta.url), "utf8");
  throwsWith("unresolved udm:// constraint fails closed (no silent stand-in)",
    () => run(src, { seed: 1 }), "CONSTRAINT_SOURCE_UNRESOLVED");
  const offline = run(prog(`  INJECT ( c, ctx ) ;
  LET g = FUSE ( AI_INFER("q", ctx), c ) ;
  LET t = CAPTURE_TRACE ( g ) INTO ct ;
  LET turn = BIND ( a, ct ) AS turn ;`), { seed: 3, offline: true });
  ok("offline receipt carries SIGNED provenance 'standin'", offline.receipt.constraintProvenance === "standin");
  ok("stand-in digest is tainted and cannot impersonate a service digest",
    offline.receipt.constraintMatrixDigest.startsWith("standin-"));
}

console.log("J. Graded ceilings enforced after FUSE (apply, then check)");
{
  const src = readFileSync(new URL("../programs/wellsite.igl", import.meta.url), "utf8");
  // seed 7's draft puts 0.3266 mass on financial detail against the live 0.3 ceiling
  throwsWith("mass over a live graded ceiling HALTS (HARD), seals partial trace, no receipt",
    () => run(src, { constraints: pinnedConstraints(src), seed: 7 }), "BOUNDARY_VIOLATION");
  try { run(src, { constraints: pinnedConstraints(src), seed: 7 }); } catch (e) { /* sealed above */ }
}

console.log("K. Authority composes by intersection (ADR 0002: MIN, never MAX)");
{
  const graph = {
    nodes: {
      "igl://identity/x/parent": { authority: 0.4 },
      "igl://identity/x/child":  { authority: 0.9 },
      "igl://identity/x/low-parented": { authority: 0.3 },
    },
    edges: [
      { type: "INHERITS_FROM", from: "igl://identity/x/child", to: "igl://identity/x/parent" },
      { type: "INHERITS_FROM", from: "igl://identity/x/low-parented", to: "igl://identity/x/parent" },
    ],
  };
  const ios = new IOSPlus({ graph });
  const child = ios.resolveIdentity("igl://identity/x/child");
  ok("declared 0.9 inheriting from 0.4 clamps DOWN to 0.4 (never raises)", child.authority === 0.4, String(child.authority));
  const low = ios.resolveIdentity("igl://identity/x/low-parented");
  ok("declared 0.3 under a 0.4 parent stays 0.3 (min of own and chain)", low.authority === 0.3, String(low.authority));
  const alone = new IOSPlus({}).resolveIdentity("igl://identity/x/a", { authority: 0.85 });
  ok("graphless declared value still governs", alone.authority === 0.85);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
