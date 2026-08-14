# Public release checklist — IGL v1.0 reference

State as of 2026-08-14 (overnight close-out run). ✔ done · ▶ next command ·
◻ open decision/work.

## Gate 1 — Truth of the core claims (P0) — CLOSED in the working tree

- ✔ Default FUSE path binds the resolved live/pinned matrix; stand-ins
  quarantined behind `offline: true` with tainted digests and signed
  provenance (ADR 0002).
- ✔ Explicit, digested crosswalk for the Section 12.03 seam, under test
  (test/resolve.mjs, 24 checks).
- ✔ Graded ceilings + mandatory disclosure enforced after FUSE; HARD halts
  seal a partial trace and issue no receipt.
- ✔ Authority composes by intersection (MIN); delegation switches identity;
  both WellSite paths tested (suite §K).
- ✔ ADR 0001 accepted; ADR 0002 records the decisions; readiness docs updated.
- ✔ Suite: 107/107 locally. Wire check 2026-08-14: live digests match pinned
  (US-TX/RRC 1252a4e5…, EU/EDPB c4dd7ac3…); wire-bound receipts committed
  under artifacts/.

## Gate 2 — Land it (requires the repo owner's shell)

- ▶ Install the CI workflow (protected path, one manual copy):
  `Move-Item C:\Users\admin\igl-push\ci.yml.pending C:\Users\admin\igl-push\.github\workflows\ci.yml -Force`
- ▶ `git checkout -b p0-closeout ; git add -A ; git commit -m "P0 close-out: live-by-default FUSE binding, explicit crosswalk, MIN authority (ADR 0002), tainted stand-ins, ceiling enforcement, live-proof CI" ; git push -u origin p0-closeout`
- ▶ Open the PR; require both CI jobs green (hermetic + live-proof). The
  live-proof job mints the direct-fetch live receipts on GitHub runners and
  uploads them as artifacts — that closes P0-1 and P0-2 by third-party
  infrastructure.
- ◻ Branch protection on main: require CI, forbid force-push.

## Gate 3 — Public-release hygiene

- ◻ LICENSE decision (docs/LICENSING_DECISION.md) — blocking for any public use.
- ✔ SECURITY.md (coordinated disclosure, scoped to the governance guarantees).
- ◻ Rotate/retire the dev signing seed for any receipt published as
  authoritative; move to a KMS/secret-backed seed (P1).
- ◻ External security review against docs/THREAT_MODEL.md (P1).
- ◻ Reconcile public materials with the shipped model: update any copy that
  says "93 checks" (now 107) or calls the vector→vocabulary seam "provisional"
  (now an explicit, digested, tested crosswalk; the open item is per-model
  tokenizer coverage, tracked for v1.1).
- ◻ README quickstart pass for first-time cloners (install, npm test,
  run-wellsite, verify — 5 minutes to first verified receipt).

## Gate 4 — After the repo is public

- ◻ Tag v1.0.0-ref; GitHub release notes from the ADRs.
- ◻ Publish the verifier as a public page (receipt → verdict).
- ◻ Constraint-pack/crosswalk contribution guide (how a new module registers
  its jurisdiction mapping).
