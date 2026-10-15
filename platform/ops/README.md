# IGL operator console

`ops.id-me.ai`, behind a sign-in. One Worker that shows, on one page: whether the site, the API, the sandbox and the auth host are up; site traffic (page views, visits, top pages, referrers, countries, status codes) from the id-me.ai zone analytics; GitHub stars, forks, watchers, releases, and with a token the repository's views, clones, referrers and popular paths; platform usage from the production and sandbox databases (tenants and signups, identities, active keys, projections served, audit events, runs, newest tenants); Contact Sales inquiries with status and notes you can change; npm downloads once the runtime is published; and where the project is being talked about (Hacker News, Reddit, repositories that mention it).

Every source reports "not configured" with the reason when its token or binding is missing, so the page is never blank and never pretends.

## Deploy

```bash
cd platform/ops
npm ci
npx wrangler deploy
npx wrangler secret put CLOUDFLARE_API_TOKEN     # Zone Analytics: Read and Zone: Read on id-me.ai
npx wrangler secret put GITHUB_TOKEN             # optional; push access to the repo for traffic data
```

## Sign-in

The console has its own sign-in page. Set the password once and it is live:

```bash
npx wrangler secret put OPS_ADMIN_PASSWORD
```

or in the Cloudflare dashboard: Workers and Pages, igl-ops, Settings, Variables and Secrets, add a secret named `OPS_ADMIN_PASSWORD`. The username is the `OPS_ADMIN_USER` var in `wrangler.toml` (default `admin`). A successful sign-in sets a signed, HttpOnly, SameSite=Strict session cookie that lasts twelve hours; five wrong attempts from one address lock it out for fifteen minutes; changing the password signs everyone out. Use a long password from a password manager; it is never written anywhere but the secret store.

Cloudflare Access can be used instead, which lets you sign in with Google Workspace accounts and manage who has access from the Zero Trust dashboard: add a self-hosted application for `ops.id-me.ai` with a policy for the people who may see it, then put the application's Audience (AUD) tag and your team domain (`<team>.cloudflareaccess.com`) into `wrangler.toml` as `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` and deploy again. When Access is configured it takes precedence and the built-in page is not served. The Worker verifies the Access token's signature, audience, issuer and expiry itself.

With neither configured the Worker answers 503 to every request, so a misconfiguration fails closed rather than exposing data.

## Run locally

```bash
npm test      # boots with OPS_DEV=1 and local D1 copies, checks the page and the overview; then boots with a test password and checks the sign-in
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
