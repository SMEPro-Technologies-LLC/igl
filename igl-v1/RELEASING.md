# RELEASING

How to cut a new release of `@smepro-technologies-llc/igl` from the `igl-v1/`
directory.

## Version policy

| Phase | Version pattern | Meaning |
|---|---|---|
| Preview | `1.0.0-preview.N` | Open items in `docs/PRODUCTION_READINESS.md` are not yet closed. Increment `N` for each preview drop. |
| Production | `1.0.0` | All checklist items in `docs/PRODUCTION_READINESS.md` are closed: security review, legal review, third-party reproduction. Do **not** publish a non-preview `1.0.0` until that document is signed off. |
| Patch | `1.0.x` | Bug fixes after GA. |
| Minor | `1.x.0` | Backwards-compatible additions after GA. |

**Do not promote `1.0.0-preview.N` to `1.0.0` while any item in
`docs/PRODUCTION_READINESS.md` is still open.**

## Tag-to-publish flow

1. **Bump the version** in `igl-v1/package.json`:

   ```sh
   # example: preview bump
   cd igl-v1
   npm version 1.0.0-preview.2 --no-git-tag-version
   ```

2. **Commit** the version change:

   ```sh
   git add igl-v1/package.json
   git commit -m "chore(igl-v1): bump to 1.0.0-preview.2"
   ```

3. **Push to main** and confirm CI is green.

4. **Create and push the tag** (from repo root):

   ```sh
   git tag v1.0.0-preview.2
   git push origin v1.0.0-preview.2
   ```

5. The `release.yml` workflow fires automatically on the `v*` tag push. It
   runs the full hermetic test suite (`node test/samples.mjs`, `test/suite.mjs`,
   `test/resolve.mjs`, `test/adapters.mjs`, `test/d1.mjs`,
   `test/determination.mjs`, `test/udm.mjs`, `test/govern.mjs`,
   `run-wellsite.mjs`, `verify-receipt.mjs`). Publishing only happens if every
   step is green.

6. The workflow also guards against re-publishing an already-existing version
   and will fail clearly if you forget to bump.

7. Verify the package appeared:

   ```sh
   npm view @smepro-technologies-llc/igl --registry https://npm.pkg.github.com
   ```

## Manual trigger

`release.yml` also supports `workflow_dispatch`. Navigate to
**Actions → Publish to GitHub Packages → Run workflow** to trigger without a tag
(useful for re-running a failed publish attempt after a fix).

## Open items before GA

See `docs/PRODUCTION_READINESS.md`. Until those items are closed, keep
the version in the `1.0.0-preview.N` series.

## License note

The package is currently `"license": "UNLICENSED"`. A `LICENSE` file has not
been added — this is a separate business/legal decision. Do not ship a
production release without resolving the license.
