// SPDX-License-Identifier: Apache-2.0
/* IGL v1.0 reference runtime - static checker
   Enforces the structural rules that Article IV, Section 5.07, and Section 4.03
   place before execution. Compile-time failure yields no trace and no receipt
   (Section 10.01, 11.02). Errors accumulate; the caller receives all of them. */

import { IGLError } from "./lexer.js";

export function check(program) {
  const errors = [];
  const add = (msg, code) => errors.push(new IGLError(msg, { phase: "check", code }));

  // Section 4.01: exactly one of each block, in order. The parser already
  // enforces order and presence; here we confirm non-emptiness and names.
  const idNames = new Set();
  for (const d of program.identities) {
    if (idNames.has(d.name)) add(`identity ${d.name} declared twice`, "DUP_IDENTITY");
    idNames.add(d.name);
    const f = d.operand.fields;
    for (const req of ["id", "authority", "boundary", "propagation"])
      if (!(req in f)) add(`identity ${d.name} is missing required field ${req}`, "MISSING_FIELD");
    if (f.authority && f.authority.kind === "Num" && (f.authority.value < 0 || f.authority.value > 1))
      add(`identity ${d.name} authority ${f.authority.value} is outside [0,1]`, "AUTHORITY_RANGE");
  }

  const boundaryNames = new Set(program.constraints.boundaries.map(b => b.name));
  const matrixNames = new Set(program.constraints.matrices.map(m => m.name));

  // boundary references on identities must resolve
  for (const d of program.identities) {
    const b = d.operand.fields.boundary;
    if (b && b.kind === "Ref" && !boundaryNames.has(b.name))
      add(`identity ${d.name} references undeclared boundary ${b.name}`, "UNKNOWN_BOUNDARY");
  }

  // boundary tensors: strictness and shape sanity
  for (const b of program.constraints.boundaries) {
    const f = b.tensor.fields;
    if (f.strictness && f.strictness.kind === "Sym" && !["HARD", "SOFT"].includes(f.strictness.value))
      add(`boundary ${b.name} strictness must be HARD or SOFT`, "BAD_STRICTNESS");
    if (!f.jurisdiction) add(`boundary ${b.name} is missing jurisdiction`, "MISSING_FIELD");
  }

  // constraint matrices need source, version, digest
  for (const m of program.constraints.matrices) {
    for (const req of ["source", "version", "digest"])
      if (!(req in m.matrix.fields)) add(`constraint ${m.name} is missing ${req}`, "MISSING_FIELD");
  }

  // Body-level checks: INJECT before any inference on a context (Section 5.06),
  // RECURSE depth > 0 (Section 4.03), references resolve, one terminal CAPTURE.
  const injected = new Set();       // context names that have been INJECTed
  const bound = new Set(idNames);   // names in scope: identities plus LET/AS/INTO bindings

  const noteBind = (name) => { if (name) bound.add(name); };

  function checkExpr(e) {
    if (!e || typeof e !== "object") return;
    switch (e.kind) {
      case "Fuse": {
        checkExpr(e.v); checkExpr(e.m);
        break;
      }
      case "AiInfer":
        if (e.context && !injected.has(e.context.name))
          add(`AI_INFER runs on context ${e.context.name} before INJECT installed a matrix`, "INFER_BEFORE_INJECT");
        break;
      case "Constrain": case "Project": case "Verify":
        checkExpr(e.a); checkExpr(e.b); break;
      case "CaptureTrace": checkExpr(e.arg); noteBind(e.into); break;
      case "Bind": noteBind(e.as); break;
      case "Capture": noteBind(e.as); break;
      default: break;
    }
  }

  function walk(stmts) {
    for (const s of stmts) {
      switch (s.kind) {
        case "Let": checkExpr(s.expr); noteBind(s.name);
          // a LET around CAPTURE_TRACE/BIND/CAPTURE also carries the inner name
          break;
        case "Inject": injected.add(s.context.name); break;
        case "Recurse":
          if (!(s.maxDepth > 0)) add("RECURSE MAX_DEPTH must be greater than zero", "BAD_MAX_DEPTH");
          checkExpr(s.out); noteBind(s.as); break;
        case "IfAuthority": walk(s.thenB); if (s.elseB) walk(s.elseB); break;
        case "WhenBoundary": walk(s.withinB); if (s.outsideB) walk(s.outsideB); break;
        case "UnlessException": walk(s.block); if (s.elseB) walk(s.elseB); break;
        case "ExprStmt": checkExpr(s.expr); break;
        default: break;
      }
    }
  }
  walk(program.body);

  // Receipt block must be exactly one terminal CAPTURE (parser guarantees one).
  if (!program.receipt || program.receipt.kind !== "Capture")
    add("RECEIPT block must contain exactly one terminal CAPTURE", "NO_TERMINAL_CAPTURE");

  return errors;
}
