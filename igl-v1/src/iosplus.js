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
  constructor({ graph = null, signer = null, graphVersion = "graph-v1", now = () => new Date().toISOString(), seed = 1, matrices = null } = {}) {
    this.graph = graph || { nodes: {}, edges: [] };   // identity graph (Article VIII)
    this.signer = signer || Signer.generate("ios-plus-default");
    this.graphVersion = graphVersion;
    this.now = now;
    this.seed = seed;
    this._seq = 0;
    this.auditLog = [];
    this.traceStore = [];
    this.knownMatrixDigests = new Set();
    /* Matrices loaded from the backing store (Cloudflare D1 udmcore), keyed by
       `${source}|${version}`. When a program injects a constraint whose source and
       version are present here, the real UDM cells are used; otherwise IOS+ falls
       back to the deterministic stand-in. See src/d1.js. */
    this.matrices = matrices || {};
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

  /* Section 8.02 / Schedule B-4: own level raised to the max along INHERITS_FROM,
     depth-bounded, then clamped. Graphless (no edges) means the declared value
     governs, which is the behaviour the C-2 note describes. */
  resolveAuthority(uri, node, depth = 0, seen = new Set()) {
    let a = node && typeof node.authority === "number" ? node.authority : 0.0;
    if (depth >= 8 || seen.has(uri)) return Math.max(0, Math.min(1, a));
    seen.add(uri);
    for (const e of this.graph.edges) {
      if (e.type === "INHERITS_FROM" && e.from === uri) {
        const parent = this.graph.nodes[e.to];
        if (parent) a = Math.max(a, this.resolveAuthority(e.to, parent, depth + 1, seen));
      }
    }
    return Math.max(0, Math.min(1, a));
  }

  /* ios.getConstraintMatrix(ctx) - Section 9.01 derivation, digest per 3.03.
     Deterministic stand-in: per-token weights in [0,1] derived from the source
     and version, with a subset forced to 0.0 so support restriction is visible.
     A real IOS+ selects rows and columns from the UDM jurisdiction matrix. */
  getConstraintMatrix(decl) {
    const { source, version } = decl;
    // Prefer a matrix loaded from the backing store (D1 udmcore) when present.
    const key = `${source}|${version}`;
    if (this.matrices[key]) {
      const m = this.matrices[key];
      this.knownMatrixDigests.add(m.digest);
      return m;
    }
    const cells = VOCAB.map((tok, i) => {
      const h = parseInt(sha256(`${source}|${version}|${tok}`).slice(0, 8), 16);
      // deterministically forbid a couple of tokens to demonstrate w=0 support restriction
      if (tok === "deny" || tok === "redact") return 0.0;
      return Number(((h % 1000) / 1000 * 0.5 + 0.5).toFixed(4));  // in [0.5, 1.0]
    });
    const matrix = { source, version, vocab: VOCAB, cells };
    matrix.digest = sha256(canonical(matrix.cells));
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

/* Authority policy decision (ADR 0001, item 3), resolved 2026-08-13.
   Two mechanisms, two rules, chosen for least privilege.

   INHERITS_FROM (structural inheritance): an identity's effective authority is the
   MAX along its inheritance chain, depth-bounded to 8. A role structurally holds
   at least what it inherits. This is resolveAuthority above, unchanged.

   DELEGATE TO (explicit delegation): a delegated FUSE runs at the target's OWN
   DECLARED authority, never the target's inherited elevation. Delegation reaches a
   named scope, it does not also borrow that scope's inherited super-authority.

   The two rules only diverge when a delegated target itself inherits higher.
   Raise-to-max would let the delegatee wield the inherited level. The decided
   min-clamp holds the delegatee to the declared level, so a delegation edge can
   never be a ladder to authority the target was not itself directly granted.
   effectiveDelegatedAuthority is min(declared, resolved), and since resolved is
   always at least declared, that is exactly the declared level. */
export const AUTHORITY_POLICY = "inherits-from:raise-to-max; delegate-to:min-clamp-to-declared";

export function effectiveDelegatedAuthority(declaredAuthority, resolvedAuthority) {
  const d = typeof declaredAuthority === "number" ? declaredAuthority : 0;
  const r = typeof resolvedAuthority === "number" ? resolvedAuthority : d;
  return Math.max(0, Math.min(1, Math.min(d, r)));
}

export function valueOf(v) {
  if (!v || typeof v !== "object") return v;
  if (v.kind === "Str" || v.kind === "Num" || v.kind === "Sym") return v.value;
  if (v.kind === "Ref") return v.name;
  if (v.kind === "Array") return v.items.map(valueOf);
  if (v.kind === "Delegate") return { delegateTo: valueOf(v.to) };
  return v;
}
