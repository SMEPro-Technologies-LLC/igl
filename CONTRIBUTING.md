# Contributing to IGL

Thank you for your interest in contributing. IGL is a governance runtime, the bar for changes is deliberately high, because the guarantees IGL makes (identity, boundary, intent, trace) only hold if the implementation is disciplined. This document explains the process.

## Before you write code

- **Small fixes** (typos, docs, bug fixes with tests): open a pull request directly.
- **Language or contract changes** (syntax, semantics, new bindings, changes to the trace schema, any change to `spec/openapi.yaml`): open an **IGL Enhancement Proposal (IEP)** first, as an issue using the [IEP template](https://github.com/SMEPro-Technologies-LLC/igl/issues/new?template=iep.yml). Language and contract changes require discussion before implementation. The four bindings are invariant, proposals that weaken identity, boundary, intent, or trace guarantees will not be accepted.
- **New capture channels or event types**: must conform to the existing journal envelope and provenance taxonomy (see [`docs/SPEC.md`](./docs/SPEC.md)). Provenance is assigned by capture route, never by payload self-claims ([ADR 0002](./docs/adr/0002-provenance-assigned-by-capture-route.md)). This rule is not negotiable.

## Developer Certificate of Origin (DCO)

All contributions require a DCO sign-off. By signing off, you certify that you wrote the contribution or otherwise have the right to submit it under the project's license (Apache 2.0), per the [Developer Certificate of Origin 1.1](https://developercertificate.org/).

Add the `-s` flag when you commit:

```bash
git commit -s -m "Add boundary narrowing for nested run blocks"
```

This appends `Signed-off-by: Your Name <you@example.com>` to the commit message. The `DCO` workflow checks every commit in a pull request; PRs without sign-offs on every commit fail CI and cannot be merged.

> For substantial contributions, the project may additionally request a Contributor License Agreement (CLA) on your pull request. The CLA preserves the project's ability to offer IGL under commercial licenses alongside Apache 2.0.

## Code standards

- **Tests are required.** A PR without tests will not be merged. Governance-critical paths (identity check, boundary evaluation, hash chain, provenance assignment) require unit tests, and property-based tests where the input space allows.
- **Canonicalization is law.** Any code touching hashing or serialization must produce canonical output (sorted keys, no whitespace), see the canonicalization section of [`docs/SPEC.md`](./docs/SPEC.md) and `canonical()` in `src/sign.js`.
- **No provenance upgrades.** Code that reclassifies a lower provenance class as a higher one will be rejected on review. This is a security invariant.
- **Contract changes are validated.** `npx --yes @redocly/cli@1 lint spec/openapi.yaml` must pass; additive changes bump the minor version, breaking changes need a new `/v{n}` base path.
- **Signed commits are encouraged** (`git commit -S`) and required for maintainers.

## Pull request process

1. Fork and branch from `main`.
2. Keep PRs focused, one concern per PR.
3. CI must pass: tests on Node 20 and 22, contract lint, DCO, CodeQL, dependency review.
4. At least one maintainer review; two for changes to `src/` or `spec/` (enforced by `CODEOWNERS`).
5. Squash-merge with a clear commit message.

## Reporting bugs

Open a GitHub issue with a minimal reproduction using the bug template. For **security vulnerabilities, do not open a public issue**, see [SECURITY.md](./SECURITY.md).

## Code of Conduct

All participation is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

By contributing, you agree your contributions are licensed under Apache 2.0, consistent with Section 5 of the License.
