/* Identity graph as a fold over the trace stream — IGL v0.2

   Boundary and footprint are not registry lookups. They are materialised
   views over an append-only event log, recomputed continuously:

       F_t(actor) = F_{t-1} ⊕ δ(trace_t)

   Three properties this file is responsible for, in order of importance:

   1. OBSERVATION NEVER GRANTS AUTHORITY.
      The fold maintains two layers. `granted` is prescriptive — what an actor
      MAY do — and moves only on an explicit, signed grant or revoke.
      `observed` is descriptive — what an actor DOES — and accumulates freely
      from traces. authorize() reads `granted` and nothing else. No volume of
      observation, however consistent, can widen authority; it can only raise
      a promotion candidate for a human to act on.

      Without this split the loop grants permissions by habit: an actor who
      repeatedly files somewhere accumulates evidence that they file there,
      and a system that learns from its own behaviour eventually concludes
      they are allowed to.

   2. AI-CLASS EVIDENCE NEVER PROMOTES.
      Observations are classed. `deterministic` and `human` deltas land in the
      governing observation layer; `ai` deltas land in `proposed` and stay
      there regardless of count. This is §9's anchoring rule applied one layer
      down, to the substrate rather than to the assertions.

   3. THE PAST IS RECONSTRUCTIBLE.
      project(asOf) replays the log to a timestamp. A statement executed in
      2026-Q1 is audited against the footprint as it stood then, not as it
      stands now.

   The merge is per-dimension, associative and commutative, so the log can be
   sharded, replayed partially, or folded out of order and reach the same
   state. test/graph.test.js asserts this by shuffling. */

import { IGLError } from "./lexer.js";

const DAY = 86400000;
const ts = x => (x instanceof Date ? x.getTime() : Date.parse(x));

/* ---------------- dimensions ----------------
   Each governed dimension declares how containment is decided.
     set      — plain membership
     lattice  — membership, or membership of any ancestor (US-TX covers TX-RRC)
     custom   — a contains(grantedValue, boundaryValue) predicate            */
export const DEFAULT_DIMENSIONS = {
  Jurisdiction: {
    type: "lattice",
    parents: { "TX-RRC": "US-TX", "US-TX": "US", "NM-OCD": "US-NM", "US-NM": "US", "LA-DNR": "US-LA", "US-LA": "US" },
  },
  Commodity: { type: "lattice", parents: { Oil: "Hydrocarbon", Gas: "Hydrocarbon", NGL: "Hydrocarbon" } },
  Period: { type: "set" },
  Matter: { type: "set" },
  AgencyCode: { type: "lattice", parents: { "TX-RRC": "US-TX" } },
};

export class GraphRuntime {
  constructor({
    dimensions = DEFAULT_DIMENSIONS,
    roles = {},                  // actor -> permitted roles
    halfLifeDays = 365,          // recency decay on DESCRIPTIVE observation only
    promoteAfter = 3,            // governing-class observations before a promotion candidate is raised
    now = () => new Date().toISOString(),
    journal = null,              // hash-chained substrate; replayed on construction
  } = {}) {
    Object.assign(this, { dimensions, roles, halfLifeDays, promoteAfter, now, journal });
    this.events = journal ? journal.entries("graph").map(e => e.body) : [];
    this._cache = null;          // projection of the whole log
  }

  /* ---------------- append ---------------- */
  _append(ev) {
    if (!ev.at) ev.at = this.now();
    if (this.journal) this.journal.append("graph", ev);
    this.events.push(ev);
    this._cache = null;
    return ev;
  }

  /* Prescriptive. The only path that can widen authority. */
  grant(actor, dims, { by, role = null, at = null, note = null } = {}) {
    if (!by) throw new IGLError("a grant must name its grantor", { phase: "identity", code: "IGL_UNSIGNED_GRANT" });
    return this._append({ kind: "grant", actor, dims, role, by, note, at });
  }

  /* Revocation is explicit and takes effect at the next authorize(). */
  revoke(actor, dims, { by, role = null, at = null } = {}) {
    if (!by) throw new IGLError("a revocation must name its revoker", { phase: "identity", code: "IGL_UNSIGNED_REVOKE" });
    return this._append({ kind: "revoke", actor, dims, role, by, at });
  }

