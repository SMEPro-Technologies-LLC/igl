## What

<!-- One concern per PR. Link the issue or IEP. -->

Closes #

## Why

## How it was verified

- [ ] Tests added or updated; `npm test` passes locally
- [ ] If `spec/openapi.yaml` changed: `npx --yes @redocly/cli@1 lint spec/openapi.yaml` passes, version bumped, `spec/README.md` and `CHANGELOG.md` updated
- [ ] If governance-critical code changed (identity check, boundary evaluation, hash chain, provenance): tests cover the invariant and no provenance class is upgraded
- [ ] `CHANGELOG.md` updated under Unreleased
- [ ] Every commit is signed off (`git commit -s`)
