/* IGL v1.0 reference runtime - IOS+ orchestrator (Article X).
   Provides the six service interfaces of Section 10.04: identity resolution,
   constraint matrix provision, receipt signing, trace logging, identity-graph
   query, and monotonic sequence numbers. The identity graph and the constraint
   source are in-memory stand-ins; each is a seam onto real UDM / graph services. */

import { sha256, canonical, Signer } from "./sign.js";

/* A small fixed vocabulary. The governed distribution is defined over it so the
   FUSE step is concrete and recomputable. In a real deployment this is the model
   tokenizer's vocabulary and the crosswalk of Section 9.02 maps onto it; that
   mapping is the part Section 12.03 leaves open and is NOT modelled here. */
export const VOCAB = ["allow", "deny", "escalate", "report", "summarize", "redact", "file", "ABSTAIN"];

export class IOSPlus {
  constructor({ graph = null, signer = null, graphVersion = "graph-v1", now = () => new Date().toISOString(), seed = 1, matrices = null, offline = false } = {}) {
    this.graph = graph || { nodes: {}, edges: [] };   // identity graph (Article VIII)
    this.signer = signer || Signer.generate("ios-plus-default");
    this.graphVersion = graphVersion;
    this.now = now;
    this.seed = seed;
    this._seq = 0;
    this.auditLog = [];
    this.traceStore = [];
    this.knownMatrixDigests = new Set();
    /* Resolved constraint matrices keyed `${source}|${version}` — the output of
       src/resolve.js (live fetch or pinned fixtures, projected through the
       crosswalk). This is the DEFAULT execution path: a udm:// constraint that
       is not present here fails closed (CONSTRAINT_SOURCE_UNRESOLVED).
       The deterministic stand-in survives ONLY behind `offline: true`, for
       language-conformance testing; its digests are prefixed "standin-" so a
       stand-in can never impersonate a service digest in any receipt. */
    this.matrices = matrices || {};
    this.offline = !!offline;
  }

  /* ios.nextSequenceNo() */
  nextSequenceNo() { return ++this._seq; }

  /* ios.resolveIdentity(uri) - Section 7.02 resolution, Section 8.02 authority.
     `declared` carries the operand fields lifted from the Program so a program
     that declares its identities inline resolves without an external graph. */
  resolveIdentity(uri, declared = null) {
    const node = this.graph.nodes[uri] || (declared ? { authority: declared.authority, boundary: declared.boundary } : null);
    if (!node) { const e = new Error(`identity ${uri} not found`); e.code = "IDENTITY_NOT_FOUND"; throw e; }
    const authority = this.resolveAuthority(uri, node);
    return {
      id: uri,
      authority,
      boundary: declared ? declared.boundary : node.boundary,
      exceptions: declared ? (declared.exceptions || []) : (node.exceptions || []),
      propagation: declared ? declared.propagation : (node.propagation || "INHERIT"),
    };
  }

  /* Section 8.02, as decided by ADR 0002: authority composes by INTERSECTION.
     Effective authority = MIN(own declared level, effective authority of every
     INHERITS_FROM parent), depth-bounded and cycle-safe. Inheritance can only
     restrict — it can NEVER amplify. The only sanctioned way to act at a higher
     level is explicit declared delegation, which switches the acting identity
     to one that holds its own granted authority (the WellSite escalation).
     Graphless (no edges) means the declared value governs, unchanged. */
  resolveAuthority(uri, node, depth = 0, seen = new Set()) {
    let a = node && typeof node.authority === "number" ? node.authority : 0.0;
    if (depth >= 8 || seen.has(uri)) return Math.max(0, Math.min(1, a));
    seen.add(uri);
    for (const e of this.graph.edges) {
      if (e.type === "INHERITS_FROM" && e.from === uri) {
        const parent = this.graph.nodes[e.to];
        if (parent) a = Math.min(a, this.resolveAuthority(e.to, parent, depth + 1, seen));
      }
    }
    return Math.max(0, Math.min(1, a));
  }

  /* ios.getConstraintMatrix(ctx) - Section 9.01 derivation, digest per 3.03.
     DEFAULT PATH: return the resolved live/pinned matrix (src/resolve.js). A
     udm:// source with no resolved matrix FAILS CLOSED — the deterministic
     stand-in is reachable only under the explicit `offline` flag, and its
     digest is prefixed "standin-" so it can never pass for a service digest. */
  getConstraintMatrix(decl) {
    const { source, version } = decl;
    const key = `${source}|${version}`;
    if (this.matrices[key]) {
      const m = this.matrices[key];
      this.knownMatrixDigests.add(m.digest);
      return m;
    }
    if (!this.offline) {
      const e = new Error(`constraint ${source}@${version} is not resolved against the UDM service; ` +
        `resolve with src/resolve.js (live or pinned) before running, or pass offline:true for conformance testing`);
      e.code = "CONSTRAINT_SOURCE_UNRESOLVED"; e.phase = "exec";
      throw e;
    }
    const cells = VOCAB.map((tok, i) => {
      const h = parseInt(sha256(`${source}|${version}|${tok}`).slice(0, 8), 16);
      // deterministically forbid a couple of tokens to demonstrate w=0 support restriction
      if (tok === "deny" || tok === "redact") return 0.0;
      return Number(((h % 1000) / 1000 * 0.5 + 0.5).toFixed(4));  // in [0.5, 1.0]
    });
    const matrix = { source, version, vocab: VOCAB, cells, provenance: "standin" };
    matrix.digest = "standin-" + sha256(canonical(matrix.cells));
    this.knownMatrixDigests.add(matrix.digest);
    return matrix;
  }

  /* Boundary tensor -> per-token mass ceilings (Section 7.03). Deterministic
     stand-in derived from the jurisdiction; generous by default so ordinary runs
     are COMPLIANT, with a tighter option for demonstrating a HARD violation. */
  ceilingsFor(tensor, { tight = false } = {}) {
    const juris = valueOf(tensor.fields.jurisdiction);
    return VOCAB.map(tok => {
      if (tok === "ABSTAIN") return 1.0;
      const h = parseInt(sha256(`${juris}|${tok}`).slice(0, 8), 16);
      const base = tight ? 0.30 : 0.999;
      return Number((base + (h % 100) / 100 * (1 - base)).toFixed(4));
    });
  }

  /* ios.signReceipt(fields) */
  signReceipt(fields) { return this.signer.signReceipt(fields); }

  /* ios.logTrace(trace) */
  logTrace(trace) {
    const uuid = "trc-" + sha256(canonical(trace) + ":" + this.traceStore.length).slice(0, 16);
    this.traceStore.push({ uuid, trace });
    return uuid;
  }

  audit(entry) { this.auditLog.push({ at: this.now(), ...entry }); }
}

export function valueOf(v) {
  if (!v || typeof v !== "object") return v;
  if (v.kind === "Str" || v.kind === "Num" || v.kind === "Sym") return v.value;
  if (v.kind === "Ref") return v.name;
  if (v.kind === "Array") return v.items.map(valueOf);
  if (v.kind === "Delegate") return { delegateTo: valueOf(v.to) };
  return v;
}
