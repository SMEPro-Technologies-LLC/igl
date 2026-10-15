# IGL Platform API

The service behind `https://api.id-me.ai/v1` (production) and `https://sandbox.id-me.ai/v1` (sandbox). It implements every operation in `spec/openapi.yaml`, runs on Cloudflare Workers with a D1 database per environment, and uses the same hashing and signing rules as the runtime in `src/`, so receipts and audit chains it produces can be verified with the runtime's own code or with any SHA-256 and Ed25519 library.

## What it does

| Area | How |
|---|---|
| Routing | `src/routes.generated.js` is generated from the contract by `scripts/gen-routes.py`. Each operation has one handler in `src/handlers.js`, keyed by `operationId`. The suite fails if an operation has no handler |
| Authentication | API keys (`igl_live_…`, `igl_test_…`, hashed at rest) as `Authorization: Bearer`, or on operations the contract lists, `X-IGL-API-Key`. OAuth 2.0 client credentials at `POST /oauth2/token` issue EdDSA JWTs (1 hour) verifiable at `/.well-known/jwks.json`. A key in the query string is ignored |
| Tenancy | Every key belongs to one tenant; `X-IGL-Tenant-Id` must match. A platform key (scope `igl.platform`, issued once at bootstrap) may act in any tenant of its environment |
| Scopes | `igl.read`, `igl.write`, `igl.execute`, `igl.admin`, as the contract lists per operation |
| Identity | Every key acts as an identity in the graph; a system identity is created for keys without one. Every record's provenance and every audit event names that identity |
| Projections | Four gates per node in fixed order: node type, sensitivity, consent, jurisdiction. `explain` returns every node considered with each gate's result. Proposed relationships never appear in a projection |
| Policies | `rule` objects with actions, resource types, conditions, approvals, obligations. Deny wins, then escalate, then conditional, then allow. No matching policy means deny, except for reads and intelligence (which only read admitted records) |
| Intelligence | The model sees only records the caller may see, each tagged with its id, and must cite them. Uncited answers are refused when citations are required. Provider: Anthropic (`ANTHROPIC_API_KEY`); without it the operations answer 422 `no_reasoning_provider` |
| Audit | One SHA-256 hash chain per tenant with append-only triggers; every mutation and every projection appends an event. `GET /audit/events` pages the chain; `docs/examples/verify-audit-chain.mjs` verifies it offline |
| Receipts | Every projection, intelligence response and run carries a `GovernanceReceipt` signed with the service's Ed25519 key (`IGL-RECEIPT-v0.2:` domain); the public key is in the receipt and at `/.well-known/jwks.json` |
| Idempotency | `Idempotency-Key` on mutations replays the stored response; a different body under the same key is 409 |
| Rate limits | Token bucket per key in D1; 429 with `Retry-After` |
| Webhooks | `outcomeRecorded`, `approvalRequired`, `graphUpdated`, signed with `X-IGL-Signature: t=…,v1=hmac-sha256`, three attempts |
| Errors | `application/problem+json` with `traceId`, field-level `violations` on 422 |

Surfaces outside the contract are listed at the top of `src/admin.js`: the token endpoint, JWKS, service metadata, sandbox self-serve signup, and administration (tenants, keys, webhooks, consents, obligations), plus `GET /admin/implemented`, which the deploy workflow reads to update the site's API reference.

## Run it locally

```bash
cd platform/api
npm ci
npm test          # starts wrangler dev with a local D1, runs the conformance suite, stops it
npm run dev       # keeps a sandbox-mode service on http://127.0.0.1:8801
```

The conformance suite (`test/conformance.test.mjs`) exercises all 46 operations against the running service and validates every response body against the schema the contract declares for that status code. It fails if an operation is left uncovered.

Try it by hand once `npm run dev` is up:

```bash
curl -s -X POST http://127.0.0.1:8801/sandbox/signup -H 'content-type: application/json' \
  -d '{"organization":"Example Co","email":"you@example.com","jurisdiction":"US-TX"}'
# then, with the apiKey and tenantId it returns:
curl -s http://127.0.0.1:8801/v1/identities/me?purpose=identity-introduction \
  -H "Authorization: Bearer $KEY" -H "X-IGL-Tenant-Id: $TENANT"
```

## Deploy

`.github/workflows/deploy-api.yml` deploys on every push to `main` that touches this folder or the contract: conformance suite, then sandbox, then production, then it records what is served in `platform/api/implemented.json` so the site reference shows live status. It needs the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Worker secrets are set once per environment by a maintainer:

```bash
npx wrangler secret put ANTHROPIC_API_KEY --env sandbox
npx wrangler secret put ANTHROPIC_API_KEY --env production
npx wrangler secret put BOOTSTRAP_TOKEN --env production     # any long random string
```

First run on production: `POST https://api.id-me.ai/admin/bootstrap` with header `X-IGL-Bootstrap: <BOOTSTRAP_TOKEN>` and body `{"name":"Smeprotech platform"}` returns the platform tenant and the one platform key. Store it. Every customer tenant and key is then issued with `POST /admin/tenants` and `POST /admin/keys` using that key. The sandbox needs no bootstrap: `POST /sandbox/signup` is open and rate limited.

The D1 databases `igl-api-production` and `igl-api-sandbox` already exist on the account with the schema applied; their ids are in `wrangler.toml`. The DNS records for `api`, `sandbox` and `auth` are created by Cloudflare when the Worker routes deploy.

## Verify a receipt yourself

```js
import { createPublicKey, verify } from "node:crypto";
const { signer, alg, publicKey, signature, ...receipt } = governance;  // from any response
const canonical = x => Array.isArray(x) ? "[" + x.map(canonical).join(",") + "]" : x && typeof x === "object" ? "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}" : JSON.stringify(x ?? null);
verify(null, Buffer.from("IGL-RECEIPT-v0.2:" + canonical(receipt)), createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" }), Buffer.from(signature, "base64"));  // true
```
