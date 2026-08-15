/* Authority policy (ADR 0001, item 3), the decision encoded and tested.
   INHERITS_FROM raises to the max along the chain. DELEGATE TO runs at the
   target's DECLARED authority, clamped so a delegation edge can never borrow the
   target's inherited elevation. The two rules only diverge when a delegated
   target itself inherits higher, and case D is exactly that divergence. */

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

console.log("Authority policy:", AUTHORITY_POLICY);
ok("policy string names both rules", /raise-to-max/.test(AUTHORITY_POLICY) && /min-clamp/.test(AUTHORITY_POLICY));

// A. Graphless delegation: declared == resolved, so the delegated turn acts at 0.85.
console.log("A. Delegation reaches the target's declared authority");
{
  const res = run(delegationProgram, { seed: 1 });
  const fu = fuseUnder(res.auditLog);
  ok("delegated FUSE was permitted and produced a receipt", !!res.receipt);
  ok("audit records the delegation", fu && fu.delegated === true);
  ok("acting authority is the declared target level 0.85", fu && fu.actingAuthority === 0.85);
  ok("with no inheritance, resolved equals declared", fu && fu.targetResolved === 0.85);
}

// B. No delegation edge: FUSE UNDER a higher authority is refused.
console.log("B. FUSE UNDER a higher authority without delegation is refused");
{
  const refuse = delegationProgram
    .replace('propagation: DELEGATE TO "igl://identity/allco/compliance-001"', "propagation: INHERIT");
  throwsWith("acting below the target with no delegation raises BOUNDARY_VIOLATION", () => run(refuse, { seed: 1 }), "BOUNDARY_VIOLATION");
}

// C. INHERITS_FROM raises to the max along the chain.
console.log("C. INHERITS_FROM raise-to-max");
{
  const graph = {
    nodes: {
      "igl://c/child": { authority: 0.5 },
      "igl://c/parent": { authority: 0.9 },
    },
    edges: [{ type: "INHERITS_FROM", from: "igl://c/child", to: "igl://c/parent" }],
  };
  const ios = new IOSPlus({ graph });
  const eff = ios.resolveAuthority("igl://c/child", graph.nodes["igl://c/child"]);
  ok("child 0.5 inheriting parent 0.9 resolves to 0.9", eff === 0.9);
}

// D. The divergence: a delegated target that inherits higher is still clamped to
//    its declared level. Raise-to-max would have handed over the inherited 0.99.
console.log("D. Delegation clamp holds an inheritance-elevated target to its declared level");
{
  const graph = {
    nodes: {
      "igl://identity/allco/compliance-001": { authority: 0.85 },
      "igl://identity/allco/super-001": { authority: 0.99 },
    },
    edges: [{ type: "INHERITS_FROM", from: "igl://identity/allco/compliance-001", to: "igl://identity/allco/super-001" }],
  };
  const ios = new IOSPlus({ graph });
  const res = run(delegationProgram, { ios });
  const fu = fuseUnder(res.auditLog);
  ok("target resolves to the inherited 0.99", fu && fu.targetResolved === 0.99);
  ok("but the delegated turn acts at the declared 0.85 (clamped)", fu && fu.actingAuthority === 0.85);
  ok("min-clamp and raise-to-max genuinely differ here", fu && fu.actingAuthority !== fu.targetResolved);
  ok("effectiveDelegatedAuthority(0.85, 0.99) is 0.85", effectiveDelegatedAuthority(0.85, 0.99) === 0.85);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
