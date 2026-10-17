/* Data sources for the operator console. Each function returns a plain
   object and never throws: a source that is not configured or not reachable
   reports { configured: false } or { error } so the dashboard can say so
   instead of showing a blank. */

const CF_API = "https://api.cloudflare.com/client/v4";
const GQL = "https://api.cloudflare.com/client/v4/graphql";

const iso = (d) => new Date(d).toISOString();

async function cf(env, path, init = {}) {
  const r = await fetch(CF_API + path, { ...init, headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json", ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new Error((j.errors && j.errors[0]?.message) || `Cloudflare API ${r.status}`);
  return j.result;
}
async function gql(env, query, variables) {
  const r = await fetch(GQL, { method: "POST", headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const j = await r.json().catch(() => ({}));
  if (j.errors?.length) throw new Error(j.errors[0].message);
  return j.data;
}

let zoneCache = null;
async function zoneId(env) {
  if (env.ZONE_ID) return env.ZONE_ID;
  if (zoneCache) return zoneCache;
  const zones = await cf(env, `/zones?name=${encodeURIComponent(env.ZONE_NAME || "id-me.ai")}`);
  if (!zones?.length) throw new Error("zone not found");
  zoneCache = zones[0].id; return zoneCache;
}

/* Site traffic from zone analytics (the id-me.ai zone is proxied, so every
   request to the site passes through Cloudflare). Requests, page views,
   unique visitors per day; top paths, referers and countries for the range. */
export async function siteTraffic(env, days) {
  if (!env.CLOUDFLARE_API_TOKEN) return { configured: false, why: "CLOUDFLARE_API_TOKEN secret is not set on the ops Worker" };
  try {
    const zone = await zoneId(env);
    const since = iso(Date.now() - days * 86400000), until = iso(Date.now());
    const data = await gql(env, `query($zone: String!, $since: Time!, $until: Time!, $limit: Int!) {
      viewer { zones(filter: { zoneTag: $zone }) {
        daily: httpRequestsAdaptiveGroups(limit: 100, filter: { datetime_geq: $since, datetime_leq: $until, requestSource: "eyeball" }, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
        paths: httpRequestsAdaptiveGroups(limit: $limit, filter: { datetime_geq: $since, datetime_leq: $until, requestSource: "eyeball", edgeResponseContentTypeName: "html" }, orderBy: [count_DESC]) { count sum { visits } dimensions { clientRequestPath } }
        referers: httpRequestsAdaptiveGroups(limit: $limit, filter: { datetime_geq: $since, datetime_leq: $until, requestSource: "eyeball", edgeResponseContentTypeName: "html" }, orderBy: [count_DESC]) { count dimensions { clientRefererHost } }
        countries: httpRequestsAdaptiveGroups(limit: $limit, filter: { datetime_geq: $since, datetime_leq: $until, requestSource: "eyeball", edgeResponseContentTypeName: "html" }, orderBy: [count_DESC]) { count sum { visits } dimensions { clientCountryName } }
        status: httpRequestsAdaptiveGroups(limit: 10, filter: { datetime_geq: $since, datetime_leq: $until, requestSource: "eyeball" }, orderBy: [count_DESC]) { count dimensions { edgeResponseStatus } }
      } } }`, { zone, since, until, limit: 15 });
    const z = data.viewer.zones[0] || {};
    const daily = (z.daily || []).map((d) => ({ date: d.dimensions.date, requests: d.count, visits: d.sum.visits }));
    return {
      configured: true, days,
      totals: { requests: daily.reduce((a, d) => a + d.requests, 0), visits: daily.reduce((a, d) => a + d.visits, 0) },
      daily,
      paths: (z.paths || []).map((p) => ({ path: p.dimensions.clientRequestPath, views: p.count, visits: p.sum.visits })),
      referers: (z.referers || []).map((p) => ({ host: p.dimensions.clientRefererHost || "(direct)", views: p.count })),
      countries: (z.countries || []).map((p) => ({ country: p.dimensions.clientCountryName, views: p.count, visits: p.sum.visits })),
      status: (z.status || []).map((p) => ({ status: p.dimensions.edgeResponseStatus, count: p.count })),
    };
  } catch (e) { return { configured: true, error: e.message }; }
}

/* GitHub: public counts without a token; traffic (views, clones, referrers,
   popular paths) needs a token with push access to the repository. */
export async function github(env) {
  const repo = env.GITHUB_REPO || "SMEPro-Technologies-LLC/igl";
  const headers = { "user-agent": "igl-ops", accept: "application/vnd.github+json", ...(env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) };
  const out = { repo, configured: !!env.GITHUB_TOKEN };
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}`, { headers });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const j = await r.json();
    out.stars = j.stargazers_count; out.forks = j.forks_count; out.watchers = j.subscribers_count; out.openIssues = j.open_issues_count; out.pushedAt = j.pushed_at; out.defaultBranch = j.default_branch;
    const rel = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=5`, { headers });
    if (rel.ok) out.releases = (await rel.json()).map((x) => ({ tag: x.tag_name, publishedAt: x.published_at, downloads: (x.assets || []).reduce((a, s) => a + (s.download_count || 0), 0) }));
    if (env.GITHUB_TOKEN) {
      const [views, clones, refs, paths] = await Promise.all([
        fetch(`https://api.github.com/repos/${repo}/traffic/views`, { headers }).then((x) => x.ok ? x.json() : null),
        fetch(`https://api.github.com/repos/${repo}/traffic/clones`, { headers }).then((x) => x.ok ? x.json() : null),
        fetch(`https://api.github.com/repos/${repo}/traffic/popular/referrers`, { headers }).then((x) => x.ok ? x.json() : null),
        fetch(`https://api.github.com/repos/${repo}/traffic/popular/paths`, { headers }).then((x) => x.ok ? x.json() : null),
      ]);
      out.traffic = { views: views ? { count: views.count, uniques: views.uniques, daily: views.views } : null, clones: clones ? { count: clones.count, uniques: clones.uniques, daily: clones.clones } : null, referrers: refs || [], paths: paths || [] };
    }
    // stargazer history for the last 30 days (first pages only; enough for a launch week)
    const sg = await fetch(`https://api.github.com/repos/${repo}/stargazers?per_page=100`, { headers: { ...headers, accept: "application/vnd.github.star+json" } });
    if (sg.ok) { const list = await sg.json(); const byDay = {}; for (const s of list) { const d = (s.starred_at || "").slice(0, 10); if (d) byDay[d] = (byDay[d] || 0) + 1; } out.starsByDay = Object.entries(byDay).sort().map(([date, count]) => ({ date, count })); }
  } catch (e) { out.error = e.message; }
  return out;
}

/* Contact Sales intake, from the igl-intake D1 database the site writes to. */
export async function intake(env, days) {
  if (!env.INTAKE) return { configured: false, why: "INTAKE D1 binding missing" };
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [total, recent, byStatus, byDay, latest] = await Promise.all([
      env.INTAKE.prepare("SELECT COUNT(*) AS n FROM inquiries").first(),
      env.INTAKE.prepare("SELECT COUNT(*) AS n FROM inquiries WHERE received_at >= ?1").bind(since).first(),
      env.INTAKE.prepare("SELECT status, COUNT(*) AS n FROM inquiries GROUP BY status").all(),
      env.INTAKE.prepare("SELECT substr(received_at, 1, 10) AS date, COUNT(*) AS n FROM inquiries WHERE received_at >= ?1 GROUP BY date ORDER BY date").bind(since).all(),
      env.INTAKE.prepare("SELECT id, reference, received_at, first_name, last_name, email, company, title, company_size, region, industry, interests, volume, timeline, substr(message, 1, 240) AS message, country, status FROM inquiries ORDER BY received_at DESC LIMIT 50").all(),
    ]);
    return { configured: true, total: total.n, recent: recent.n, byStatus: Object.fromEntries(byStatus.results.map((r) => [r.status, r.n])), byDay: byDay.results, latest: latest.results.map((r) => ({ ...r, interests: safeJson(r.interests, []) })) };
  } catch (e) { return { configured: true, error: e.message }; }
}

