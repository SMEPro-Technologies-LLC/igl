# IGL

> Identity-Governed Language for governed AI execution, deterministic boundary checks, and signed receipts.

[![License](https://img.shields.io/badge/license-UNLICENSED-lightgrey.svg)](./LICENSE)
[![CI](https://github.com/SMEPro-Technologies-LLC/igl/actions/workflows/ci.yml/badge.svg)](https://github.com/SMEPro-Technologies-LLC/igl/actions/workflows/ci.yml)
[![Homepage](https://img.shields.io/badge/homepage-igl.dev-blue.svg)](https://igl.dev)

IGL is a JavaScript reference implementation and document set for **Identity-Governed Language**: a language and runtime built to keep AI-assisted computation inside explicit identity, boundary, and receipt rules.

The canonical runtime lives in [`igl-v1/`](./igl-v1). Supporting specifications and architecture notes live in [`docs/`](./docs/).

## What is IGL?

IGL treats governed execution as a language primitive:

- every turn is bound to an identity,
- every action is checked against declared constraints and boundaries,
- every governed result can emit a signed receipt, and
- every trace can be replayed or independently verified from the artifact.

In the reference runtime, model output is not allowed to become governing fact on its own. The runtime combines model proposals with deterministic UDM-style constraints, records the resulting trace, and verifies outcomes after execution.

## Why it exists

This repository explores a closed-loop model for AI work where:

- **AI locates or proposes** candidate outputs,
- **deterministic computation checks** what is admissible,
- **identity and authority stay explicit**, and
- **the runtime fails closed** when a governed result cannot be justified.

That design shows up in the codebase as:

- deterministic boundary checks in `igl-v1/src/udm.js`,
- governed execution and receipt issuance in `igl-v1/src/interpreter.js`,
- verification helpers in `igl-v1/src/sign.js`, and
- sample governed programs and fixtures under `igl-v1/programs/` and `igl-v1/test/`.

## Quickstart

The repository does not have a root package. Work from the canonical runtime directory:

```bash
cd igl-v1
npm install
npm run lint
npm test
npm run build
```

Useful commands:

```bash
cd igl-v1
node run-wellsite.mjs
node verify-receipt.mjs
node run-decode.mjs
```

## Minimal runnable example

```js
import { run, verify } from "./igl-v1/src/index.js";

const program = `IGL v1.0 PROGRAM "hello_governed" ;
IDENTITY { DECLARE IDENTITY a AS IDENTITY_OPERAND { id:"igl://identity/demo/a", authority:0.9, boundary:b, propagation:INHERIT } ; }
CONSTRAINTS {
  DECLARE BOUNDARY b AS BOUNDARY_TENSOR { dimensions:1, shape:[8], jurisdiction:"udm://j/demo", strictness:HARD } ;
  DECLARE CONSTRAINT c AS CONSTRAINT_MATRIX { source:"udm://m/demo", version:"1.0.0", digest:"demo" } ;
}
BEGIN
  INJECT ( c, ctx ) ;
  LET o = AI_INFER("draft the report", ctx) ;
  LET g = FUSE ( o, c ) ;
  LET t = CAPTURE_TRACE ( g ) INTO ct ;
  LET turn = BIND ( a, ct ) AS turn ;
END
RECEIPT { CAPTURE ( turn ) AS r WITH_OUTCOME COMPLIANT ; }`;

const result = run(program, { seed: 1 });
console.log(result.receipt.outcome);
console.log(verify(result.receipt).ok);
```

## Core concepts

- **Identity-bound execution**: every governed turn is associated with a named identity and authority context.
- **Constraint + boundary enforcement**: the runtime applies support restriction and boundary checks before returning a governed result.
- **Trace-first execution**: outputs are staged behind trace capture and receipt generation.
- **Receipts and verification**: signed receipts can be verified separately from the original execution environment.
- **Seams for deployment**: the runtime can be pointed at hosted model adapters, Cloudflare Workers, and a UDM governance service.

## Repository layout

- [`igl-v1/`](./igl-v1) — canonical v1.0 runtime, examples, tests, Workers, and public-facing package metadata
- [`docs/`](./docs) — top-level specifications, bridge/graph notes, architecture, scope, and one-pager material
- [`examples/`](./examples) — additional examples outside the canonical runtime package
- [`archive/`](./archive) — historical snapshots kept for reference, not the active product line
- [`site/`](./site) — generated marketing-site assets

## Documentation

- [Docs index](./docs/README.md)
- [Specification](./docs/SPEC.md)
- [Architecture](./docs/architecture.md)
- [Point of Inflection](./docs/point-of-inflection.md)
- [Threat model](./igl-v1/docs/THREAT_MODEL.md)
- [Production readiness](./igl-v1/docs/PRODUCTION_READINESS.md)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, branch guidance, and pull request expectations.

## Security

See [SECURITY.md](./SECURITY.md) for vulnerability reporting and supported versions.

## License

This repository currently retains its pre-publication proprietary notice in [`LICENSE`](./LICENSE). Confirm the final open-source licensing decision before flipping repository visibility or publishing packages.
