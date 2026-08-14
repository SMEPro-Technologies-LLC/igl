/* Prove the model seam: run a governed program with a distribution supplied by
   an adapter rather than the built-in stand-in, and confirm the receipt verifies
   and the FUSE step recomputes. This is where a real model attaches. */

import { run, verify, recomputeFuse } from "../src/index.js";
import { logprobsAdapter, logitsAdapter, uniformAdapter } from "../src/adapters.js";

const src = `IGL v1.0 PROGRAM "adapter_demo" ;
IDENTITY { DECLARE IDENTITY a AS IDENTITY_OPERAND { id:"igl://identity/x/a", authority:0.9, boundary:b, propagation:INHERIT } ; }
CONSTRAINTS {
  DECLARE BOUNDARY b AS BOUNDARY_TENSOR { dimensions:1, shape:[8], jurisdiction:"udm://j/x", strictness:HARD } ;
  DECLARE CONSTRAINT c AS CONSTRAINT_MATRIX { source:"udm://m/x", version:"1.0.0", digest:"x" } ;
}
BEGIN
  INJECT ( c, ctx ) ;
  LET o = AI_INFER("draft the report", ctx) ;
  LET g = FUSE ( o, c ) ;
  LET t = CAPTURE_TRACE ( g ) INTO ct ;
  LET turn = BIND ( a, ct ) AS turn ;
END
RECEIPT { CAPTURE ( turn ) AS r WITH_OUTCOME COMPLIANT ; }`;

let passed = 0, failed = 0;
const ok = (n, c) => { c ? passed++ : failed++; console.log((c ? "  ok   " : "  FAIL ") + n); };

// A stand-in "hosted model" that returns log-probabilities over the options it
// was asked to choose among. In a real system these come from the model API.
const fakeHostedModel = () => ({ report: -0.2, summarize: -0.9, file: -1.4, allow: -2.0, escalate: -3.0 });

for (const [name, adapter] of [
  ["logprobsAdapter", logprobsAdapter(fakeHostedModel)],
  ["logitsAdapter", logitsAdapter((tok) => (tok === "report" ? 3 : tok === "summarize" ? 2 : 1))],
  ["uniformAdapter", uniformAdapter()],
]) {
  const r = run(src, { invoke: adapter, seed: 1 });
  const fuse = r.traces.map(t => t.trace.fuse).find(Boolean);
  ok(`${name}: receipt verifies`, verify(r.receipt).ok);
  ok(`${name}: FUSE recomputes`, recomputeFuse(fuse).ok);
  ok(`${name}: forbidden tokens still zeroed`, fuse.outputDist[1] === 0 && fuse.outputDist[5] === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
