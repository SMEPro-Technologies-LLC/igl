// SPDX-License-Identifier: Apache-2.0
/* IGL runtimes — v0.2

   Four runtimes, deliberately separate:
     IdentityRuntime  actors, roles, footprints
     UDMRuntime       governed structure; deterministic; the brake
     AIRuntime        inference; probabilistic; pinned and seeded
     IOSRuntime       orchestration + TurnTrace store (the memory)

   The default implementations are in-memory and are meant to be replaced by
   adapters onto the real services. Every one is injectable, so the interpreter
   can be tested without a network. */

import { IGLError } from "./lexer.js";

/* ============================ Identity ============================ */
export class IdentityRuntime {
  constructor({ actors = {} } = {}) { this.actors = actors; }
  resolve(actorPath) {
    const id = actorPath.join(":");
    const known = this.actors[actorPath[0]];
    if (!known) throw new IGLError(`actor ${actorPath[0]} is not in the identity graph`, { phase: "identity", code: "IGL_UNKNOWN_ACTOR" });
    const role = actorPath.length > 1 ? actorPath[actorPath.length - 1] : known.defaultRole;
    if (known.roles && !known.roles.includes(role))
      throw new IGLError(`${actorPath[0]} does not hold role ${role}`, { phase: "identity", code: "IGL_ROLE_DENIED" });
    return { id, actor: actorPath[0], role, footprint: known.footprint || {} };
  }
}

/* ============================== UDM =============================== */
export class UDMRuntime {
  constructor({ boundaries = {}, forms = {}, constraints = {} } = {}) {
    this.boundaries = boundaries; this.forms = forms; this.constraints = constraints;
  }
  /* A boundary is governed only if UDM recognises the key AND the value. */
  validateBoundary(boundary) {
    const problems = [];
    const seen = new Map();
    for (const b of boundary) {
      const reg = this.boundaries[b.key];
      if (!reg) { problems.push(`boundary key ${b.key} is not governed`); continue; }
      if (reg.values && !reg.values.includes(String(b.value)))
        problems.push(`${b.key}=${b.value} is not a recognised value`);
      if (seen.has(b.key) && !reg.setValued)
        problems.push(`boundary key ${b.key} is not set-valued but was supplied more than once`);
      seen.set(b.key, true);
    }
    if (problems.length)
      throw new IGLError(problems.join("; "), { phase: "udm", code: "IGL_BOUNDARY_REJECTED" });
    return Object.fromEntries(boundary.map(b => [b.key, b.value]));
  }
  Resolve({ AgencyCode, RequiredForms = [], Period }) {
    const agency = this.forms[AgencyCode];
    if (!agency) throw new IGLError(`agency ${AgencyCode} is unknown to UDM`, { phase: "udm", code: "IGL_UNKNOWN_AGENCY" });
    const resolved = [], missing = [];
    for (const f of RequiredForms) (agency.forms.includes(f) ? resolved : missing).push(f);
    if (missing.length)
      throw new IGLError(`${AgencyCode} does not publish form(s) ${missing.join(", ")}`, { phase: "udm", code: "IGL_UNKNOWN_FORM" });
    return { assertion: "resolution", agency: AgencyCode, period: Period ?? null, forms: resolved, attestation: "deterministic", confidence: 1 };
  }
  Validate({ Target, Ruleset = "default" }) {
    const rules = this.constraints[Ruleset] || [];
    const failures = rules.filter(r => !r.test(Target)).map(r => r.name);
    return { assertion: "validation", ruleset: Ruleset, ok: !failures.length, failures, attestation: "deterministic", confidence: 1 };
  }
  Enforce({ Constraint, Target }) {
    const rule = (this.constraints.named || {})[Constraint];
    if (!rule) throw new IGLError(`constraint ${Constraint} is not defined in UDM`, { phase: "udm", code: "IGL_UNKNOWN_CONSTRAINT" });
    const ok = rule(Target);
    if (!ok) throw new IGLError(`constraint ${Constraint} violated`, { phase: "udm", code: "IGL_CONSTRAINT_VIOLATED" });
    return { assertion: "enforcement", constraint: Constraint, ok: true, attestation: "deterministic", confidence: 1 };
  }
  CrossCheck({ Left, Right, Tolerance = 0 }) {
    const l = Number(Left), r = Number(Right);
    const delta = Number.isFinite(l) && Number.isFinite(r) ? Math.abs(l - r) : NaN;
    const ok = Number.isFinite(delta) ? delta <= Tolerance : JSON.stringify(Left) === JSON.stringify(Right);
    return { assertion: "crosscheck", ok, delta: Number.isFinite(delta) ? delta : null, attestation: "deterministic", confidence: 1 };
  }
  Align({ Source, Ontology }) {
    return { assertion: "alignment", ontology: Ontology, source: Source, attestation: "deterministic", confidence: 1 };
  }
}

