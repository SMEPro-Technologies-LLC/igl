// SPDX-License-Identifier: Apache-2.0
/* IGL interpreter — v0.2

   Execution order is fixed and enforced (CRITIQUE D5):
     1. resolve identity
     2. validate boundary with UDM
     3. authorise intent
     4. idempotency check
     5. load context traces (explicit predicate, recorded)
     6. execute compute steps in order
     7. stage outputs
     8. write trace  ← two-phase commit: the trace commits before the output
     9. release staged outputs, or discard them and raise

   Step 8 before step 9 is the whole point. An output that exists without a
   trace is the condition the fail-closed rule exists to prevent. */

import { IGLError } from "./lexer.js";
import { parse } from "./parser.js";
import { check } from "./check.js";
import { BUILTINS, INTENTS, SLOTS } from "./builtins.js";
import { IdentityRuntime, UDMRuntime, AIRuntime, IOSRuntime } from "./runtime.js";

const hash = s => {
  // FNV-1a 64-ish, hex; deterministic and dependency-free
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= s.charCodeAt(s.length - 1 - i); h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0"));
};

export class Interpreter {
  constructor({
    identity = new IdentityRuntime(),
    udm = new UDMRuntime(),
    ai = new AIRuntime(),
    ios = new IOSRuntime(),
    intents = INTENTS,
    builtins = BUILTINS,
    handlers = {},
    signers = {},                /* name -> Signer; when non-empty, attestation must be keyed */
    now = () => new Date().toISOString(),
    traceIdSeq = null,
  } = {}) {
    Object.assign(this, { identity, udm, ai, ios, intents, builtins, handlers, signers, now });
    this._seq = 0;
    this._traceId = traceIdSeq || (() => `TRC-${String(++this._seq).padStart(6, "0")}`);
    this.env = new Map();       // output name -> value (CRITIQUE B2)
  }

  /* ---------- value evaluation ---------- */
  evalValue(v) {
    switch (v.kind) {
      case "String": case "Number": case "Code": return v.value;
      case "Symbol": return v.value;
      case "List": return v.items.map(x => this.evalValue(x));
      case "Ref": {
        if (!this.env.has(v.name))
          throw new IGLError(`@${v.name} is not bound at runtime`, { line: v.line, col: v.col, phase: "exec", code: "IGL_UNBOUND_REF" });
        return this.env.get(v.name);
      }
      case "Apply": return { $apply: v.name, args: v.args.map(a => (a.kind === "Named" ? { [a.name]: this.evalValue(a.value) } : this.evalValue(a.value))) };
      default: throw new IGLError(`cannot evaluate ${v.kind}`, { phase: "exec", code: "IGL_BAD_VALUE" });
    }
  }

  bindArgs(step) {
    const sg = this.builtins[`${step.subsystem}.${step.fn}`];
    const out = {};
    const positional = step.args.filter(a => a.kind === "Positional");
    positional.forEach((a, i) => { const prm = sg.params[i]; if (prm) out[prm.name] = this.evalValue(a.value); });
    for (const a of step.args) if (a.kind === "Named") out[a.name] = this.evalValue(a.value);
    for (const prm of sg.params) if (!(prm.name in out) && prm.default !== undefined) out[prm.name] = prm.default;
    return out;
  }

  /* ---------- context selection ---------- */
  contextSpec(node) {
    const spec = { mode: "Recent", n: 20, requireAttested: false, boundaryExact: false };
    if (!node) return spec;
    for (const item of node.items) {
      if (item.kind === "Named" && item.name === "Traces") {
        const v = item.value;
        if (v.kind === "Apply" && v.name === "Recent") { spec.mode = "Recent"; spec.n = Number(this.evalValue(v.args[0].value ?? v.args[0])) || 20; }
        else if (v.kind === "Symbol") {
          if (v.value === "Attested") { spec.mode = "Attested"; spec.requireAttested = true; }
          if (v.value === "Boundary_Exact") spec.boundaryExact = true;
          if (v.value === "None") spec.n = 0;
        }
      } else if (item.kind === "Named" && item.name === "MaxDepth") {
        spec.maxDepth = Number(this.evalValue(item.value));
      } else if (item.kind === "Positional" && item.value.kind === "Symbol") {
        if (item.value.value === "Attested") { spec.requireAttested = true; }
        if (item.value.value === "Boundary_Exact") spec.boundaryExact = true;
      }
    }
    return spec;
  }

