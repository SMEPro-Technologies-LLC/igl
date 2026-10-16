# IGL operator console

`ops.id-me.ai`, behind a sign-in. One Worker that shows, on one page: whether the site, the API, the sandbox and the auth host are up; site traffic (page views, visits, top pages, referrers, countries, status codes) from the id-me.ai zone analytics; GitHub stars, forks, watchers, releases, and with a token the repository's views, clones, referrers and popular paths; platform usage from the production and sandbox databases (tenants and signups, identities, active keys, projections served, audit events, runs, newest tenants); Contact Sales inquiries with status and notes you can change; npm downloads once the runtime is published; and where the project is being talked about (Hacker News, Reddit, repositories that mention it).

Every source reports "not configured" with the reason when its token or binding is missing, so the page is never blank and never pretends.

## The application portfolio

The Applications table manages every product SMEPro operates: WellReporter, WellSite, LeaseXplorer, ToxicTort, TortPlus, Tortgraph, VDRPros, RealEChat, RealStar Global, ID-ME.ai, Ricorsa, SMEProtech, SMEProtec, AILU and LU Concourse. The registry is `src/apps.js`. Each application with a bound store (a D1 binding in `wrangler.toml`) is read through an adapter that turns that store's own tables into one shape: customers, sessions (every sign-in and sign-out with its timestamp, where the application keeps them), activity, metered usage, subscriptions, messages and plans. Nothing is copied or invented; an application without a store shows health only and says so.

What an operator can change: a customer's plan (written to the application's own plan column and recorded in `ops_plan_changes` with who, from, to and why) and notes on a customer (`ops_notes`). Both tables live in the intake database and are created on first use.

Applications that keep no session table post their own events: `POST https://ops.id-me.ai/ingest/<app id>` with header `x-ops-ingest-key` and a body of one event or `{ "events": [...] }`, each `{ "customer": "<their user id>", "email": "...", "kind": "login" | "logout" | "usage" | "event", "meter": "gas", "qty": 12, "at": "<ISO time>", "detail": {...} }`. Keys are the `INGEST_KEYS` secret, a JSON object of app id to key. Events land in `ops_events` and show on the application's Sessions tab and on the customer's record.

## Billing (Finix)

Finix, on the SMEPro Technologies merchant, is the billing system of record for every application. `src/billing.js` holds the plan catalog (the prices approved October 16, 2026: monthly tiers per application and the metered items each one charges for) and the console shows it beside what Finix has: plans matched by their `app` and `tier` tags (or, for the plans made by hand before the console existed, by name and amount), the subscriptions on each plan with status and next billing date, transfers tagged with an application, and MRR. "Create missing plans in Finix" creates any catalog plan Finix lacks, tagged so it is found again, and never changes or archives an existing plan; a price change is a new tier. Subscriptions can be canceled from the console. Cards are never collected here: each application collects them with Finix.js and creates its own subscriptions and metered transfers, tagging `app`, `customer` and `meter` so the console can read them. `GET /api/billing/prices/<app>` serves an application its own price list from the one catalog. Secrets: `FINIX_USERNAME`, `FINIX_PASSWORD`, and `FINIX_ENV=sandbox` while testing.

## Marketing agents

One agent per application (`src/marketing.js`), run on the hour for one application at a time (`[triggers]` in `wrangler.toml`) and on demand from the Marketing tab. A run audits the application's live site (title, description, canonical, Open Graph, Twitter card, JSON-LD, H1, indexability, visible text, robots.txt, sitemap.xml, llms.txt) and scores it with the fix for each finding; drafts posts for the channels Postiz has connected, grounded in the page it just read and the application's own numbers, into a queue; records an insight in plain sentences; and, with a search key, sources prospects for the application's market. Nothing is posted by the agent: a person approves a draft on the console, chooses the channel and time, and that approval schedules it in Postiz. Leads carry a status an operator changes. Secrets: `POSTIZ_API_KEY` (scheduling), `ANTHROPIC_API_KEY` (drafting), `BRAVE_API_KEY` (lead sourcing); each is reported as off when missing and the rest of the run still happens.

Local test fixtures in `test/fixtures/` carry the production table shapes of the bound stores (DDL copied from `sqlite_master`) with a few rows, so `npm test` runs the adapters' real SQL.

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

or in the Cloudflare dashboard: Workers and Pages, igl-ops, Settings, Variables and Secrets, add a secret named `OPS_ADMIN_PASSWORD`. The username is the `OPS_ADMIN_USER` var in `wrangler.toml` (default `admin`). A successful sign-in sets a signed, HttpOnly, SameSite=Strict session cookie that lasts twelve hours; five wrong attempts from one address inside fifteen minutes lock it out for fifteen minutes (the counter is kept in the intake database, so it holds across every Worker instance); changing the password signs everyone out. Use a long password from a password manager; it is never written anywhere but the secret store.

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
