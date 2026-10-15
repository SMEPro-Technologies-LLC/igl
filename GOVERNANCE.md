# Governance

## Roles

**Maintainers** review and merge changes, cut releases, and hold the final say on the language, the runtime and the contract. They are listed in [MAINTAINERS.md](./MAINTAINERS.md) and enforced in `.github/CODEOWNERS`. **Contributors** are anyone with a merged change. Becoming a maintainer is by invitation of the existing maintainers after sustained, high-quality contribution.

## Decisions

Day-to-day decisions are made in pull requests. Changes to the language, the trace schema or the platform contract go through an IGL Enhancement Proposal (IEP) issue first, stay open for comment for at least seven days, and are accepted by maintainer consensus. Accepted IEPs that change architecture are recorded as an ADR in `docs/adr/`.

The four bindings (identity, boundary, intent, trace) and the provenance rule (assigned by capture route, never by payload) are invariants. Proposals that weaken them are declined without a vote.

## Releases

Releases follow SemVer and are cut from `main` by a maintainer: `CHANGELOG.md` is updated, the version is bumped, the tag is signed, the `release` workflow publishes the GitHub release and the npm package with provenance.

## Stewardship

IGL is stewarded by SMEPro Technologies LLC, which holds the trademarks (`TRADEMARK.md`). The code is Apache-2.0 and stays Apache-2.0; the DCO/CLA arrangement exists so the steward can also offer commercial licenses.
