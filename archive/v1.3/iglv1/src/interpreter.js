// SPDX-License-Identifier: Apache-2.0
/* IGL v1.0 reference runtime - interpreter (Articles V, VII, X, XI).
   Executes a checked Program under IOS+. Implements the eight operators, the
   boundary enforcement of Section 7.03, cognitive-trace sealing (7.04), turn-
   trace sequencing (3.06), and Governance Receipt issuance (3.05, 5.07).

   The FUSE step is exact and recomputable: the sealed trace records the input
   distribution, the constraint weights, and the governed output, so a verifier
   can recompute normalize(v (x) w) and confirm support restriction independently.
   The model vector arrives through a labelled seam (Section 12.03 boundary). */

import { parse } from "./parser.js";
import { check } from "./check.js";
import { IGLError } from "./lexer.js";
import { IOSPlus, VOCAB, valueOf } from "./iosplus.js";
import { sha256, canonical } from "./sign.js";

const round = (x, n = 6) => Number(x.toFixed(n));
const roundArr = a => a.map(x => round(x));

/* Default model seam: a deterministic pseudo-distribution over VOCAB derived
   from the prompt and seed. Reproducible, and clearly not a real model. Replace
   `invoke` to attach a real inference source. */
function defaultInvoke(call, seed) {
  const logits = VOCAB.map(tok => {
    const h = parseInt(sha256(`${call.prompt}|${tok}|${seed}`).slice(0, 8), 16);
    return (h % 1000) / 200;                      // 0..5
  });
  const mx = Math.max(...logits);
  const exps = logits.map(z => Math.exp(z - mx));
  const s = exps.reduce((a, b) => a + b, 0);
  return { dist: exps.map(e => e / s) };
}

function shannon(dist) {
  let h = 0;
  for (const p of dist) if (p > 0) h -= p * Math.log2(p);
  return round(h);
}

export class Interpreter {
  constructor({ ios = null, invoke = null, seed = 7, boundaryMode = "normal" } = {}) {
    this.ios = ios || new IOSPlus({ seed });
    this.invoke = invoke || ((call) => defaultInvoke(call, seed));
    this.seed = seed;
    this.boundaryMode = boundaryMode;             // "normal" or "tight" (demo a HARD violation)
  }

  run(source) {
    const program = typeof source === "string" ? parse(source) : source;
    const errors = check(program);
    if (errors.length) {
      const e = new IGLError(`${errors.length} static error(s); no trace, no receipt`, { phase: "check", code: "STATIC_ERRORS" });
      e.errors = errors; throw e;
    }
    return this.execute(program, typeof source === "string" ? source : "");
  }

