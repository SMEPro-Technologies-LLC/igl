# Release checklist: going public, then production

The living list for the canonical repository (SMEPro-Technologies-LLC/igl).
Items are marked done only when verified in this tree.

## Done in this tree

- Apache-2.0 applied: LICENSE, NOTICE, package.json flipped. TRADEMARKS.md ties
  the IGL name to the conformance suite.
- Community files: CODE_OF_CONDUCT.md (contact conduct@smepro.tech),
  SECURITY.md (private reporting, scope, known-insecure dev seeds named),
  CONTRIBUTING.md (suite green + ADR for semantic changes).
- Authority law unified as ADR 0002 (MIN-intersection composition, clamped
  explicit delegation), superseding ADR 0001 decision 3; encoded and tested.
- README quickstart: clone to verified receipt in under five minutes.
- Public-suitability sweep of docs/spec and examples (see cleanup script):
  confidential whitepaper, third-party product marketing, op-ed drafts, and the
  litigation-shaped example removed from the public tree.

## Human actions before flipping visibility (in order)

1. Run `go-public.ps1` step CLEAN (removes non-public documents), then step
   SQUASH (rewrites history to a single clean commit, because the first commit
   contains the proprietary license text and a confidential PDF), then push.
2. Counsel review: Apache-2.0 plus TRADEMARKS.md, and the removed-documents
   list. A day, not a month.
3. On GitHub (Settings): enable secret scanning AND push protection; enable
   private vulnerability reporting; enable Discussions if wanted; add branch
   protection on main requiring the "IGL v1.0 reference CI" checks; add topics
   (governance, ai, language, receipts, compliance, cloudflare-workers) and a
   social preview image.
4. Flip visibility to public. Tag v1.0.0-ref. Release notes from the two ADRs.

## Production-ready (open, tracked, not blocking public)

- Production signing seed in a managed secret (GitHub secret + Worker secret),
  public key published; rotate away from anything ever shown in a terminal.
- External security review against igl-v1/docs/THREAT_MODEL.md. The single
  biggest gate: no production claim precedes it.
- Scale and soak: matrix fetch, receipt chain, audit store.
- A real model behind the vendor seam with the boundary check enforced on
  generated output; semantic crosswalk per model.
- Gateway deployed (workers/igl-gateway) with auth or rate limiting; the
  deployed demonstration Worker gains the same before it is advertised.
- Counsel: evidentiary standing of a Governance Receipt per jurisdiction.
- One bounded pilot: one real filing, one real user, then GA language.
