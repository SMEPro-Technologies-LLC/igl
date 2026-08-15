// SPDX-License-Identifier: Apache-2.0
/* UDM ↔ AI translation bridge — IGL v0.2 (rev 2, post-review)

       γ : UDM_set     → model_constraint      "decode down"
       α : model_output → UDM_element          "lift up"

       soundness:  α(γ(S)) ⊆ S ∪ {ABSTAIN}

   Abstention is a distinguished outcome, not a member of S — consumers must
   handle it, so the property is stated in the form implemented.

   Review remediations carried in this revision:
     R1  maskPlan is a prefix automaton, not a token union — a recombination
         of admissible values (PR-10 from PR-202/H-10) is unreachable.
     R2  a span value is deterministic ONLY when its location band is
         admissible or its locator is itself deterministic. Provenance is
         deterministic; selection is inference. A held-band location is
         dropped, exactly as §3 defines "held".
     R3  fuzzy edit distance refuses ties and is disabled for codes.
     R4  manifest digests are SHA-256 over canonical (sorted-key) JSON.
     R5  currency parses to integer minor units; span indices are named
         charOffset because that is what they are.
     R7  span refs are schema-validated in α (additionalProperties enforced
         locally), file ids are checked against a corpus manifest, and the
         source document's digest is pinned into the evidence. */

import { IGLError } from "./lexer.js";
import { createHash } from "node:crypto";

export const ABSTAIN = "__ABSTAIN__";

/* ---------------- canonical hashing (R4) ---------------- */
function canonical(x) {
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  if (x && typeof x === "object")
    return "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}";
  return JSON.stringify(x);
}
export const sha256 = s => createHash("sha256").update(s).digest("hex");
const digestOf = obj => sha256(canonical(obj));

/* Slot kinds. `number` is deliberately absent: a quantity is never generated,
   it is located (kind "span") and read. */
const KINDS = new Set(["code", "enum", "span", "text"]);
const SPAN_PARSES = new Set(["currency", "number", "date", "raw"]);

