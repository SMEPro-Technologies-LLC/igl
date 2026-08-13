# Publishing `igl-lang` to PyPI

This document describes the one-time manual setup required before the
`.github/workflows/publish.yml` workflow can push a release to PyPI.

---

## Prerequisites

- A PyPI account at <https://pypi.org> with ownership or maintainer rights on the
  `igl-lang` project.
- The GitHub repository `SMEPro-Technologies-LLC/igl` with Actions enabled.

---

## 1. Create a PyPI Trusted Publisher (OIDC)

No API token is stored in GitHub Secrets. Instead, PyPI grants the workflow permission
via OIDC using **Trusted Publishing**.

1. Log in to <https://pypi.org>.
2. Navigate to **Your projects → igl-lang → Manage → Publishing** (or create the
   project first by uploading once from a local machine via `twine upload`).
3. Click **Add a new publisher** and fill in:

   | Field | Value |
   |---|---|
   | Owner | `SMEPro-Technologies-LLC` |
   | Repository name | `igl` |
   | Workflow filename | `publish.yml` |
   | Environment name | `pypi` |

4. Save. PyPI will now accept uploads that arrive from this workflow + environment
   combination without a stored secret.

> **TestPyPI dry-run:** repeat the same steps on <https://test.pypi.org> with
> environment name `testpypi`, then temporarily point `pypa/gh-action-pypi-publish`
> at `repository-url: https://test.pypi.org/legacy/` to validate the flow before the
> real release.

---

## 2. Create the `pypi` GitHub Environment

1. In the GitHub repo: **Settings → Environments → New environment**.
2. Name it `pypi`.
3. Optionally add a **required reviewer** so every release is manually approved before
   it reaches PyPI.
4. No environment secrets are needed (OIDC handles authentication).

---

## 3. Cut a Release

1. Ensure the `test` job in CI is green.
2. Bump `version` in `pyproject.toml` if needed.
3. Update `CHANGELOG.md` – move items from `[Unreleased]` into a new dated section.
4. Tag and publish a GitHub Release (tag format: `v0.1.0`).
5. The `publish.yml` workflow fires automatically, runs the test suite, builds sdist
   and wheel, validates with `twine check`, then uploads to PyPI.

---

## Local dry-run

```bash
pip install build twine
python -m build
twine check dist/*
# upload to TestPyPI only:
twine upload --repository testpypi dist/*
```