  /* ---------- one statement ---------- */
  async execStatement(st, { force = false } = {}) {
    const started = this.now();

    /* 1. identity */
    const ident = this.identity.resolve(st.identity.actor);

    /* 2. boundary */
    const boundary = this.udm.validateBoundary(st.identity.boundary);

    /* 2b. footprint containment — boundary ⊆ granted footprint.
       Reads the prescriptive layer only: no amount of observation, however
       consistent, may authorise a statement. Resolved live rather than cached,
       so a revocation takes effect on the next statement. */
    if (typeof this.identity.authorize === "function") {
      const authz = this.identity.authorize(ident.actor, boundary);
      if (!authz.ok) {
        const first = authz.violations[0];
        throw new IGLError(
          `footprint does not cover this boundary — ${authz.violations.map(v => v.reason).join("; ")}` +
          (first?.note ? ` (${first.note})` : ""),
          { line: st.identity.line, phase: "authz", code: "IGL_FOOTPRINT_DENIED" });
      }
    }

    /* 3. intent authorisation */
    const spec = this.intents[st.intent.name];
    if (!spec) throw new IGLError(`unknown intent ${st.intent.name}`, { line: st.intent.line, phase: "exec", code: "IGL_UNKNOWN_INTENT" });
    if (!spec.roles.includes(ident.role))
      throw new IGLError(`${ident.id} may not perform ${st.intent.name} in this boundary`, { line: st.intent.line, phase: "authz", code: "IGL_UNAUTHORISED" });

    /* 4. idempotency (CRITIQUE B6) */
    const params = Object.fromEntries(st.intent.params.map(p => [p.name, this.evalValue(p.value)]));
    const statementKey = hash(JSON.stringify({ a: ident.id, b: boundary, i: st.intent.name, p: params,
      c: st.compute.steps.map(s => `${s.subsystem}.${s.fn}`) }));
    if (!force) {
      const prior = this.ios.byStatementKey(statementKey);
      if (prior) return { status: "idempotent", traceId: prior.id, outputs: prior.outputs, trace: prior };
    }

    /* 5. context traces */
    const cspec = this.contextSpec(st.context);
    const { traces: contextTraces, predicate } = this.ios.select(cspec, { identity: ident, boundary, intent: st.intent.name });

    /* 6. compute */
    const assertions = [];
    const channels = new Set();
    let attested = null;
    const ctx = { identity: ident, boundary, intent: st.intent.name, contextTraces, env: this.env };

    for (const step of st.compute.steps) {
      const key = `${step.subsystem}.${step.fn}`;
      const args = this.bindArgs(step);
      if (step.subsystem === "UDM") {
        assertions.push({ step: key, ...this.udm[step.fn](args) });
      } else if (step.subsystem === "AI") {
        const a = step.fn === "Extract"
          ? await this.ai.extract(args, { ...ctx, udm: this.udm })
          : await this.ai.run(step.fn, args, ctx);
        assertions.push({ step: key, ...a });
        if (a.depth > (cspec.maxDepth ?? this.ios.maxDepth))
          throw new IGLError(`inference derivation depth ${a.depth} exceeds the cap — re-derive from source rather than inherit`,
            { line: step.line, phase: "exec", code: "IGL_DEPTH_EXCEEDED" });
      } else if (step.subsystem === "IOS") {
        if (step.fn === "Trace") { (args.Channels || []).forEach(c => channels.add(c)); }
        else if (step.fn === "Attest") {
          /* When a signer registry is configured, an attestation must be
             attributable to a registered key — a human-class trace cannot be
             minted by writing a name into a field. Without a registry the
             reference implementation accepts symbolic signers, unkeyed. */
          const signerName = String(args.Signer);
          const signerKey = this.signers[signerName] || null;
          if (Object.keys(this.signers).length && !signerKey)
            throw new IGLError(`signer ${signerName} holds no registered key — an unkeyed attestation is not attributable`,
              { line: step.line, phase: "attest", code: "IGL_UNKNOWN_SIGNER" });
          /* Fail-closed on class: `human` is the non-decaying, never-inherited
             class in SPEC §9, so it must not be mintable by configuration.
             An unkeyed attestation still satisfies the intent's attestation
             gate (the statement commits) but is CLASSED ai — it decays, it
             counts toward depth, and the trace says why. The guarantee no
             longer depends on whether a registry happened to be deployed. */
          attested = { signer: signerName, role: args.Role, note: args.Note ?? null, at: this.now(), keyed: !!signerKey };
          assertions.push({ step: key, assertion: "attestation", ...attested,
            attestation: attested.keyed ? "human" : "ai",
            confidence: attested.keyed ? 1 : 0.5,
            ...(attested.keyed ? {} : { note: (args.Note ? args.Note + " · " : "") + "unkeyed attestation — human class requires a registered signing key" }) });
        } else if (step.fn === "Stage") {
          assertions.push({ step: key, assertion: "staged", artifact: args.Artifact, attestation: "deterministic", confidence: 1 });
        }
      }
    }

    /* 7. stage outputs — not released until the trace is durable */
    const staged = {};
    for (const item of st.output.items) {
      staged[item.name] = item.value ? this.evalValue(item.value)
        : { produced: true, from: st.intent.name, assertions: assertions.length };
    }

    /* attestation gate (CRITIQUE B5) */
    const requiresAttestation = !!spec.requiresAttestation;
    const committed = !requiresAttestation || !!attested;

    /* 8. trace first */
    const traceId = this._traceId();
    const aiAssertions = assertions.filter(a => a.attestation === "ai");
    const trace = {
      id: traceId,
      statementKey,
      at: started,
      finished: this.now(),
      identity: { id: ident.id, actor: ident.actor, role: ident.role },
      boundary,
      intent: st.intent.name,
      params,
      contextTraceIds: contextTraces.map(t => t.id),
      contextPredicate: predicate,
      channels: [...channels],
      assertions,
      /* trace-level provenance: the weakest link governs (CRITIQUE C1);
         human requires a KEYED attestation — see the attest step above */
      attestation: (attested && attested.keyed) ? "human" : (aiAssertions.length || attested ? "ai" : "deterministic"),
      confidence: aiAssertions.length ? Math.min(...aiAssertions.map(a => a.confidence ?? 0)) : 1,
      depth: aiAssertions.length ? Math.max(...aiAssertions.map(a => a.depth || 1)) : 0,
      reuseCount: 0,
      state: committed ? "committed" : "staged",
      outputs: staged,
    };
    /* Keyed attestation: the signer's Ed25519 key signs the canonical trace
       BEFORE it enters the journal, so the chain covers the receipt and a
       third party can verify both the record and who stood behind it. */
    if (attested && this.signers[attested.signer])
      trace.receipt = this.signers[attested.signer].receiptForTrace(trace);
    let written;
    try {
      written = this.ios.write(trace);
      /* async backends (D1) buffer on write; durability is the flush. The
         await sits INSIDE the try so a failed flush is a failed trace and the
         staged outputs are discarded — fail-closed survives the persistence
         layer going async. */
      if (typeof this.ios.flush === "function") await this.ios.flush();
    }
    catch (e) {
      /* 9a. trace failed → discard staged output. No untraced intelligence. */
      throw new IGLError(`trace capture failed; staged outputs discarded — ${e.message}`,
        { line: st.line, phase: "trace", code: "IGL_TRACE_FAILED" });
    }
    if (!written) throw new IGLError("trace capture returned no id; staged outputs discarded", { phase: "trace", code: "IGL_TRACE_FAILED" });

    /* 9b. release, and close the loop: the committed trace folds back into the
       identity graph. Its own attestation class decides which layer it reaches —
       an ai-class trace can never land anywhere that widens authority. */
    this.ios.markReused(contextTraces);
    if (typeof this.identity.fold === "function") this.identity.fold(trace);
    if (committed) for (const [k, v] of Object.entries(staged)) this.env.set(k, v);
    this.env.set("TurnTrace_ID", traceId);

    return {
      status: committed ? "committed" : "staged",
      traceId,
      outputs: committed ? staged : {},
      trace,
      ...(committed ? {} : { pending: `awaiting attestation for ${st.intent.name}` }),
    };
  }