/* Platform usage from the API databases: tenants (signups), identities,
   projections served, runs, audit events per day, per environment. */
export async function platform(env, days) {
  const out = {};
  for (const [name, db] of [["production", env.API_PROD], ["sandbox", env.API_SANDBOX]]) {
    if (!db) { out[name] = { configured: false, why: `${name} D1 binding missing` }; continue; }
    try {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const [tenants, tenantsRecent, identities, keys, runs, events, projections, byDay, recentTenants] = await Promise.all([
        db.prepare("SELECT COUNT(*) AS n FROM tenants").first(),
        db.prepare("SELECT COUNT(*) AS n FROM tenants WHERE created_at >= ?1").bind(since).first(),
        db.prepare("SELECT COUNT(*) AS n FROM identities").first(),
        db.prepare("SELECT COUNT(*) AS n FROM api_keys WHERE status = 'active'").first(),
        db.prepare("SELECT status, COUNT(*) AS n FROM runs WHERE created_at >= ?1 GROUP BY status").bind(since).all(),
        db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE occurred_at >= ?1").bind(since).first(),
        db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'projection.served' AND occurred_at >= ?1").bind(since).first(),
        db.prepare("SELECT substr(occurred_at, 1, 10) AS date, COUNT(*) AS events, SUM(CASE WHEN event_type = 'projection.served' THEN 1 ELSE 0 END) AS projections, SUM(CASE WHEN event_type LIKE 'intelligence.%' THEN 1 ELSE 0 END) AS intelligence FROM audit_events WHERE occurred_at >= ?1 GROUP BY date ORDER BY date").bind(since).all(),
        db.prepare("SELECT id, name, created_at, settings FROM tenants ORDER BY created_at DESC LIMIT 25").all(),
      ]);
      out[name] = { configured: true, tenants: tenants.n, tenantsRecent: tenantsRecent.n, identities: identities.n, activeKeys: keys.n, runs: Object.fromEntries(runs.results.map((r) => [r.status, r.n])), events: events.n, projections: projections.n, byDay: byDay.results, recentTenants: recentTenants.results.map((t) => ({ id: t.id, name: t.name, createdAt: t.created_at, selfServe: !!safeJson(t.settings, {}).selfServe, contact: safeJson(t.settings, {}).contact || null })) };
    } catch (e) { out[name] = { configured: true, error: e.message }; }
  }
  return out;
}