/* =============================== AI =============================== */
export class AIRuntime {
  /* `invoke` is the single seam onto a real model. It receives a fully
     described call and must return { text, confidence, modelVersion }.
     `bridge` + `slots` enable governed extraction (AI.Extract). */
  constructor({ invoke = null, models = {}, bridge = null, slots = {}, source = null, manifest = null } = {}) {
    Object.assign(this, { invoke, models, bridge, slots, source, manifest });
  }

  /* Governed extraction: γ constrains the call, α lifts the result back onto
     the admissible set, quantities are read from source. The model never
     asserts a governed value directly — it selects within a set UDM computed
     and points at bytes this runtime reads. */
  async extract(args, ctx) {
    if (!this.bridge) throw new IGLError("AI.Extract requires a bridge — no translation layer is configured",
      { phase: "ai", code: "IGL_NO_BRIDGE" });
    const pinned = this.models[args.Model];
    if (!pinned) throw new IGLError(`model ${args.Model} is not registered`, { phase: "ai", code: "IGL_UNKNOWN_MODEL" });

    /* resolve slot specs, with scope-dependent admissible sets computed by UDM */
    const specs = [];
    for (const name of args.Slots || []) {
      const def = this.slots[name];
      if (!def) throw new IGLError(`slot ${name} is not in the governed slot registry`, { phase: "ai", code: "IGL_UNKNOWN_SLOT" });
      const admissible = def.admissible
        ? def.admissible
        : (def.admissibleFrom ? def.admissibleFrom({ udm: ctx.udm, boundary: ctx.boundary }) : undefined);
      if ((def.kind === "code" || def.kind === "enum") && (!admissible || !admissible.length))
        throw new IGLError(`slot ${name}: UDM resolved an empty admissible set at this boundary`,
          { phase: "ai", code: "IGL_EMPTY_ADMISSIBLE" });
      specs.push({ name, ...def, admissible });
    }

    if (args.Strictness) this.bridge.strictness = String(args.Strictness).toLowerCase();
    const envelope = this.bridge.gamma(ctx.boundary, specs, { model: args.Model, seed: args.Seed ?? null });

    const call = {
      fn: "Extract", model: args.Model, modelVersion: pinned.version,
      schema: envelope.schema, seed: args.Seed ?? null, temperature: 0,
      slots: specs.map(s => s.name), context: ctx.contextTraces.map(t => t.id),
    };
    const out = this.invoke ? await this.invoke(call, ctx) : { structured: {}, confidences: {}, confidence: 0 };
    const raw = out.structured ?? out.text ?? {};
    const lifted = this.bridge.alpha(raw, envelope, {
      source: this.source || ctx.source || null,
      confidences: out.confidences || {},
      manifest: this.manifest || ctx.manifest || null,
    });

    /* Class the assertion by what actually happened. If every value that
       survived was read from source, the extraction is deterministic even
       though a model chose where to look. */
    const values = Object.values(lifted.slots);
    const allRead = values.length > 0 && values.every(v => v.valueClass === "deterministic");
    const depth = allRead ? 0 : 1 + ctx.contextTraces.reduce((m, t) => Math.max(m, t.attestation === "ai" ? (t.depth || 0) : 0), 0);

    return {
      assertion: "extraction",
      model: args.Model, modelVersion: out.modelVersion ?? pinned.version, seed: call.seed,
      manifest: envelope.manifest,
      slots: lifted.slots,
      projections: lifted.projections,
      unmapped: lifted.unmapped,
      abstained: lifted.abstained,
      verification: lifted.verification,
      attestation: allRead ? "deterministic" : "ai",
      confidence: allRead ? 1 : Number(out.confidence ?? 0),
      depth,
    };
  }

