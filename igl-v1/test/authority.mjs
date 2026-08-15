/* Authority law (ADR 0002), encoded and tested.
   One principle: structural composition can only narrow (MIN-intersection);
   explicit delegation is the only escalation, and it acts at min(declared,
   resolved) of the target. No arrangement of edges is ever a ladder. */

import { run } from "../src/index.js";
import { IOSPlus, effectiveDelegatedAuthority, AUTHORITY_POLICY } from "../src/iosplus.js";

let passed = 0, failed = 0;
const ok = (n, c, extra = "") => { c ? passed++ : failed++; console.log((c ? "  ok   " : "  FAIL ") + n + (c ? "" : "  [" + extra + "]")); };
function throwsWith(name, fn, code) {
  try { fn(); ok(name, false, "did not throw"); }
  catch (e) { ok(name, !code || e.code === code, "threw " + (e.code || "")); }
}
const fuseUnder = (log) => log.find(x => x.op === "FUSE_UNDER");

// A delegating program: field operator (0.4) reaches compliance (0.85) by an
// explicit DELEGATE TO, and files UNDER compliance.
const delegationProgram = `IGL v1.0 PROGRAM "auth_delegation" ;
IDENTITY {
  DECLARE IDENTITY field_operator AS IDENTITY_OPERAND { id:"igl://identity/allco/operator-014", authority:0.4, boundary:b, propagation: DELEGATE TO "igl://identity/allco/compliance-001" } ;
  DECLARE IDENTITY compliance_officer AS IDENTITY_OPERAND { id:"igl://identity/allco/compliance-001", authority:0.85, boundary:b, propagation:INHERIT } ;
}
CONSTRAINTS {
  DECLARE BOUNDARY b AS BOUNDARY_TENSOR { dimensions:1, shape:[8], jurisdiction:"udm://j/x", strictness:HARD } ;
  DECLARE CONSTRAINT c AS CONSTRAINT_MATRIX { source:"udm://m/x", version:"1.0.0", digest:"x" } ;
}
BEGIN
  INJECT ( c, ctx ) ;
  LET o = AI_INFER("q", ctx) ;
  LET g = FUSE ( o, c ) UNDER compliance_officer ;
  LET t = CAPTURE_TRACE ( g ) INTO ct ;
  LET turn = BIND ( compliance_officer, ct ) AS turn ;
END
RECEIPT { CAPTURE ( turn ) AS r ; }`;

console.log("Authority law:", AUTHORITY_POLICY);
ok("policy names min-intersection and the delegation clamp", /min-intersection/.test(AUTHORITY_POLICY) && /clamped/.test(AUTHORITY_POLICY));

// A. Graphless delegation: declared == resolved, the delegated turn acts at 0.85.
console.log("A. Explicit delegation reaches the target's declared authority");
{
  const res = run(delegationProgram, { seed: 1 });
  const fu = fuseUnder(res.auditLog);
  ok("delegated FUSE was permitted and produced a receipt", !!res.receipt);
  ok("audit records the delegation with both bounds", fu && fu.delegated === true && typeof fu.targetDeclared === "number" && typeof fu.targetResolved === "number");
  ok("acting authority is the declared target level 0.85", fu && fu.actingAuthority === 0.85);
}

// B. No delegation edge: FUSE UNDER a higher authority is refused.
console.log("B. FUSE UNDER a higher authority without delegation is refused");
{
  const refuse = delegationProgram
    .replace('propagation: DELEGATE TO "igl://identity/allco/compliance-001"', "propagation: INHERIT");
  throwsWith("acting below the target with no delegation raises BOUNDARY_VIOLATION", () => run(refuse, { seed: 1 }), "BOUNDARY_VIOLATION");
}

// C. Structural composition is MIN: an edge can never raise, and narrowing flows.
console.log("C. MIN-intersection along INHERITS_FROM");
{
  const g1 = { nodes: { "igl://c/child": { authority: 0.5 }, "igl://c/parent": { authority: 0.9 } },
               edges: [{ type: "INHERITS_FROM", from: "igl://c/child", to: "igl://c/parent" }] };
  const ios1 = new IOSPlus({ graph: g1 });
  ok("child 0.5 under parent 0.9 stays 0.5 (structure never raises)", ios1.resolveAuthority("igl://c/child", g1.nodes["igl://c/child"]) === 0.5);

  const g2 = { nodes: { "igl://c/child": { authority: 0.85 }, "igl://c/parent": { authority: 0.6 } },
               edges: [{ type: "INHERITS_FROM", from: "igl://c/child", to: "igl://c/parent" }] };
  const ios2 = new IOSPlus({ graph: g2 });
  ok("child 0.85 under parent 0.6 narrows to 0.6 (containment)", ios2.resolveAuthority("igl://c/child", g2.nodes["igl://c/child"]) === 0.6);

  const g3 = { nodes: { "a": { authority: 0.9 }, "b": { authority: 0.7 }, "c": { authority: 0.8 } },
               edges: [{ type: "INHERITS_FROM", from: "a", to: "b" }, { type: "INHERITS_FROM", from: "b", to: "c" }] };
  const ios3 = new IOSPlus({ graph: g3 });
  ok("a chain resolves to the minimum along it (0.7)", ios3.resolveAuthority("a", g3.nodes["a"]) === 0.7);
}

// D. Delegation to a structurally narrowed target acts at the narrowed level.
console.log("D. Delegation is clamped by the target's narrowed effective level");
{
  const graph = {
    nodes: {
      "igl://identity/allco/compliance-001": { authority: 0.85 },
      "igl://identity/allco/restricted-parent": { authority: 0.6 },
    },
    edges: [{ type: "INHERITS_FROM", from: "igl://identity/allco/compliance-001", to: "igl://identity/allco/restricted-parent" }],
  };
  const ios = new IOSPlus({ graph });
  const res = run(delegationProgram, { ios });
  const fu = fuseUnder(res.auditLog);
  ok("target declared 0.85 resolves to 0.6 under its restricted parent", fu && fu.targetResolved === 0.6);
  ok("the delegated turn acts at the narrowed 0.6, not the declared 0.85", fu && fu.actingAuthority === 0.6);
  ok("acting never exceeds declared or resolved", fu && fu.actingAuthority <= fu.targetDeclared && fu.actingAuthority <= fu.targetResolved);
}

// E. The clamp function itself.
console.log("E. effectiveDelegatedAuthority bounds");
{
  ok("min(declared 0.85, resolved 0.6) is 0.6", effectiveDelegatedAuthority(0.85, 0.6) === 0.6);
  ok("min(declared 0.85, resolved 0.99) is 0.85", effectiveDelegatedAuthority(0.85, 0.99) === 0.85);
  ok("clamped into [0,1]", effectiveDelegatedAuthority(1.7, 2.0) === 1 && effectiveDelegatedAuthority(-1, 0.5) === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