/* Service health: the hosts answer or they do not. */
export async function health(env) {
  const hosts = [["site", "https://id-me.ai/"], ["api", "https://api.id-me.ai/v1/health"], ["sandbox", "https://sandbox.id-me.ai/v1/health"], ["auth", "https://auth.id-me.ai/.well-known/jwks.json"]];
  const out = {};
  await Promise.all(hosts.map(async ([k, url]) => {
    const t0 = Date.now();
    try { const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { "user-agent": "igl-ops" } }); out[k] = { url, ok: r.ok, status: r.status, ms: Date.now() - t0 }; }
    catch (e) { out[k] = { url, ok: false, status: 0, ms: Date.now() - t0, error: e.name === "TimeoutError" ? "timeout" : "unreachable" }; }
  }));
  return out;
}

/* Where people are talking about it. Public search endpoints, no keys.

   The query is always sent as an exact phrase. Unquoted, GitHub and Algolia
   split "id-me.ai" into the words id, me and ai, and "repositories
   mentioning it" becomes every repository on GitHub with "ai" in its README
   (393,695 of them, on the day this was noticed). The repository's own
   organization is excluded from the GitHub count, and every hit is checked
   again for the literal phrase before it is shown. */
export async function mentions(env) {
  const q = env.MENTION_QUERY || "id-me.ai";
  const phrase = `"${q.replace(/"/g, "")}"`;
  const ownOrg = (env.GITHUB_REPO || "SMEPro-Technologies-LLC/igl").split("/")[0];
  const has = (...texts) => texts.some((t) => typeof t === "string" && t.toLowerCase().includes(q.toLowerCase()));
  const out = { query: q };
  try {
    const hn = await fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(phrase)}&tags=(story,comment)&hitsPerPage=50`, { headers: { "user-agent": "igl-ops" } });
    if (hn.ok) {
      const j = await hn.json();
      const hits = (j.hits || []).filter((h) => has(h.title, h.story_title, h.url, h.story_url, h.comment_text, h.story_text));
      out.hackerNews = { total: hits.length, items: hits.slice(0, 10).map((h) => ({ title: h.title || h.story_title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, points: h.points, comments: h.num_comments, at: h.created_at })) };
    } else out.hackerNews = { error: `HTTP ${hn.status}` };
  } catch (e) { out.hackerNews = { error: e.message }; }
  try {
    const gh = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(`${phrase} in:readme,description -org:${ownOrg}`)}&per_page=30`, { headers: { "user-agent": "igl-ops", accept: "application/vnd.github+json", ...(env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) } });
    if (gh.ok) {
      const j = await gh.json();
      const items = (j.items || []).filter((r) => r.owner?.login !== ownOrg).map((r) => ({ name: r.full_name, url: r.html_url, stars: r.stargazers_count, description: r.description }));
      out.githubRepos = { total: j.total_count, items: items.slice(0, 10), note: j.total_count > items.length ? "exact-phrase search; the own organization is excluded" : null };
    } else out.githubRepos = { error: `HTTP ${gh.status}` };
  } catch (e) { out.githubRepos = { error: e.message }; }
  try {
    const rd = await fetch(`https://www.reddit.com/search.json?q=${encodeURIComponent(phrase)}&sort=new&limit=10`, { headers: { "user-agent": "igl-ops/1.0 (operator console)" } });
    if (rd.ok) { const j = await rd.json(); out.reddit = { items: (j.data?.children || []).filter((c) => has(c.data.title, c.data.selftext, c.data.url)).map((c) => ({ title: c.data.title, url: "https://www.reddit.com" + c.data.permalink, score: c.data.score, subreddit: c.data.subreddit, at: new Date(c.data.created_utc * 1000).toISOString() })) }; }
    else out.reddit = { error: rd.status === 403 ? "Reddit refuses search requests from cloud networks (HTTP 403); this is not a count of zero" : `HTTP ${rd.status}`, searchUrl: `https://www.reddit.com/search/?q=${encodeURIComponent(phrase)}&sort=new` };
  } catch (e) { out.reddit = { error: e.message }; }
  return out;
}

/* npm downloads, once the package is published. */
export async function npm(env) {
  const pkg = env.NPM_PACKAGE; if (!pkg) return { configured: false, why: "NPM_PACKAGE var not set; the runtime is not published to npm yet" };
  try {
    const [week, range] = await Promise.all([
      fetch(`https://api.npmjs.org/downloads/point/last-week/${pkg}`).then((r) => r.ok ? r.json() : null),
      fetch(`https://api.npmjs.org/downloads/range/last-month/${pkg}`).then((r) => r.ok ? r.json() : null),
    ]);
    return { configured: true, package: pkg, lastWeek: week?.downloads ?? null, daily: range?.downloads || [] };
  } catch (e) { return { configured: true, package: pkg, error: e.message }; }
}

function safeJson(s, fb) { try { return JSON.parse(s); } catch { return fb; } }