const norm = s => String(s).trim().toLowerCase().replace(/[\s_.]+/g, "-").replace(/-+/g, "-");
function editDistance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export class Bridge {
  constructor({ udm = null, dimensions = {}, strictness = "lattice",
                thresholds = { admissible: 0.75, proposed: 0.4 },
                tokenizer = null, maxEdit = 1 } = {}) {
    Object.assign(this, { udm, dimensions, strictness, thresholds, tokenizer, maxEdit });
  }

  /* =================================================================
     γ — concretization
     ================================================================= */
  gamma(scope, slots, { exemplars = [], model = null, seed = null } = {}) {
    const properties = {}, required = [], plan = {};

    for (const slot of slots) {
      if (!KINDS.has(slot.kind))
        throw new IGLError(
          slot.kind === "number"
            ? `slot ${slot.name}: a quantity may never be generated — declare kind "span" so the value is read from source`
            : `slot ${slot.name}: unknown kind ${slot.kind}`,
          { phase: "bridge", code: "IGL_BAD_SLOT_KIND" });

      if (slot.kind === "code" || slot.kind === "enum") {
        if (!Array.isArray(slot.admissible) || !slot.admissible.length)
          throw new IGLError(`slot ${slot.name}: ${slot.kind} slot needs a non-empty admissible set`,
            { phase: "bridge", code: "IGL_EMPTY_ADMISSIBLE" });
        properties[slot.name] = { type: "string", enum: [...slot.admissible, ABSTAIN] };
        plan[slot.name] = { kind: slot.kind, admissible: [...slot.admissible], dimension: slot.dimension || null };
      } else if (slot.kind === "span") {
        if (!SPAN_PARSES.has(slot.parse))
          throw new IGLError(`slot ${slot.name}: a span slot must declare parse ∈ {${[...SPAN_PARSES].join(", ")}}`,
            { phase: "bridge", code: "IGL_SPAN_NEEDS_PARSE" });
        properties[slot.name] = {
          type: "object",
          description: "Locate the value; do not transcribe it. The system reads the characters at this span.",
          properties: {
            file: { type: "string" },
            charOffset: { type: "integer", minimum: 0 },   /* UTF-16 code units — named for what it is (R5) */
            length: { type: "integer", minimum: 1 },
          },
          required: ["file", "charOffset", "length"],
          additionalProperties: false,
        };
        plan[slot.name] = { kind: "span", parse: slot.parse };
      } else {
        properties[slot.name] = { type: "string" };
        plan[slot.name] = { kind: "text" };
      }
      if (slot.required) required.push(slot.name);
    }

    const schema = { type: "object", properties, required, additionalProperties: false };

    /* R1 — prefix automaton per constrained slot. At each step only tokens
       that continue at least one admissible completion of the emitted prefix
       are allowed. A flat union would admit recombinations (PR-10). */
    let maskPlan = null;
    if (this.tokenizer) {
      maskPlan = {};
      for (const [name, p] of Object.entries(plan)) {
        if (!p.admissible) continue;
        const root = { t: {}, end: false };
        for (const v of [...p.admissible, ABSTAIN]) {
          let node = root;
          for (const id of this.tokenizer.encode(v)) {
            node.t[id] = node.t[id] || { t: {}, end: false };
            node = node.t[id];
          }
          node.end = true;
        }
        maskPlan[name] = { type: "prefix-automaton", trie: root };
      }
    }

    const envelope = {
      scope, schema, plan, maskPlan, exemplars, abstain: ABSTAIN,
      strictness: this.strictness, thresholds: this.thresholds, model, seed,
    };
    envelope.manifest = {
      schemaDigest: digestOf(schema),                    // SHA-256, canonical (R4)
      scopeDigest: digestOf(scope),
      strictness: this.strictness, thresholds: this.thresholds,
      slots: Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.kind])),
      constrainedDecoding: !!maskPlan,
    };
    return envelope;
  }

  /* Walk the automaton: allowed next tokens after a prefix, or null if the
     prefix has already left the language. Drives the logit mask at inference. */
  static maskNext(automaton, prefixIds = []) {
    let node = automaton.trie;
    for (const id of prefixIds) {
      node = node.t[id];
      if (!node) return null;
    }
    return { allowed: Object.keys(node.t).map(Number), accepting: node.end };
  }

  /* ---------------- lattice helpers ---------------- */
  ancestors(dimension, value) {
    const d = this.dimensions[dimension];
    const out = [];
    if (!d || !d.parents) return out;
    let cur = String(value); const seen = new Set();
    while (d.parents[cur] && !seen.has(cur)) { seen.add(cur); cur = d.parents[cur]; out.push(cur); }
    return out;
  }

  project(raw, { admissible, dimension, kind }) {
    const v = String(raw);
    if (v === ABSTAIN) return { value: null, abstained: true, how: "abstain" };
    if (admissible.includes(v)) return { value: v, how: "exact" };

    if (this.strictness === "exact")
      return { value: null, rejected: true, how: "not-in-set", candidate: v };

    if (dimension) {
      const anc = this.ancestors(dimension, v);
      const covering = anc.find(a => admissible.includes(a));
      if (covering) return { value: v, how: "specialised", coveredBy: covering };
      const generalised = admissible.find(a => this.ancestors(dimension, a).includes(v));
      if (generalised)
        return { value: null, rejected: true, how: "generalisation-refused", candidate: v, wouldBroaden: generalised };
    }

    if (this.strictness === "fuzzy") {
      const nv = norm(v);
      const exactNorm = admissible.filter(a => norm(a) === nv);
      if (exactNorm.length === 1) return { value: exactNorm[0], how: "normalised", candidate: v };
      if (exactNorm.length > 1)
        return { value: null, rejected: true, how: "ambiguous", candidate: v, candidates: exactNorm };
      /* R3 — edit distance never applies to codes: regulatory codes are dense
         in edit space (US-TX/US-TN, 211120/211130) and a one-edit repair is a
         different instrument, not a typo. */
      if (kind !== "code") {
        let bestD = Infinity;
        const scored = admissible.map(a => { const d = editDistance(nv, norm(a)); bestD = Math.min(bestD, d); return [a, d]; });
        if (bestD <= this.maxEdit) {
          const minima = scored.filter(([, d]) => d === bestD).map(([a]) => a);
          if (minima.length > 1)
            return { value: null, rejected: true, how: "ambiguous", candidate: v, candidates: minima, distance: bestD };
          return { value: minima[0], how: "fuzzy", candidate: v, distance: bestD };
        }
      }
    }
    return { value: null, rejected: true, how: "not-in-set", candidate: v };
  }

  classify(conf) {
    if (conf === undefined || conf === null) return "unstated";
    const c = Number(conf);
    if (!Number.isFinite(c)) return "held";
    if (c >= this.thresholds.admissible) return "admissible";
    if (c >= this.thresholds.proposed) return "proposed";
    return "held";
  }

  /* =================================================================
     α — abstraction
     `source(fileId) -> string` resolves documents.
     `manifest` (optional) — { fileId: sha256(sourceText) }: a span may only
     cite a file the corpus knows, and the citation pins the digest so the
     evidence survives re-OCR or re-export (R7).
     ================================================================= */
  alpha(raw, envelope, { source = null, confidences = {}, manifest = null } = {}) {
    const out = { slots: {}, projections: [], unmapped: [], abstained: [], verification: null };
    const payload = typeof raw === "string" ? safeParse(raw) : raw;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      out.unmapped.push({ slot: "*", reason: "model output was not an object under the declared schema" });
      return out;
    }

    /* R7 — additionalProperties enforced locally, not just declared:
       undeclared top-level keys are surfaced, never silently read. */
    for (const key of Object.keys(payload))
      if (!envelope.plan[key]) out.unmapped.push({ slot: key, reason: "undeclared property — outside the emitted schema" });

    for (const [name, p] of Object.entries(envelope.plan)) {
      const got = payload[name];
      if (got === undefined || got === null) { out.unmapped.push({ slot: name, reason: "absent" }); continue; }

      /* ---- span slots ---- */
      if (p.kind === "span") {
        if (typeof got !== "object" || Array.isArray(got)) {
          out.unmapped.push({ slot: name, reason: "span reference is not an object" }); continue;
        }
        const extra = Object.keys(got).filter(k => !["file", "charOffset", "length"].includes(k));
        if (extra.length) {                                   /* R7: shape is enforced, not advisory */
          out.unmapped.push({ slot: name, reason: `span violates schema — unexpected propert${extra.length > 1 ? "ies" : "y"}: ${extra.join(", ")}` });
          continue;
        }
        const ref = got;
        if (typeof ref.file !== "string" || !Number.isInteger(ref.charOffset) || !Number.isInteger(ref.length) || ref.charOffset < 0 || ref.length < 1) {
          out.unmapped.push({ slot: name, reason: "malformed span reference" }); continue;
        }
        if (manifest && !(ref.file in manifest)) {
          out.unmapped.push({ slot: name, reason: `file ${ref.file} is not in the corpus manifest`, ref }); continue;
        }
        if (!source) { out.unmapped.push({ slot: name, reason: "no source resolver supplied; a span cannot be dereferenced" }); continue; }
        const text = source(ref.file);
        if (typeof text !== "string") { out.unmapped.push({ slot: name, reason: `source ${ref.file} not resolvable` }); continue; }
        const docDigest = sha256(text);
        if (manifest && manifest[ref.file] !== docDigest) {
          out.unmapped.push({ slot: name, reason: `source ${ref.file} digest mismatch — document changed since the manifest was cut`, ref }); continue;
        }
        if (ref.charOffset + ref.length > text.length) {
          out.unmapped.push({ slot: name, reason: "span out of bounds", ref }); continue;
        }
        const chars = text.slice(ref.charOffset, ref.charOffset + ref.length);
        const parsed = parseSpan(chars, p.parse);
        if (parsed === null) { out.unmapped.push({ slot: name, reason: `span did not parse as ${p.parse}`, raw: chars, ref }); continue; }

        /* R2 — provenance is deterministic; selection is inference.
             admissible location → the value is an anchor
             proposed  location → the value is proposed, trace class ai
             held      location → dropped, exactly as "held" is defined
             unstated  location → proposed; absence of a confidence is not
                                   evidence of confidence                    */
        const band = this.classify(confidences[name]);
        if (band === "held") {
          out.unmapped.push({ slot: name, reason: `location confidence below the proposed floor — held, not asserted`, ref, confidence: confidences[name] });
          continue;
        }
        out.slots[name] = {
          value: parsed,
          ...(p.parse === "currency" ? { units: "minor" } : {}),
          valueClass: band === "admissible" ? "deterministic" : "proposed",
          locationClass: "ai",
          locationConfidence: confidences[name] ?? null,
          locationClassBand: band,
          evidence: { file: ref.file, charOffset: ref.charOffset, length: ref.length, chars, docSha256: docDigest },
        };
        continue;
      }

      /* ---- text ---- */
      if (p.kind === "text") {
        if (typeof got !== "string") { out.unmapped.push({ slot: name, reason: "text slot did not receive a string" }); continue; }
        out.slots[name] = { value: got, valueClass: "ai", confidence: confidences[name] ?? null, class: this.classify(confidences[name]) };
        continue;
      }

      /* ---- code / enum ---- */
      if (typeof got !== "string") { out.unmapped.push({ slot: name, reason: `${p.kind} slot did not receive a string` }); continue; }
      const proj = this.project(got, p);
      if (proj.abstained) { out.abstained.push({ slot: name }); continue; }
      if (proj.rejected) {
        out.unmapped.push({ slot: name, reason: proj.how, candidate: proj.candidate,
          ...(proj.candidates ? { candidates: proj.candidates } : {}),
          ...(proj.wouldBroaden ? { wouldBroaden: proj.wouldBroaden } : {}) });
        continue;
      }
      if (proj.how !== "exact") out.projections.push({ slot: name, ...proj });
      out.slots[name] = {
        value: proj.value, valueClass: "ai",
        confidence: confidences[name] ?? null,
        class: this.classify(confidences[name]),
        ...(proj.how !== "exact" ? { projectedBy: proj.how } : {}),
      };
    }

    if (this.udm && typeof this.udm.Validate === "function") {
      try { out.verification = this.udm.Validate({ Target: Object.fromEntries(Object.entries(out.slots).map(([k, v]) => [k, v.value])), Ruleset: envelope.scope?.Ruleset || "default" }); }
      catch (e) { out.verification = { ok: false, failures: [e.message] }; }
    }
    return out;
  }

  /* soundness: α(γ(S)) ⊆ ↓S ∪ {ABSTAIN}
     ↓S is the downward closure of the admissible set — under lattice
     strictness a SPECIALISATION of an admissible value lies inside the
     governed region (US-TX admits TX-RRC beneath it), while anything broader
     or lateral does not. Span/text slots are outside this property and carry
     their own guarantee: fidelity to cited characters. */
  roundTripSound(slots, rawOutput, { source = null, manifest = null } = {}) {
    const env = this.gamma({}, slots);
    const lifted = this.alpha(rawOutput, env, { source, manifest });
    for (const [name, v] of Object.entries(lifted.slots)) {
      const p = env.plan[name];
      if (!p || !p.admissible) continue;
      const inSet = p.admissible.includes(v.value);
      const underSet = p.dimension
        ? this.ancestors(p.dimension, v.value).some(a => p.admissible.includes(a))
        : false;
      if (!inSet && !underSet) return { sound: false, slot: name, escaped: v.value };
    }
    return { sound: true, lifted };
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

/* Deterministic parsers. No inference, no repair.
   currency → integer minor units (R5): binary floating point is the wrong
   representation for money by the same argument that bars model-generated
   numbers. `number` → canonical decimal string, for the same reason. */
export function parseSpan(chars, kind) {
  const t = String(chars).trim();
  switch (kind) {
    case "currency": {
      const cleaned = t.replace(/[$\s,]/g, "").replace(/^\((.*)\)$/, "-$1");
      const m = cleaned.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
      if (!m) return null;
      const sign = m[1] === "-" ? -1 : 1;
      const minor = BigInt(m[2]) * 100n + BigInt((m[3] || "0").padEnd(2, "0"));
      const asNum = sign * Number(minor);
      return Number.isSafeInteger(asNum) ? asNum : sign === -1 ? "-" + minor.toString() : minor.toString();
    }
    case "number": {
      const cleaned = t.replace(/[\s,]/g, "");
      if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
      return cleaned;                              /* canonical decimal string */
    }
    case "date": {
      const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/) || t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) return null;
      const iso = m[0].includes("-") ? m[0]
        : `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
      return Number.isNaN(Date.parse(iso)) ? null : iso;
    }
    case "raw": default: return t.length ? t : null;
  }
}