  /* ---------- failure handling (CRITIQUE B1) ---------- */
  async handleFailure(st, error) {
    /* No handler declared: the failure is recorded, not swallowed and not
       thrown away. The program halts — a governed pipeline does not run its
       later statements on the strength of a step that did not happen. */
    if (!st.onFail) {
      return { status: "failed", halted: true,
        error: { message: error.message, code: error.code, phase: error.phase, line: error.line } };
    }
    const actions = [];
    for (const h of st.onFail.handlers) {
      const args = Object.fromEntries(h.args.filter(a => a.kind === "Named").map(a => [a.name, this.evalValue(a.value)]));
      const positional = h.args.filter(a => a.kind === "Positional").map(a => this.evalValue(a.value));
      const fn = this.handlers[h.name];
      const record = { handler: h.name, args, positional };
      if (fn) record.result = await fn({ statement: st, error, args, positional, interpreter: this });
      actions.push(record);
      if (h.name === "Halt") { const e = new IGLError(`halted: ${error.message}`, { phase: "onfail", code: "IGL_HALTED" }); e.actions = actions; e.cause = error; throw e; }
      if (h.name === "Retry") {
        const times = Number(args.Times ?? positional[0] ?? 1);
        for (let i = 0; i < times; i++) {
          try { return { ...(await this.execStatement(st, { force: true })), recovered: true, actions }; }
          catch (e2) { record.lastError = e2.message; }
        }
      }
    }
    return { status: "failed", error: { message: error.message, code: error.code, phase: error.phase }, actions };
  }

  /* ---------- program ---------- */
  async run(source, { skipCheck = false } = {}) {
    const ast = typeof source === "string" ? parse(source) : source;
    if (!skipCheck) {
      const errors = check(ast, { intents: this.intents, builtins: this.builtins });
      if (errors.length) {
        const e = new IGLError(`${errors.length} static error(s); nothing was executed`, { phase: "check", code: "IGL_STATIC_ERRORS" });
        e.errors = errors;
        throw e;
      }
    }
    const results = [];
    let halted = false;
    for (const st of ast.statements) {
      try { results.push(await this.execStatement(st)); }
      catch (err) {
        if (!(err instanceof IGLError)) throw err;
        const handled = await this.handleFailure(st, err);
        results.push(handled);
        if (handled.halted) { halted = true; break; }
      }
    }
    return { version: ast.version || "0.2", results, halted, traces: this.ios.traces };
  }
}

export { parse, check, IGLError };
export * from "./runtime.js";