  /* Descriptive. Accumulates freely; never widens authority. */
  observe(actor, dims, { cls = "ai", traceId = null, at = null } = {}) {
    return this._append({ kind: "observe", actor, dims, cls, traceId, at });
  }

  /* ---- signing keys as journal events ----
     Keys travel the same substrate as grants: bound by a named grantor,
     revoked explicitly, replayed with the chain, reconstructible asOf. This
     is what makes receipt attribution rotation-safe — a receipt verifies
     against the key registered AT SIGNING TIME, so rotating a key does not
     invalidate the attestations it validly made. */
  bindKey(actor, publicKey, { by, at = null } = {}) {
    if (!by) throw new IGLError("a key binding must name its grantor", { phase: "identity", code: "IGL_UNSIGNED_GRANT" });
    return this._append({ kind: "key", actor, key: publicKey, by, at });
  }
  /* Revocation carries its reason, because rotation and compromise demand
     OPPOSITE retroactive behaviour from the same event shape:
       rotated      — prospective. Signatures before the revocation stay
                      valid; the key simply makes no new ones.
       compromised  — retroactive from `effectiveFrom` (often earlier than
                      discovery). Signatures at or after that moment are
                      suspect and must FAIL verification, however early the
                      asOf projection would otherwise place them. */
  revokeKey(actor, publicKey, { by, at = null, reason = "rotated", effectiveFrom = null } = {}) {
    if (!by) throw new IGLError("a key revocation must name its revoker", { phase: "identity", code: "IGL_UNSIGNED_REVOKE" });
    if (reason !== "rotated" && reason !== "compromised")
      throw new IGLError(`revocation reason must be "rotated" or "compromised", got ${reason}`, { phase: "identity", code: "IGL_BAD_REVOKE_REASON" });
    if (reason === "compromised" && !effectiveFrom) effectiveFrom = at || this.now();
    return this._append({ kind: "keyrevoke", actor, key: publicKey, by, at, reason, effectiveFrom });
  }

  /* Key validity at a signing time. Deliberately NOT a projection query:
     a compromise recorded at discovery time must reach BACKWARD to its
     effectiveFrom, so the scan reads the full log regardless of asOf —
     the one place where reconstructing "what was known then" is exactly
     the wrong question, because the answer we need is "what is true now
     about then". */
  keyStatus(actor, publicKey, { asOf = null } = {}) {
    const t = asOf ? ts(asOf) : Date.now();
    let active = false, compromised = false;
    const relevant = this.events
      .map((e, i) => [e, i])
      .filter(([e]) => e.actor === actor && e.key === publicKey && (e.kind === "key" || e.kind === "keyrevoke"))
      .sort((a, b) => (ts(a[0].at) - ts(b[0].at)) || (a[1] - b[1]));
    for (const [e] of relevant) {
      if (e.kind === "key") { if (ts(e.at) <= t) active = true; }
      else if (e.reason === "compromised") { if (ts(e.effectiveFrom || e.at) <= t) compromised = true; }
      else { if (ts(e.at) <= t) active = false; }             /* rotated: prospective only */
    }
    return { active: active && !compromised, compromised };
  }
  hasKey(actor, publicKey, { asOf = null } = {}) { return this.keyStatus(actor, publicKey, { asOf }).active; }
  keysFor(actor, { asOf = null } = {}) {
    const A = this.project(asOf).actors.get(actor);
    return A && A.keys ? [...A.keys.keys()] : [];
  }

  /* Close the loop: a committed trace folds straight back into the graph.
     The trace's own attestation class decides which layer it can reach. */
  fold(trace) {
    if (!trace || !trace.identity) return null;
    const cls = trace.attestation === "human" ? "human"
              : trace.attestation === "deterministic" ? "deterministic" : "ai";
    const dims = {};
    for (const [k, v] of Object.entries(trace.boundary || {})) dims[k] = Array.isArray(v) ? v : [v];
    return this.observe(trace.identity.actor, dims, { cls, traceId: trace.id, at: trace.finished || trace.at });
  }

