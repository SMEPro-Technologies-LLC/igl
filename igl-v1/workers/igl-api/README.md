# igl-api: the live-bound execution surface

This is the surface that answers real traffic. It is the same code path the tests
exercise: `src/worker.js` calls `govern.js` over `udm.js`, fetches the deployed
constraint matrix and its digest from `udm.igl.dev`, applies FUSE then the graded
boundary check, and seals a receipt bound to the service digest. There is one
worker implementation; `index.js` re-exports it so nothing drifts.

## Endpoints

- `POST /govern` with `{ jurisdiction, agency, dist, strictness? }` returns
  `{ receipt, publicKey }`. The receipt's `constraintMatrixDigest` is the live
  service digest and `provenance.digestSource` is `live`.
- `POST /verify` with `{ receipt, publicKey }` returns `{ ok, ... }`.
- `GET /health` reports the upstream and whether a signing key is set.

## Proven locally

`node test/worker.mjs` from the `igl-v1` directory drives real Request/Response
objects through this exact entry with the pinned live matrix stubbing the wire:
govern binds the live digest, verify confirms the fresh receipt, an over-ceiling
distribution is reported as HARD_VIOLATION, and health reports the surface is
keyed. Green there means the deployable path governs and verifies.

## Deploy (runs on your Cloudflare account)

From this directory. Install wrangler if you do not have it, then:

    # 1. Build the bundle without publishing. Confirms nodejs_compat resolves
    #    node:crypto and Buffer. No account changes.
    npx wrangler deploy --dry-run --outdir ./_bundle

    # 2. Set the Ed25519 signing seed as a secret (64 hex chars = 32 bytes).
    #    Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    npx wrangler secret put IGL_SIGNING_SEED

    # 3. Publish. First deploy goes to your <name>.workers.dev subdomain.
    npx wrangler deploy

    # 4. Smoke test the deployed surface (replace the host with your workers.dev URL).
    curl -s https://igl-api.<your-subdomain>.workers.dev/health
    curl -s -X POST https://igl-api.<your-subdomain>.workers.dev/govern \
      -H 'content-type: application/json' \
      -d '{"jurisdiction":"US-TX","agency":"RRC","dist":{"path-production-report":0.6,"path-well-identity":0.2,"path-financial-detail":0.1,"path-pii-disclosure":0.1}}'

To serve on a custom domain, uncomment and set `routes` in `wrangler.toml`, then
deploy again.

## Notes

- The signing seed must be a real secret in production. Without it the Worker
  generates an ephemeral key per cold start (fine for a smoke test, useless for
  attributable receipts).
- The surface needs no D1 binding of its own. It is an HTTPS client to the
  deployed `d1-igl` service, which owns the matrix and its digest.
