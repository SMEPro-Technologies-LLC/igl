# Contributing to IGL

Thanks for considering a contribution. Changes must preserve IGL's identity, boundary, intent, and trace guarantees. This guide explains how to contribute.

## Before you write code

- **Small fixes** (typos, docs, bug fixes with tests): open a pull request directly.
- **Language changes** (syntax, semantics, bindings, or trace schema): open an **IGL Enhancement Proposal (IEP)** as an issue before implementation. Discuss the change in the specification first. Proposals must preserve the identity, boundary, intent, and trace guarantees.
- **New capture channels or event types**: follow the existing envelope schema and provenance rules in `docs/SPEC.md`. The capture route assigns provenance; payload claims do not.

## Developer Certificate of Origin (DCO)

All contributions require a DCO sign-off. By signing off, you certify that you wrote the contribution or otherwise have the right to submit it under the project's license (Apache 2.0), per the [Developer Certificate of Origin 1.1](https://developercertificate.org/):

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.

Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

### How to sign off

Add the `-s` flag when you commit:

```bash
git commit -s -m "Add boundary narrowing for nested run blocks"
```

This appends `Signed-off-by: Your Name <you@example.com>` to the commit message. PRs without sign-offs on every commit will fail CI and cannot be merged.

> Note: for substantial contributions, the project may additionally request a Contributor License Agreement (CLA) via the CLA bot on your pull request. The CLA preserves the project's ability to offer IGL under commercial licenses alongside Apache 2.0.

## Code standards

- **Tests are required.** A PR without tests will not be merged. Governance-critical paths (identity check, boundary evaluation, hash chain, provenance assignment) require unit *and* property-based tests.
- Code that handles hashing or serialization must produce canonical output with sorted keys and no extra whitespace. See the normalization rules in `docs/SPEC.md`.
- **No provenance upgrades.** Code that reclassifies `reported:*` or `derived:*` events as `observed:*` will be rejected on review. This is a security invariant.
- **Signed commits are encouraged** (`git commit -S`) and required for maintainers.

## Pull request process

1. Fork and branch from `main`.
2. Keep each PR focused on one concern.
3. Make sure the tests pass with `npm test` and that CI is green.
4. At least one maintainer review; two for changes to `core/` or `spec/`.
5. Squash-merge with a clear commit message.

## Reporting bugs

Open a GitHub issue with a minimal reproduction. For **security vulnerabilities, do not open a public issue**. See [SECURITY.md](./SECURITY.md).

## Code of Conduct

All participation is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

By contributing, you agree your contributions are licensed under Apache 2.0, consistent with Section 5 of the License.
