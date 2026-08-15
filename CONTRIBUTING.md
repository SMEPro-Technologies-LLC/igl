# Contributing to IGL

Thanks for your interest in IGL.

## Development setup

The active runtime lives in [`igl-v1/`](./igl-v1). Use Node.js 20 or newer.

```bash
cd igl-v1
npm install
npm run lint
npm test
npm run build
```

Useful local commands:

```bash
cd igl-v1
node run-wellsite.mjs
node verify-receipt.mjs
node run-govern.mjs US-TX RRC
```

## Branches and commits

- Branch from `main`.
- Keep branches focused on a single change or closely related set of changes.
- Prefer short, imperative commit messages such as `docs: clarify receipt verification`.

## Pull requests

Before opening a pull request:

- run the relevant commands in `igl-v1/package.json`,
- update docs when behavior or setup changes,
- avoid unrelated refactors, and
- call out any follow-up work or operational dependencies.

PRs should include:

- a short summary of the change,
- testing performed, and
- any deployment, security, or documentation impact.

## Issue triage

Maintainers review new issues, reproduce them when possible, and label them by type, scope, and priority. Security-sensitive reports should not be filed publicly; follow [SECURITY.md](./SECURITY.md) instead.

## Reporting bugs and requesting features

Use the GitHub issue forms in this repository when possible. Include reproduction steps, expected behavior, and the runtime or document area involved.
