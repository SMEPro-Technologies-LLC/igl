/* Section 9.02 / Section 12.03 — the semantic crosswalk, made explicit.

   The live UDM service governs REASONING PATHS (path-production-report,
   path-pii-disclosure, ...). The interpreter's FUSE runs over the model
   VOCABULARY. The spec deliberately leaves the mapping between the two as a
   visible seam (Section 12.03). This module IS that seam: a declared, versioned,
   digested mapping from vocabulary tokens to the reasoning paths they render.

   Composition law (ADR 0002, and the 'Native IGL Model' analysis):
     - a token's weight  = MIN over the weights  of every path it renders
     - a token's ceiling = MIN over the ceilings of every path it renders
     - permissions intersect; nothing in the bridge may AMPLIFY permission
   Zero discipline ("approximate bridges cannot create hard zero", except by
   fail-closed omission):
     - a projected weight is 0 only because (a) a mapped path carries a
       provision-cited 0 in the live matrix, or (b) the token is UNMAPPED and
       fail-closed applies. Which of the two happened is recorded per token.
     - ABSTAIN is always reachable (weight 1) — a forced choice from a
       constrained vocabulary is confident garbage (BRIDGE.md 2.1).
     - control tokens carry no governed content; they pass at weight 1 unless a
       module explicitly maps them.

   The registry below maps each udm:// module source to the live service
   coordinates {jurisdiction, agency} and its token->paths mapping. The mapping
   is data, its digest is carried into every projected constraint, and the tests
   in test/resolve.mjs hold the composition law over it. */

import { sha256, canonical } from "./sign.js";
import { VOCAB } from "./iosplus.js";

export const CONTROL_TOKENS = ["allow", "deny", "escalate", "ABSTAIN"];

/* Module registry: udm:// source -> live coordinates + token->paths crosswalk. */
export const MODULES = {
  "udm://module/tx-rrc-production-v3": {
    jurisdiction: "US-TX", agency: "RRC",
    tokenPaths: {
      report:    ["path-production-report", "path-well-identity"],
      file:      ["path-production-report", "path-well-identity"],
      summarize: ["path-financial-detail"],
      redact:    ["path-pii-disclosure"],
    },
  },
  "udm://module/tx-rrc-filing-v2": {
    jurisdiction: "US-TX", agency: "RRC",
    tokenPaths: {
      report:    ["path-production-report", "path-well-identity"],
      file:      ["path-production-report", "path-well-identity"],
      summarize: ["path-financial-detail"],
      redact:    ["path-pii-disclosure"],
    },
  },
  "udm://module/gdpr-v4": {
    jurisdiction: "EU", agency: "EDPB",
    tokenPaths: {
      report:    ["path-lawful-basis"],
      file:      ["path-cross-border"],
      summarize: ["path-profiling"],
      redact:    ["path-art9-special"],
    },
  },
};

export function crosswalkFor(source) {
  const m = MODULES[source];
  if (!m) {
    const e = new Error(`no crosswalk registered for ${source}; cannot bind to the live matrix`);
    e.code = "CROSSWALK_UNMAPPED";
    throw e;
  }
  return m;
}

export function crosswalkDigest(module_) {
  return sha256(canonical({ jurisdiction: module_.jurisdiction, agency: module_.agency, tokenPaths: module_.tokenPaths, control: CONTROL_TOKENS }));
}

/* Project a derived path-space constraint (src/udm.js deriveConstraint output)
   onto the interpreter vocabulary under the MIN-composition law. */
export function projectConstraint(constraint, module_, { vocab = VOCAB, provenance = "pinned" } = {}) {
  const cells = [], ceilings = [], zeroReasons = {};
  const mandatoryGroups = [];

  for (const tok of vocab) {
    const paths = module_.tokenPaths[tok];
    if (paths && paths.length) {
      let w = 1, c = 1;
      for (const p of paths) {
        if (!(p in constraint.weights)) { w = 0; c = 0; zeroReasons[tok] = `path ${p} absent from live matrix — fail closed`; break; }
        w = Math.min(w, constraint.weights[p]);
        c = Math.min(c, constraint.ceilings[p]);
        if (constraint.weights[p] === 0) zeroReasons[tok] = `provision: ${p} carries 0 in ${constraint.source}@${constraint.version}`;
      }
      cells.push(w); ceilings.push(c);
    } else if (CONTROL_TOKENS.includes(tok)) {
      cells.push(1); ceilings.push(1);            // ungoverned control action; ABSTAIN always reachable
    } else {
      cells.push(0); ceilings.push(0);            // unmapped content token: fail closed
      zeroReasons[tok] = "unmapped token — fail closed";
    }
  }

  // mandatory disclosure: the union of tokens rendering a mandatory path must carry mass
  for (const p of constraint.paths) {
    if (constraint.mandatory[p]) {
      const toks = vocab.filter(t => (module_.tokenPaths[t] || []).includes(p));
      if (toks.length) mandatoryGroups.push({ path: p, tokens: toks });
    }
  }

  return {
    source: constraint.source, version: constraint.version, matrixId: constraint.matrixId,
    vocab, cells, ceilings, mandatoryGroups, zeroReasons,
    digest: constraint.digest,                     // the SERVICE-computed digest — receipts bind to this
    crosswalkDigest: crosswalkDigest(module_),
    provenance,                                    // "live" | "pinned" — never "standin" on this path
    strictness: "HARD",
  };
}
