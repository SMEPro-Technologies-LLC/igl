# IGL Public-Release Checklist

Use this as the runbook for flipping the repo public. Items are ordered — the
IP filings come first because public disclosure is irreversible.

## Phase 0 — IP filings (BEFORE anything goes public)

- [ ] Provisional patent application(s) filed covering: identity-bound governed
      execution, boundary enforcement as syntax, intent binding, and
      hash-chained trace/recursion closed loop. (US grace period is 12 months;
      most foreign jurisdictions offer NO grace period after disclosure.)
- [ ] Patent attorney review of the Apache 2.0 Section 3 patent grant — confirm
      its scope is compatible with the pending filings.
- [ ] USPTO trademark application filed for "IGL" and/or "Identity Governed
      Logic" (IC 9 and IC 42), plus logo if available.
- [ ] igl.dev domain secured; also grab igl-lang / igllang variants for
      package-registry names.

## Phase 1 — Decide the open-core split

- [ ] PUBLIC: spec/, core/ (parser + Fuse Turn runtime + WASM), sdk/python,
      sdk/typescript, trace/ schema, mcp/ server, playground/
- [ ] PRIVATE (separate repo): enterprise gateway, policy-pack content
      (O&G, higher-ed, healthcare, finance), auditor dashboard, IdP
      integrations, management plane
- [ ] Confirm no private-repo code is referenced, linked, or stubbed in the
      public tree.

## Phase 2 — Scrub

- [ ] Run secrets scan over FULL history: `gitleaks detect --source . -v`
      and/or `trufflehog git file://.`
- [ ] If history is dirty: either `git filter-repo` to rewrite, or (preferred
      for launch) create a fresh repo with a clean signed v1.0.0 import.
- [ ] Remove: API keys, tokens, internal URLs/hostnames, customer and pilot
      names, roadmap notes, strategy TODOs, personal email addresses.
- [ ] Check `.env*`, `*.pem`, `*.key`, CI config, Dockerfiles, test fixtures —
      fixture data leaks too.
- [ ] Review issue tracker / wiki / project boards if migrating them — they are
      public the moment the repo is.

## Phase 3 — Legal & community files (this folder)

- [ ] `LICENSE` — Apache 2.0 (done; fill copyright owner in source headers)
- [ ] `NOTICE` — fill [LEGAL ENTITY NAME] (done otherwise)
- [ ] `TRADEMARK.md` — fill [LEGAL ENTITY NAME], [TRADEMARK CONTACT EMAIL]
- [ ] `CONTRIBUTING.md` — DCO enforced in CI; add CLA bot (CLA Assistant)
- [ ] `SECURITY.md` — fill [SECURITY CONTACT EMAIL] + PGP key
- [ ] `CODE_OF_CONDUCT.md` — fill [CONDUCT CONTACT EMAIL]
- [ ] `README.md` — done; verify all links once igl.dev pages exist
- [ ] Source-file copyright headers (automate with a license-header tool)

## Phase 4 — Engineering hygiene

- [ ] CI on PRs: build, unit tests, property tests, lint, spec-conformance
- [ ] Branch protection on `main`: require PR reviews, status checks, and
      signed commits for maintainers
- [ ] Enable GitHub secret scanning + push protection, Dependabot
- [ ] Signed release tag: `git tag -s v1.0.0 -m "IGL v1.0.0"` — verify with
      `git tag -v`
- [ ] Package registry accounts secured with hardware-key 2FA BEFORE publishing
      (npm/PyPI account takeover is the most common supply-chain attack on new
      projects)
- [ ] Publish packages with provenance attestations (npm provenance / PyPI
      trusted publishing via GitHub Actions OIDC — no long-lived tokens)
- [ ] CHANGELOG.md started; semver discipline documented

## Phase 5 — Launch

- [ ] Spec published at igl.dev/spec (versioned, archived PDF)
- [ ] Playground live at igl.dev/play
- [ ] Flip repo public during US business hours, with someone watching for 48h
- [ ] Announcement links to README, spec, and playground — in that order
- [ ] Dated publication record preserved (this is your prior-art defense)

## Standing rules after launch

- Trademark enforcement is use-it-or-lose-it: respond to confusing uses.
- Never merge a PR that reclassifies provenance or weakens the four bindings.
- Keep the enterprise repo strictly separate; audit imports quarterly.
- Revisit license choice only with counsel — relicensing requires consent of
  all contributors once external DCO/CLA contributions land.
