# Contributing

Thanks for your interest in IGL. The bar for this repository is simple: every
change keeps the full suite green, and changes to governance semantics need an
ADR.

Getting started: clone, then `cd igl-v1 && npm test`. The suite is plain Node,
no dependencies, and prints one total. If it is green on your machine, you have
a working development setup.

Pull requests: keep them scoped, include tests for any behavioral change, and
run `npm test` before pushing. CI runs the same suites and is the arbiter.
Changes to the language's governance semantics (authority, FUSE, receipts,
boundaries) must include or update an ADR under `igl-v1/docs/adr/` so the
decision trail stays complete. Documentation follows the repository's style:
plain prose, no decorative symbols.

By contributing you agree that your contributions are licensed under the
Apache License 2.0 (see section 5 of LICENSE). The IGL name is governed by
TRADEMARKS.md; conformance claims require the unmodified suite to pass.