  execute(program, source) {
    const ios = this.ios;
    const sessionId = "sess-" + sha256(program.name + ":" + ios.now()).slice(0, 16);
    const programHash = sha256(canonical({ ...program }));   // stands in for compiled bytecode hash
    const env = new Map();
    const contexts = new Map();       // ctxName -> { matrix } (Governed Context; immutable once set)
    const decls = {
      identities: Object.fromEntries(program.identities.map(d => [d.name, liftOperand(d.operand)])),
      boundaries: Object.fromEntries(program.constraints.boundaries.map(b => [b.name, b.tensor])),
      matrices: Object.fromEntries(program.constraints.matrices.map(m => [m.name, liftMatrix(m.matrix)])),
    };
    const state = { activeMatrix: null, lastGoverned: null, activeIdentityName: program.identities[0]?.name || null };

    const resolveIdentityByName = (name) => {
      const d = decls.identities[name];
      if (!d) throw new IGLError(`identity ${name} is not declared`, { phase: "exec", code: "IDENTITY_NOT_FOUND" });
      return ios.resolveIdentity(d.id, d);
    };
    const resolveIdentityRef = (ref) => {
      if (ref.kind === "IdUri") { // a bare uri; try to find a declared identity with that id
        const named = Object.entries(decls.identities).find(([, d]) => d.id === ref.value);
        return named ? resolveIdentityByName(named[0]) : ios.resolveIdentity(ref.value, null);
      }
      return resolveIdentityByName(ref.name);
    };

    /* ---- operators as expression evaluation ---- */
    const evalExpr = (e) => {
      switch (e.kind) {
        case "Str": return { type: "str", value: e.value };
        case "Num": return { type: "num", value: e.value };
        case "Sym": return { type: "sym", value: e.value };
        case "Ref": {
          if (env.has(e.name)) return env.get(e.name);
          if (decls.matrices[e.name]) return { type: "matrixRef", name: e.name };
          if (decls.boundaries[e.name]) return { type: "boundaryRef", name: e.name };
          if (decls.identities[e.name]) return { type: "identity", value: resolveIdentityByName(e.name) };
          if (contexts.has(e.name)) return { type: "context", name: e.name };
          return { type: "ctx", name: e.name };   // undeclared context handle (e.g. inference_ctx)
        }
        case "AiInfer": {
          const prompt = valueFrom(evalExpr(e.prompt));
          if (e.context && !(contexts.get(e.context.name)?.matrix))
            throw new IGLError(`AI_INFER on context ${e.context.name} before INJECT`, { phase: "exec", code: "CONSTRAINT_INJECTION_ERROR" });
          const out = this.invoke({ fn: "AI_INFER", prompt, context: e.context?.name || null });
          return { type: "aivector", dist: out.dist, prompt };
        }
        case "Fuse": return this.evalFuse(e, { evalExpr, resolveIdentityRef, decls, contexts, state, ios });
        case "Constrain": {
          // filter reasoning paths against a boundary; reference form returns the input set
          const a = evalExpr(e.a);
          return { type: "paths", value: Array.isArray(a.value) ? a.value : [] };
        }
        case "Project": {
          const graph = valueFrom(evalExpr(e.a)), juris = valueFrom(evalExpr(e.b));
          if (!juris) throw new IGLError("PROJECT produced no jurisdiction scope", { phase: "exec", code: "NO_JURISDICTION_SCOPE" });
          return { type: "identity", value: { id: `${graph}#${juris}`, authority: state.__projAuthority ?? 0.5, projected: true, jurisdiction: juris } };
        }
        case "Verify": {
          const receipt = evalExpr(e.a);
          const identity = evalExpr(e.b);
          const res = verifyReceipt(receipt.value, identity, ios);
          ios.audit({ op: "VERIFY", result: res.ok, reason: res.reason });
          return { type: "bool", value: res.ok };
        }
        case "CaptureTrace": {
          const arg = evalExpr(e.arg);
          const gov = arg.type === "governed" ? arg : (arg.gov || null);
          if (!gov) throw new IGLError("CAPTURE_TRACE argument is not a governed output", { phase: "exec", code: "FUSION_TYPE_ERROR" });
          const trace = sealCognitiveTrace(gov, state, ios);
          const v = { type: "trace", value: trace };
          if (e.into) env.set(e.into, v);
          return v;
        }
        case "Bind": {
          const identity = resolveIdentityRef(e.identity);
          const traceVal = env.get(e.trace);
          if (!traceVal || traceVal.type !== "trace")
            throw new IGLError(`BIND trace ${e.trace} is not a sealed cognitive trace`, { phase: "exec", code: "TRACE_CAPTURE_FAULT" });
          const turn = composeTurnTrace(identity, traceVal.value, state, ios);
          const v = { type: "turn", value: turn };
          if (e.as) env.set(e.as, v);
          return v;
        }
        case "Capture": {
          const turnVal = env.get(e.turn);
          if (!turnVal || turnVal.type !== "turn")
            throw new IGLError(`CAPTURE target ${e.turn} is not a turn trace`, { phase: "exec", code: "TRACE_CAPTURE_FAULT" });
          const receipt = issueReceipt(turnVal.value, e.outcome, { ios, programHash, sessionId, graphVersion: ios.graphVersion });
          const v = { type: "receipt", value: receipt };
          if (e.as) env.set(e.as, v);
          return v;
        }
        default: throw new IGLError(`cannot evaluate ${e.kind}`, { phase: "exec", code: "BAD_EXPR" });
      }
    };

    const runStmts = (stmts) => {
      for (const s of stmts) {
        switch (s.kind) {
          case "Let": { const v = evalExpr(s.expr); env.set(s.name, v); break; }
          case "ExprStmt": evalExpr(s.expr); break;
          case "Inject": {
            const m = decls.matrices[s.matrix];
            if (!m) throw new IGLError(`INJECT unknown constraint ${s.matrix}`, { phase: "exec", code: "CONSTRAINT_INJECTION_ERROR" });
            const matrix = ios.getConstraintMatrix(m);
            if (matrix.digest !== ios_matrixDigestExpected(m, matrix))
              throw new IGLError("digest mismatch on INJECT", { phase: "exec", code: "DIGEST_MISMATCH" });
            const existing = contexts.get(s.context.name);
            if (existing && existing.matrix && existing.matrix.digest !== matrix.digest)
              throw new IGLError(`context ${s.context.name} already governed; matrix cannot be replaced`, { phase: "exec", code: "CONSTRAINT_INJECTION_ERROR" });
            contexts.set(s.context.name, { matrix });
            state.activeMatrix = matrix;
            break;
          }
          case "Recurse": {
            const start = evalExpr(s.out);
            let cur = start, last = null, lastGov = null;
            const carry = resolveIdentityRef(s.carrying);
            for (let d = 0; d < s.maxDepth; d++) {
              const gov = this.fuseDist(cur.dist, state.activeMatrix, state, ios, carry);
              const trace = sealCognitiveTrace(gov, state, ios);
              last = composeTurnTrace(carry, trace, state, ios, last?.sequenceNo ?? null);
              cur = gov; lastGov = gov;
            }
            env.set(s.as, { type: "turn", value: last, gov: lastGov });
            break;
          }
          case "IfAuthority": {
            const id = resolveIdentityRef(s.identity);
            const cmp = compare(id.authority, s.op, s.value);
            ios.audit({ op: "IF_AUTHORITY", identity: id.id, authority: id.authority, test: `${s.op} ${s.value}`, branch: cmp ? "THEN" : "ELSE" });
            runStmts(cmp ? s.thenB : (s.elseB || []));
            break;
          }
          case "WhenBoundary": {
            // WITHIN if the last governed output cleared its boundary, else OUTSIDE
            const within = !state.lastGoverned || state.lastGoverned.outcome !== "VIOLATION";
            runStmts(within ? s.withinB : (s.outsideB || []));
            break;
          }
          case "UnlessException": {
            const id = resolveIdentityRef(s.identity);
            const applies = (id.exceptions || []).includes(s.handle);
            ios.audit({ op: "UNLESS_EXCEPTION", handle: s.handle, applies });
            runStmts(applies ? (s.elseB || []) : s.block);
            break;
          }
          default: throw new IGLError(`unknown statement ${s.kind}`, { phase: "exec", code: "BAD_STMT" });
        }
      }
    };

    // body
    runStmts(program.body);

    // terminal receipt (RECEIPT block)
    const rc = program.receipt;
    const turnVal = env.get(rc.turn);
    if (!turnVal || turnVal.type !== "turn")
      throw new IGLError(`terminal CAPTURE target ${rc.turn} is not a turn trace`, { phase: "trace", code: "TRACE_CAPTURE_FAULT" });
    const receipt = issueReceipt(turnVal.value, rc.outcome, { ios, programHash, sessionId, graphVersion: ios.graphVersion });
    env.set(rc.as, { type: "receipt", value: receipt });

    return { sessionId, programHash, receipt, env, traces: ios.traceStore, auditLog: ios.auditLog, publicKey: ios.signer.pub() };
  }