  /* ---------------- projection ----------------
     current state is cached; asOf replays. */
  project(asOf = null) {
    if (!asOf && this._cache) return this._cache;
    const limit = asOf ? ts(asOf) : Infinity;
    const actors = new Map();
    const ensure = a => {
      if (!actors.has(a)) actors.set(a, { actor: a, roles: new Set(), granted: new Map(), observed: new Map(), keys: new Map() });
      return actors.get(a);
    };
    const dimMap = (m, d) => { if (!m.has(d)) m.set(d, new Map()); return m.get(d); };

    /* Fold in TIME order, not insertion order — grant/revoke and key/revoke
       are order-sensitive, and a backdated bind appended after a revocation
       must not resurrect what the revocation killed. Ties break by append
       sequence, so the fold stays deterministic. */
    const ordered = this.events
      .map((e, i) => [e, i])
      .sort((a, b) => (ts(a[0].at) - ts(b[0].at)) || (a[1] - b[1]));
    for (const [ev] of ordered) {
      const when = ts(ev.at);
      if (!(when <= limit)) continue;
      const A = ensure(ev.actor);
      if (ev.role) A.roles.add(ev.role);

      if (ev.kind === "grant") {
        for (const [d, vals] of Object.entries(ev.dims || {}))
          for (const v of [].concat(vals)) dimMap(A.granted, d).set(v, { at: ev.at, by: ev.by, note: ev.note });
      } else if (ev.kind === "revoke") {
        for (const [d, vals] of Object.entries(ev.dims || {}))
          for (const v of [].concat(vals)) dimMap(A.granted, d).delete(v);
        if (ev.role) A.roles.delete(ev.role);
      } else if (ev.kind === "key") {
        A.keys.set(ev.key, { at: ev.at, by: ev.by });
      } else if (ev.kind === "keyrevoke") {
        /* deletion is correct under asOf semantics: a projection at a time
           before the revocation never applies it, so historical receipts
           still verify against the key that was valid when they were made */
        A.keys.delete(ev.key);
      } else if (ev.kind === "observe") {
        for (const [d, vals] of Object.entries(ev.dims || {})) {
          for (const v of [].concat(vals)) {
            const bucket = dimMap(A.observed, d);
            /* merge is commutative and associative: counts add, bounds take
               min/max, class takes the strongest seen. */
            const prev = bucket.get(v) || { count: 0, ai: 0, anchored: 0, first: when, last: when, traceIds: [] };
            prev.count += 1;
            if (ev.cls === "ai") prev.ai += 1; else prev.anchored += 1;
            prev.first = Math.min(prev.first, when);
            prev.last = Math.max(prev.last, when);
            if (ev.traceId && prev.traceIds.length < 50) prev.traceIds.push(ev.traceId);
            bucket.set(v, prev);
          }
        }
      }
    }
    /* seed declared roles */
    for (const [a, rs] of Object.entries(this.roles)) for (const r of rs) ensure(a).roles.add(r);

    const out = { at: asOf || this.now(), actors };
    if (!asOf) this._cache = out;
    return out;
  }

  /* Descriptive weight decays with recency; prescriptive never does.
     Absence must not silently revoke, so this touches `observed` only. */
  weight(entry, asOf = null) {
    const nowMs = asOf ? ts(asOf) : Date.now();
    const ageDays = Math.max(0, (nowMs - entry.last) / DAY);
    return entry.count * Math.pow(0.5, ageDays / this.halfLifeDays);
  }

