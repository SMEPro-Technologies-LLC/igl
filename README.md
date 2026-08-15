# IGL: Identity Governed Logic

IGL is a coding language for artificial intelligence in which governance is a
numeric computation the runtime performs and fuses with the model's own
computation. Identity is the zeroth operand of every statement: who is acting,
under what boundary, with what authority. The governing constraint is fetched
from a live service as a digested matrix, applied by FUSE (support restriction)
and a graded boundary check, and every governed turn seals an Ed25519 receipt a
third party can verify from the artifact alone.

## Quickstart: clone to verified receipt

Requires Node 22+. No dependencies.

    git clone https://github.com/SMEPro-Technologies-LLC/igl.git
    cd igl/igl-v1
    npm test              # the full conformance and adversarial suite, one total
    npm run verify:governed

That last command verifies the committed live receipt at
`artifacts/receipt.live.json` from the file alone: it recomputes the hashes,
checks the Ed25519 signature, and confirms the receipt binds the digest the
deployed governance service published. To produce receipts yourself:

    npm run wellsite      # run the WellSite filing program, verify its receipt
    npm run decode        # a governed token-by-token decode with a sealed trace
    node run-filing.mjs   # the two-turn filing pipeline and its audit

## What is in this repository

`igl-v1/` is the canonical v1.0 reference runtime: lexer, parser, static
checker, interpreter, IOS+, the live UDM client (`src/udm.js`, `src/govern.js`),
the governed decoder (`src/decoder.js`), the OpenAI-compatible governed gateway
(`src/gateway.js`), and the deployable Worker surfaces under `igl-v1/workers/`.
`igl-v1/docs/adr/` holds the decision record; ADR 0002 is the authority law.
`docs/` holds the architecture and readiness documents. `archive/` holds prior
generations, kept for history and not part of the product line.

## Status, stated plainly

The reference implementation is public and its suite is the conformance bar.
It is not yet a production service: the external security review, scale
testing, managed key service, and a bounded pilot are open and tracked in
`docs/RELEASE_CHECKLIST.md` and `igl-v1/docs/GTM_READINESS.md`. Receipts signed
by the development seeds in the run scripts are demonstrations, not production
attestations.

## License

Apache-2.0 (see LICENSE and NOTICE). The IGL name is a trademark tied to the
conformance suite; see TRADEMARKS.md. Security reports: SECURITY.md.
