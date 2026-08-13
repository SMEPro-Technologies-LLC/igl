# Changelog

All notable changes to `igl-lang` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

*(Nothing yet.)*

---

## [0.1.0] – 2025-07-01

### Added

- **Core language implementation** – lexer, recursive-descent parser with 50+ AST node
  classes, and a tree-walking interpreter.
- **Identity frames & trust scores** – `identity`, `trust`, and `verify` constructs for
  named, trusted computation frames.
- **`reason` / `udm` blocks** – first-class closed-loop constructs with `assert_reason`,
  `resolve`, and UDM side-effect prohibition enforced at the static-check level.
- **Drift equality** – `~=` operator with ambient drift and explicit `within` tolerance
  override.
- **Arrow piping** – `|>` operator for composable identity-aware pipelines.
- **Closed-loop convergence** – runtime detection that a UDM loop must close back into
  its originating identity frame.
- **`//` floor-division token** – distinct from `/`; no ambiguity with comment syntax.
- **Standard library** – `igl.core`, `igl.identity`, `igl.reason`, `igl.udm`,
  `igl.math`, `igl.io`, `igl.collections`.
- **CLI** – `igl run`, `igl repl`, `igl check`, `igl version`.
- **Static checker** (`igl/checker.py`) – enforces UDM loop-close obligation and
  UDM side-effect prohibition; runtime `unwrap()` trust boundary (anchored-only).
- **CI workflow** – matrix test across Python 3.10 / 3.11 / 3.12; example-file check
  job.
- **MIT LICENSE**, `.gitignore`, and initial `README.md`.

[Unreleased]: https://github.com/SMEPro-Technologies-LLC/igl/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/SMEPro-Technologies-LLC/igl/releases/tag/v0.1.0
