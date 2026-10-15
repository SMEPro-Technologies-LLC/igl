# IGL Public-Release Checklist

Use this checklist before making the repository public. File any patent
applications before release because public disclosure may affect patent rights.

## Phase 0: Patent and trademark filings

- [ ] File provisional patent applications covering identity-bound governed
      execution, boundary enforcement as syntax, intent binding, and
      hash-chained traces.
- [ ] Ask a patent attorney to review whether the Apache 2.0 Section 3 patent
      grant is compatible with the filings.
- [ ] File a USPTO trademark application for "IGL", "Identity Governed Logic",
      and the logo if available (IC 9 and IC 42).
- [ ] Register igl.dev and check package registries for igl-lang and igllang.

## Phase 1: Confirm the repository split

- [ ] Public: spec/, core/ (parser + Fuse Turn runtime + WASM), sdk/python,
      sdk/typescript, trace/ schema, mcp/ server, playground/
- [ ] Private, separate repository: enterprise gateway, policy-pack content
      (O&G, higher-ed, healthcare, finance), auditor dashboard, IdP
      integrations, management plane
- [ ] Confirm the public tree does not reference or include private-repository
      code.

## Phase 2: Scan repository contents

- [ ] Scan the full Git history for secrets with `gitleaks detect --source . -v`
      and/or `trufflehog git file://.`
- [ ] If the history contains secrets, rewrite it with `git filter-repo` or
      create a new repository with a signed v1.0.0 import.
- [ ] Remove API keys, tokens, internal URLs, customer names, private roadmap
      notes, and personal email addresses.
- [ ] Check `.env*`, `*.pem`, `*.key`, CI configuration, Dockerfiles, and test
      fixtures for secrets.
- [ ] Review issue trackers, wikis, and project boards before migrating them.

## Phase 3: Legal and community files

- [ ] `LICENSE`: confirm Apache 2.0 details and copyright headers.
- [ ] `NOTICE`: replace `[LEGAL ENTITY NAME]`.
- [ ] `TRADEMARK.md`: replace `[LEGAL ENTITY NAME]` and `[TRADEMARK CONTACT EMAIL]`.
- [ ] `CONTRIBUTING.md`: confirm DCO checks and configure a CLA bot if needed.
- [ ] `SECURITY.md`: add `[SECURITY CONTACT EMAIL]` and a PGP key.
- [ ] `CODE_OF_CONDUCT.md`: add `[CONDUCT CONTACT EMAIL]`.
- [ ] `README.md`: verify links before release.
- [ ] Add copyright headers to source files.

## Phase 4: Release checks

- [ ] Configure CI to run the required tests and other release checks.
- [ ] Protect `main` with required reviews, status checks, and signed commits
      for maintainers.
- [ ] Enable GitHub secret scanning, push protection, and Dependabot.
- [ ] Sign the release tag with `git tag -s v1.0.0 -m "IGL v1.0.0"` and verify
      it with `git tag -v`.
- [ ] Protect package registry accounts with hardware-key two-factor
      authentication before publishing.
- [ ] Publish packages with provenance attestations, such as npm provenance or
      PyPI trusted publishing through GitHub Actions OIDC.
- [ ] Start `CHANGELOG.md` and document the versioning policy.

## Phase 5: Launch

- [ ] Publish the versioned specification at igl.dev/spec.
- [ ] Publish the playground at igl.dev/play.
- [ ] Make the repository public when someone is available to monitor it.
- [ ] Link to the README, specification, and playground in the announcement.
- [ ] Keep a dated record of publication.

## Standing rules after launch

- Respond to confusing uses of the trademarks.
- Never merge a PR that reclassifies provenance or weakens the four bindings.
- Keep the enterprise repo strictly separate; audit imports quarterly.
- Review any license change with counsel. Relicensing may require consent from
  contributors.