  async run(fn, args, ctx) {
    const model = args.Model;
    const pinned = this.models[model];
    if (!pinned) throw new IGLError(`model ${model} is not registered — an unregistered model cannot be governed`, { phase: "ai", code: "IGL_UNKNOWN_MODEL" });
    const call = {
      fn, task: args.Task ?? null, model, modelVersion: pinned.version,
      temperature: args.Temperature ?? 0, seed: args.Seed ?? null,
      inputs: args.Inputs ?? [], context: ctx.contextTraces.map(t => t.id),
    };
    let out;
    if (this.invoke) out = await this.invoke(call, ctx);
    else out = { text: `[no model adapter configured: ${fn}/${model}]`, confidence: 0, modelVersion: pinned.version };

    const minConf = args.MinConfidence ?? 0.6;
    const confidence = Number(out.confidence ?? 0);
    /* Derivation depth: one deeper than the deepest AI-class trace it read. */
    const depth = 1 + ctx.contextTraces.reduce((m, t) => Math.max(m, t.attestation === "ai" ? (t.depth || 0) : 0), 0);
    const assertion = {
      assertion: "inference", task: call.task, model, modelVersion: out.modelVersion ?? pinned.version,
      temperature: call.temperature, seed: call.seed,
      text: out.text, confidence, attestation: "ai", depth,
      contextTraceIds: call.context,
    };
    if (confidence < minConf) {
      assertion.belowThreshold = true;
      assertion.note = `confidence ${confidence.toFixed(2)} below required ${minConf} — held for human review rather than asserted`;
    }
    return assertion;
  }
}

/* ============================== IOS =============================== */
/* TurnTrace store. The memory of the system, and therefore the thing that
   determines whether the recursive loop converges or drifts. */
export class IOSRuntime {
  constructor({ store = null, journal = null, decay = 0.75, floor = 0.4, maxDepth = 3, now = () => new Date().toISOString() } = {}) {
    this.journal = journal;    // hash-chained substrate; replayed on construction
    this.traces = journal ? journal.entries("trace").map(e => e.body) : (store || []);
    this.decay = decay;        // per-reuse multiplier on ai-class confidence (CRITIQUE C1)
    this.floor = floor;        // below this an ai assertion is inadmissible as context
    this.maxDepth = maxDepth;  // ai-to-ai hops from a deterministic/human anchor
    this.now = now;
  }

  /* Durability gate for async backends: the interpreter awaits this inside
     two-phase commit, so a failed flush still discards staged outputs. */
  async flush() { if (this.journal) await this.journal.flush(); }

  /* Selection is explicit and recorded, never implicit (CRITIQUE C2). */
  select(spec, { identity, boundary, intent }) {
    const { mode = "Recent", n = 20, requireAttested = false, boundaryExact = false, maxDepth = this.maxDepth } = spec;
    let pool = this.traces.filter(t => t.intent === intent && t.identity.actor === identity.actor);
    if (boundaryExact) {
      const key = JSON.stringify(boundary);
      pool = pool.filter(t => JSON.stringify(t.boundary) === key);
    }
    pool = pool.filter(t => {
      if (t.attestation !== "ai") return true;              // deterministic and human never decay
      if ((t.depth || 0) > maxDepth) return false;          // depth cap
      return this.effectiveConfidence(t) >= this.floor;     // decay floor
    });
    if (requireAttested) pool = pool.filter(t => t.attestation !== "ai");
    if (mode === "Attested") pool = pool.filter(t => t.attestation === "human");
    pool = pool.slice(-Math.max(0, n));
    return { traces: pool, predicate: { mode, n, requireAttested, boundaryExact, maxDepth, floor: this.floor, decay: this.decay } };
  }

  /* Confidence falls each time an inference is inherited rather than re-derived. */
  effectiveConfidence(t) {
    if (t.attestation !== "ai") return 1;
    return (t.confidence ?? 0) * Math.pow(this.decay, t.reuseCount || 0);
  }

  markReused(traces) {
    for (const t of traces) if (t.attestation === "ai") t.reuseCount = (t.reuseCount || 0) + 1;
  }

  write(trace) {
    if (!trace.id) throw new IGLError("refusing to write a trace with no id", { phase: "ios", code: "IGL_TRACE_INVALID" });
    if (this.journal) this.journal.append("trace", trace);
    this.traces.push(trace);
    return trace.id;
  }

  find(id) { return this.traces.find(t => t.id === id) || null; }
  byStatementKey(k) { return this.traces.find(t => t.statementKey === k) || null; }
}
