# IGL operator console

`ops.id-me.ai`, behind Cloudflare Access. One Worker that shows, on one page: whether the site, the API, the sandbox and the auth host are up; site traffic (page views, visits, top pages, referrers, countries, status codes) from the id-me.ai zone analytics; GitHub stars, forks, watchers, releases, and with a token the repository's views, clones, referrers and popular paths; platform usage from the production and sandbox databases (tenants and signups, identities, active keys, projections served, audit events, runs, newest tenants); Contact Sales inquiries with status and notes you can change; npm downloads once the runtime is published; and where the project is being talked about (Hacker News, Reddit, repositories that mention it).

Every source reports "not configured" with the reason when its token or binding is missing, so the page is never blank and never pretends.

## Deploy

```bash
cd platform/ops
npm ci
npx wrangler deploy
npx wrangler secret put CLOUDFLARE_API_TOKEN     # Zone Analytics: Read and Zone: Read on id-me.ai
npx wrangler secret put GITHUB_TOKEN             # optional; push access to the repo for traffic data
```

Then protect it:

1. In the Cloudflare dashboard, Zero Trust, Access, Applications, add a self-hosted application for `ops.id-me.ai` with a policy that allows the email addresses of the people who may see it.
2. Copy the application's Audience (AUD) tag and your team domain (`<team>.cloudflareaccess.com`) into `wrangler.toml` under `[vars]` as `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN`, and deploy again.

Until both vars are set the Worker refuses every request with 503, so a misconfiguration fails closed rather than exposing data. The Worker verifies the Access token's signature, audience, issuer and expiry itself; it does not rely on the route being behind Access.

## Run locally

```bash
npm test      # boots with OPS_DEV=1 and local D1 copies, checks the page and the overview
npm run dev   # http://127.0.0.1:8805 with Access disabled
```

## What it reads and writes

| Source | Binding or secret | Read | Write |
|---|---|---|---|
| Zone analytics | `CLOUDFLARE_API_TOKEN` | GraphQL `httpRequestsAdaptiveGroups` on the id-me.ai zone | none |
| GitHub | `GITHUB_TOKEN` (optional) | repository, releases, stargazers, traffic | none |
| Intake | D1 `INTAKE` (igl-intake) | inquiries | status and notes |
| Platform | D1 `API_PROD`, `API_SANDBOX` | tenants, identities, keys, runs, audit events | none |
| Health | none | `GET` on each host | none |
| Mentions | none (public endpoints) | Hacker News, Reddit, GitHub search | none |
| npm | `NPM_PACKAGE` var | download counts | none |