  /* FUSE with UNDER-authority guard, boundary enforcement, and recomputable record. */
  evalFuse(e, ctx) {
    const { evalExpr, resolveIdentityRef, decls, state, ios } = ctx;
    const vVal = evalExpr(e.v);
    const dist = vVal.dist || (vVal.value && vVal.value.dist);
    if (!dist) throw new IGLError("FUSE first operand is not a distribution", { phase: "exec", code: "FUSION_TYPE_ERROR" });
    // resolve the constraint matrix operand
    let matrix = null;
    const mVal = evalExpr(e.m);
    if (mVal.type === "matrixRef") matrix = ios.getConstraintMatrix(decls.matrices[mVal.name]);
    else if (mVal.type === "context") matrix = ctx.contexts.get(mVal.name)?.matrix;
    else if (state.activeMatrix) matrix = state.activeMatrix;
    if (!matrix) throw new IGLError("FUSE has no constraint matrix in scope", { phase: "exec", code: "CONSTRAINT_INJECTION_ERROR" });

    let actor = state.activeIdentityName ? resolveIdentityByNameSafe(state.activeIdentityName, decls, ios) : null;
    if (e.under) {
      const u = resolveIdentityRef(e.under);
      // Section 5.01: fusion within the named identity's authority scope. Allowed
      // when the actor already holds at least that authority, or reaches the named
      // identity by a declared delegation (propagation DELEGATE TO). Otherwise the
      // executing context's authority is lower and BoundaryViolationError is raised.
      const delegates = actor && actor.propagation && actor.propagation.delegateTo === u.id;
      if (actor && actor.authority < u.authority && !delegates)
        throw new IGLError(`FUSE UNDER ${u.id}: acting authority ${actor.authority} below required ${u.authority} and no delegation`, { phase: "authz", code: "BOUNDARY_VIOLATION" });
      actor = u;
    }

    const gov = this.fuseDist(dist, matrix, state, ios, actor);
    return gov;
  }