  /* ---------------- footprint ---------------- */
  /* The projection is emitted in canonical order — dimensions and values
     sorted — so two folds of the same events serialise identically regardless
     of arrival order. Without this the state is set-equal but not hashable,
     and a footprint cannot be diffed or committed to a trace by digest. */
  footprint(actor, { asOf = null } = {}) {
    const A = this.project(asOf).actors.get(actor);
    if (!A) return null;
    const sortKeys = obj => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : 1)));
    const granted = {}, governing = {}, proposed = {};
    for (const [d, m] of A.granted) granted[d] = [...m.keys()].sort();
    for (const [d, m] of A.observed) {
      for (const [v, e] of m) {
        const w = this.weight(e, asOf);
        const target = e.anchored > 0 ? governing : proposed;
        (target[d] = target[d] || []).push({
          value: v, count: e.count, anchored: e.anchored,
          weight: Number(w.toFixed(3)), last: new Date(e.last).toISOString(),
        });
      }
    }
    for (const layer of [governing, proposed])
      for (const d of Object.keys(layer)) layer[d].sort((x, y) => (x.value < y.value ? -1 : 1));
    return {
      actor: A.actor,
      roles: [...A.roles].sort(),
      granted: sortKeys(granted),
      observed: { governing: sortKeys(governing), proposed: sortKeys(proposed) },
    };
  }

  /* ---------------- containment ---------------- */
  covers(dimension, grantedValues, value) {
    const set = new Set(grantedValues || []);
    if (set.has("*")) return true;
    if (set.has(String(value))) return true;
    const d = this.dimensions[dimension];
    if (!d) return false;
    if (typeof d.contains === "function") {
      for (const g of set) if (d.contains(g, value)) return true;
      return false;
    }
    if (d.type === "lattice") {
      let cur = String(value); const seen = new Set();
      while (d.parents && d.parents[cur] && !seen.has(cur)) {
        seen.add(cur);
        cur = d.parents[cur];
        if (set.has(cur)) return true;
      }
    }
    return false;
  }

  /* boundary ⊆ granted-footprint. Reads the prescriptive layer only. */
  authorize(actor, boundary, { asOf = null } = {}) {
    const fp = this.footprint(actor, { asOf });
    if (!fp) return { ok: false, violations: [{ dimension: "*", reason: "actor not in the identity graph" }] };
    const violations = [];
    for (const [d, v] of Object.entries(boundary)) {
      for (const one of [].concat(v)) {
        if (!this.covers(d, fp.granted[d], one)) {
          const observed = (fp.observed.governing[d] || []).concat(fp.observed.proposed[d] || []).find(x => x.value === String(one));
          violations.push({
            dimension: d, value: one,
            reason: fp.granted[d] ? `granted ${d}: ${fp.granted[d].join(", ")} does not cover ${one}` : `no ${d} grant on this footprint`,
            /* say so explicitly — this is exactly the inference the system must refuse to make */
            note: observed ? `observed ${observed.count}× but observation does not confer authority` : undefined,
          });
        }
      }
    }
    return { ok: !violations.length, violations, footprint: fp };
  }

  /* ---------------- promotion candidates ----------------
     What the graph has learned, offered for a human decision. Never applied. */
  promotions(actor, { asOf = null } = {}) {
    const fp = this.footprint(actor, { asOf });
    if (!fp) return [];
    const out = [];
    for (const layer of ["governing", "proposed"]) {
      for (const [d, entries] of Object.entries(fp.observed[layer])) {
        for (const e of entries) {
          if (this.covers(d, fp.granted[d], e.value)) continue;      // already authorised
          const eligible = layer === "governing" && e.anchored >= this.promoteAfter;
          out.push({
            dimension: d, value: e.value, layer,
            anchored: e.anchored, count: e.count, weight: e.weight, lastSeen: e.last,
            eligible,
            rationale: layer === "proposed"
              ? "AI-class observation only — cannot promote at any volume; re-derive from source or attest"
              : eligible
                ? `${e.anchored} anchored observation(s) — eligible for grant by a signer`
                : `${e.anchored} of ${this.promoteAfter} anchored observations required`,
          });
        }
      }
    }
    return out.sort((a, b) => b.weight - a.weight);
  }

  /* ---------------- IdentityRuntime-compatible surface ---------------- */
  resolve(actorPath, { asOf = null } = {}) {
    const actor = actorPath[0];
    const fp = this.footprint(actor, { asOf });
    if (!fp) throw new IGLError(`actor ${actor} is not in the identity graph`, { phase: "identity", code: "IGL_UNKNOWN_ACTOR" });
    const role = actorPath.length > 1 ? actorPath[actorPath.length - 1] : (this.roles[actor] || [])[0];
    /* fail-closed: an asserted role must be HELD. An actor with no recorded
       roles holds no roles — the empty set is not a wildcard. */
    if (role && !fp.roles.includes(role))
      throw new IGLError(`${actor} does not hold role ${role}`, { phase: "identity", code: "IGL_ROLE_DENIED" });
    return { id: actorPath.join(":"), actor, role, footprint: fp };
  }
}
