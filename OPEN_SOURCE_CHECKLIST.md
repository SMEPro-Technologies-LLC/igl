# IGL Public-Release Checklist

Use this checklist to prepare the repository for public release. Complete the
items in order. File patent applications before public disclosure.

## Phase 0: IP filings (before public release)

- [ ] Provisional patent application(s) filed covering: identity-bound governed
      execution, boundary enforcement as syntax, intent binding, and
      hash-chained trace/recursion closed loop. (US grace period is 12 months;
      most foreign jurisdictions offer NO grace period after disclosure.)
- [ ] Ask a patent attorney to review the Apache 2.0 Section 3 patent grant and confirm
      its scope is compatible with the pending filings.
- [ ] USPTO trademark application filed for "IGL" and/or "Identity Governed
      Logic" (IC 9 and IC 42), plus logo if available.
- [ ] igl.dev domain secured; also grab igl-lang / igllang variants for
      package-registry names.

## Phase 1: Decide the open-core split

- [ ] PUBLIC: spec/, core/ (parser + Fuse Turn runtime + WASM), sdk/python,
      sdk/typescript, trace/ schema, mcp/ server, playground/
- [ ] PRIVATE (separate repo): enterprise gateway, policy-pack content
      (O&G, higher-ed, healthcare, finance), auditor dashboard, IdP
      integrations, management plane
- [ ] Confirm no private-repo code is referenced, linked, or stubbed in the
      public tree.

## Phase 2: Remove private material

- [ ] Run secrets scan over FULL history: `gitleaks detect --source . -v`
      and/or `trufflehog git file://.`
- [ ] If history is dirty: either `git filter-repo` to rewrite, or (preferred
      for launch) create a fresh repo with a clean signed v1.0.0 import.
- [ ] Remove: API keys, tokens, internal URLs/hostnames, customer and pilot
      names, roadmap notes, strategy TODOs, personal email addresses.
- [ ] Check `.env*`, `*.pem`, `*.key`, CI configuration, Dockerfiles, and test fixtures.
- [ ] Check fixture data for leaks.
- [ ] Review any issue tracker, wiki, or project board you plan to migrate.
      These become public when the repository does.

## Phase 3: Legal and community files

- [ ] `LICENSE`: Apache 2.0 is in place; add the copyright owner to source headers.
- [ ] `NOTICE`: fill in [LEGAL ENTITY NAME].
- [ ] `TRADEMARK.md`: fill in [LEGAL ENTITY NAME] and [TRADEMARK CONTACT EMAIL].
- [ ] `CONTRIBUTING.md`: enforce DCO in CI and add the CLA bot (CLA Assistant).
- [ ] `SECURITY.md`: fill in [SECURITY CONTACT EMAIL] and the PGP key.
- [ ] `CODE_OF_CONDUCT.md`: fill in [CONDUCT CONTACT EMAIL].
- [ ] `README.md`: verify all links after the igl.dev pages are available.
- [ ] Source-file copyright headers (automate with a license-header tool)

## Phase 4: Engineering checks

- [ ] CI on PRs: build, unit tests, property tests, lint, spec-conformance
- [ ] Branch protection on `main`: require PR reviews, status checks, and
      signed commits for maintainers
- [ ] Enable GitHub secret scanning + push protection, Dependabot
- [ ] Sign the release tag with `git tag -s v1.0.0 -m "IGL v1.0.0"` and verify it with
      `git tag -v`
- [ ] Package registry accounts secured with hardware-key 2FA BEFORE publishing
      (npm/PyPI account takeover is the most common supply-chain attack on new
      projects)
- [ ] Publish packages with provenance attestations (npm provenance / PyPI
      trusted publishing via GitHub Actions OIDC, with no long-lived tokens)
- [ ] CHANGELOG.md started; semver discipline documented

## Phase 5: Launch

- [ ] Spec published at igl.dev/spec (versioned, archived PDF)
- [ ] Playground live at igl.dev/play
- [ ] Flip repo public during US business hours, with someone watching for 48h
- [ ] Link the announcement to the README, specification, and playground, in that order.
- [ ] Dated publication record preserved (this is your prior-art defense)

## Standing rules after launch

- Trademark enforcement is use-it-or-lose-it: respond to confusing uses.
- Never merge a PR that reclassifies provenance or weakens the four bindings.
- Keep the enterprise repo strictly separate; audit imports quarterly.
- Revisit the license only with counsel. Relicensing requires consent from
  all contributors once external DCO/CLA contributions land.