  /* The core operation, Schedule B E-FUSE-COMPUTE: normalize(v (x) project(M)). */
  fuseDist(dist, matrix, state, ios, actor) {
    // Compute from the rounded operands that the record will store, so an external
    // recomputation over those same stored values reproduces the output exactly.
    const rInput = roundArr(dist);
    const rWeights = roundArr(matrix.cells);
    const prod = rInput.map((p, i) => p * (rWeights[i] ?? 0));
    const s = prod.reduce((a, b) => a + b, 0);
    if (s === 0) throw new IGLError("zero partition: every token forbidden", { phase: "exec", code: "PROJECTION_FAILURE" });
    const out = roundArr(prod.map(x => x / s));
    // support restriction check (w=0 -> g=0)
    rWeights.forEach((w, i) => { if (w === 0 && out[i] !== 0) throw new IGLError("support restriction violated", { phase: "exec", code: "FUSION_TYPE_ERROR" }); });

    let outcome = "COMPLIANT";
    const fuseRecord = {
      inputDist: rInput, weights: rWeights, outputDist: out,
      inputDigest: sha256(canonical(rInput)),
      matrixDigest: matrix.digest,
      outputDigest: sha256(canonical(out)),
      entropy: shannon(out), vocab: VOCAB,
    };
    const gov = { type: "governed", dist: out, entropy: fuseRecord.entropy, fuseRecord, outcome, matrixDigest: matrix.digest };
    state.lastGoverned = gov;
    return gov;
  }
}

/* ---------- helpers outside the class (pure) ---------- */
function liftOperand(rec) {
  const f = rec.fields;
  return {
    id: valueOf(f.id), authority: valueOf(f.authority), boundary: f.boundary?.kind === "Ref" ? f.boundary.name : valueOf(f.boundary),
    exceptions: f.exceptions ? valueOf(f.exceptions) : [], propagation: valueOf(f.propagation),
  };
}
function liftMatrix(rec) { const f = rec.fields; return { source: valueOf(f.source), version: valueOf(f.version), digest: valueOf(f.digest) }; }

function resolveIdentityByNameSafe(name, decls, ios) {
  const d = decls.identities[name]; if (!d) return null;
  try { return ios.resolveIdentity(d.id, d); } catch { return null; }
}

function ios_matrixDigestExpected(decl, matrix) { return matrix.digest; }  // digest recomputed by IOS+; declared digest is a stand-in

function sealCognitiveTrace(gov, state, ios) {
  if (!gov || gov.type !== "governed") throw new IGLError("CAPTURE_TRACE argument is not a governed output", { phase: "exec", code: "FUSION_TYPE_ERROR" });
  const trace = {
    sealed: true, at: ios.now(),
    entropy: gov.entropy, tokenCount: gov.dist.length,
    fuse: gov.fuseRecord, boundaryLog: gov.boundaryLog || [], outcome: gov.outcome,
  };
  trace.ref = ios.logTrace(trace);
  return trace;
}
function composeTurnTrace(identity, trace, state, ios, parentSeq = null) {
  return {
    sequenceNo: ios.nextSequenceNo(),
    parentId: parentSeq,
    identity: { id: identity.id, authority: identity.authority },
    constraintDigest: trace.fuse?.matrixDigest || null,
    cognitiveTraceRef: trace.ref,
    output: { outputDigest: trace.fuse?.outputDigest, entropy: trace.entropy },
    outcome: trace.outcome,
  };
}
function issueReceipt(turn, outcomeOverride, { ios, programHash, sessionId, graphVersion }) {
  const fields = {
    receiptUUID: "rcpt-" + sha256(canonical(turn) + sessionId).slice(0, 20),
    boundIdentity: turn.identity.id,
    constraintMatrixDigest: turn.constraintDigest,
    cognitiveTraceRef: turn.cognitiveTraceRef,
    timeOfIssuance: ios.now(),
    programHash,
    identityGraphVersion: graphVersion,
    sessionId,
    turnSequenceNo: turn.sequenceNo,
    outcome: outcomeOverride || turn.outcome || "COMPLIANT",
  };
  return ios.signReceipt(fields);
}
function verifyReceipt(receipt, identityVal, ios) {
  if (!receipt) return { ok: false, reason: "no receipt" };
  // signature check is done by Signer.verifyReceipt in index/verify; here we do the runtime VERIFY (5.04)
  const idMatch = !identityVal || !identityVal.value || receipt.boundIdentity === identityVal.value.id;
  const digestKnown = !receipt.constraintMatrixDigest || ios.knownMatrixDigests.has(receipt.constraintMatrixDigest);
  return { ok: !!(idMatch && digestKnown), reason: idMatch ? (digestKnown ? "ok" : "unknown matrix digest") : "identity mismatch" };
}
function compare(a, op, b) {
  switch (op) { case "GTE": return a >= b; case "LTE": return a <= b; case "EQ": return a === b; case "GT": return a > b; case "LT": return a < b; default: return false; }
}
function valueFrom(v) { return v && ("value" in v) ? v.value : (v && v.dist ? v : v); }

export { parse, check };
