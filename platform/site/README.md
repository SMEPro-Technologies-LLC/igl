# id-me.ai

The public site for the IGL Governed Identity Platform. One page, hash-routed views, no build step. This folder is what Cloudflare Pages serves.

| File | What it is |
|---|---|
| `index.html` | The whole site. The API reference inside it is generated, not typed |
| `gen_reference.py` | Regenerates the API reference from `../../spec/openapi.yaml` and `../api/implemented.json`, so the page can only claim an operation is live if the deployed service lists it |
| `igl-openapi-v0.2.yaml`, `igl-openapi-v0.1.yaml` | Copies of `spec/` served for download |
| `functions/api/contact.js` | Pages Function behind the Contact Sales form. Writes to the `igl-intake` D1 database |
| `schema/intake.sql` | The D1 schema for that database |
| `_headers`, `robots.txt`, `sitemap.xml`, `wrangler.toml` | Pages configuration |

## Regenerate the reference after a contract change

```bash
python3 platform/site/gen_reference.py spec/openapi.yaml platform/api/implemented.json platform/site/index.html
```

## Deploy

Pushes to `main` that touch this folder are deployed by `.github/workflows/deploy-site.yml` with `wrangler pages deploy`. It needs two repository secrets: `CLOUDFLARE_API_TOKEN` (Pages: Edit, D1: Edit) and `CLOUDFLARE_ACCOUNT_ID`. To deploy by hand from a checkout with wrangler logged in:

```bash
npx wrangler pages deploy platform/site --project-name id-me-ai
```

The intake database is created once (`wrangler d1 create igl-intake`) and its schema applied with `wrangler d1 execute igl-intake --remote --file=platform/site/schema/intake.sql`. Both have been done for the production account; the database id is in `wrangler.toml`.

## What the User Center runs

`index.html` inlines `provision/resolver.mjs` from this repository unchanged except for the `export` keywords, so the resolution a visitor sees in the browser is the same resolution the provisioning service performs.
