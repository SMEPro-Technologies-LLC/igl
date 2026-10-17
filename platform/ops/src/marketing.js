/* Marketing agents: one per application, run on the ops Worker's schedule
   or on demand from the console. Each run does four things with what is
   real and records all of it in the console's own tables:

     seo       reads the application's live home page, robots.txt,
               sitemap.xml and llms.txt and reports what search engines
               and AI crawlers will and will not find (title, description,
               canonical, Open Graph, Twitter card, JSON-LD, headings,
               indexability), with a score and the fix for each finding;
     content   drafts posts for the channels Postiz has connected, grounded
               in the page the agent just read and the application's own
               numbers, and queues them: nothing is posted until a person
               approves it on the console, and approval schedules it in
               Postiz;
     insights  turns the application's store summary and its ingest events
               into a short reading of what changed and what to do next;
     leads     when a search key is set, sources prospects for the
               application's market and keeps them with the query and the
               page they came from.

   Every outbound action is a Postiz call made at approval time, by a
   person, never by the agent itself. */

import { appById, ensureControl } from "./apps.js";

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

/* Per-application marketing brief: who it is for, what to say, where. Facts only, no claims the product does not back. */
export const BRIEFS = {
  wellreporter: { audience: "Texas oil and gas operators, regulatory and compliance staff", pitch: "One P-5 number in, every Texas RRC obligation out, dated and prioritized; inspections, NOVs and enforcement dockets read before the P-5 hold.", channels: ["linkedin", "linkedin-page", "x"], queries: ["Texas RRC P-5 compliance operator", "oil gas regulatory reporting software Texas"] },
  wellsite: { audience: "oil and gas operators and their pumpers in the 30 producing states", pitch: "Regulatory reporting, a compliance calendar and a data room for operators in 30 states; the pumper files from the phone in the field with photos and the operator's workspace updates; EDI and hard-copy filing.", channels: ["linkedin", "linkedin-page", "x"], queries: ["oil gas production reporting software", "RRC Form PR filing software", "pumper field reporting app"] },
  leasexplorer: { audience: "lease and mineral acquisition companies such as Buffalo Bayou Resources, land managers and landmen", pitch: "Finds lease opportunities on average three months before the field sees them and manages the whole life cycle: pipeline, VDR, field capture, land accounting, regulatory records and partner portal, with agents that score deals and flag title issues.", channels: ["linkedin", "linkedin-page", "x"], queries: ["mineral rights acquisition software Texas", "landman lease pipeline software", "oil gas lease acquisition company Texas"] },
  toxictort: { audience: "toxic tort plaintiff firms", pitch: "The practice site for toxic tort matters.", channels: ["linkedin"], queries: [] },
  tortplus: { audience: "toxic tort litigation teams, paralegals and associates", pitch: "Deposition evidence intelligence: every answer cites the transcript page, receipts record which documents were read, connectors to Dropbox, Drive, SharePoint and Box.", channels: ["linkedin", "linkedin-page", "x"], queries: ["deposition transcript analysis software litigation", "toxic tort litigation support software"] },
  tortgraph: { audience: "toxic tort litigators and expert consultants", pitch: "A defendant relationship graph with sourced evidence tiers, review status and conflicts, so causation chains are documented, not asserted.", channels: ["linkedin", "linkedin-page", "x"], queries: ["silica litigation defendant research", "asbestos defendant corporate history database"] },
  vdrpros: { audience: "corporate counsel, M&A advisors, finance teams", pitch: "An AI-driven virtual data room for corporate transactions: evidence, industries, security, compare.", channels: ["linkedin", "linkedin-page", "x"], queries: ["virtual data room M&A pricing", "VDR alternative Datasite Intralinks"] },
  realechat: { audience: "real estate agents and brokers in Houston", pitch: "Leads who can actually buy, exposure you actually own: live listings and real market numbers.", channels: ["linkedin", "instagram", "facebook", "x"], queries: ["Houston real estate agent lead generation", "Houston brokerage marketing tools"] },
  realstarglobal: { audience: "real estate professionals", pitch: "RealStar Global.", channels: ["linkedin", "x"], queries: [] },
  idme: { audience: "developers and security teams putting AI agents into production", pitch: "Every AI action states who is acting, what they may do and why before it runs, and leaves a signed receipt anyone can verify. Open source runtime, hosted API with a free sandbox, MCP tools.", channels: ["linkedin", "linkedin-page", "x", "reddit", "dev.to", "hashnode"], queries: ["AI agent governance audit trail", "MCP server authorization policy"] },
  ricorsa: { audience: "professionals who want an answer engine that learns them", pitch: "Your living intelligence: cited answers, an identity graph that gets smarter, 500 gas free to start, no subscription.", channels: ["linkedin", "x", "instagram", "threads"], queries: ["Perplexity alternative with memory", "AI answer engine that learns you"] },
  smeprotech: { audience: "SMEPro's customers and partners", pitch: "SMEPro Technologies: governed intelligence for regulated industries.", channels: ["linkedin-page"], queries: [] },
  smeprotec: { audience: "SMEPro's customers and partners", pitch: "SMEPro Technologies.", channels: ["linkedin-page"], queries: [] },
  ailu: { audience: "Lamar University", pitch: "A custom application for Lamar University; not marketed.", channels: [], queries: [] },
  luconcourse: { audience: "Lamar University", pitch: "A custom application for Lamar University; not marketed.", channels: [], queries: [] },
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ops_agent_runs (id TEXT PRIMARY KEY, app_id TEXT NOT NULL, trigger TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, summary TEXT, detail TEXT);
CREATE INDEX IF NOT EXISTS ops_agent_runs_app ON ops_agent_runs (app_id, started_at DESC);
CREATE TABLE IF NOT EXISTS ops_seo (id TEXT PRIMARY KEY, app_id TEXT NOT NULL, checked_at TEXT NOT NULL, url TEXT NOT NULL, score INTEGER NOT NULL, findings TEXT NOT NULL, facts TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ops_seo_app ON ops_seo (app_id, checked_at DESC);
CREATE TABLE IF NOT EXISTS ops_content (id TEXT PRIMARY KEY, app_id TEXT NOT NULL, run_id TEXT, channel TEXT NOT NULL, integration_id TEXT, title TEXT, body TEXT NOT NULL, hashtags TEXT, status TEXT NOT NULL, scheduled_for TEXT, postiz_post_id TEXT, error TEXT, created_at TEXT NOT NULL, decided_by TEXT, decided_at TEXT);
CREATE INDEX IF NOT EXISTS ops_content_app ON ops_content (app_id, status, created_at DESC);
CREATE TABLE IF NOT EXISTS ops_leads (id TEXT PRIMARY KEY, app_id TEXT NOT NULL, run_id TEXT, name TEXT NOT NULL, org TEXT, url TEXT, source TEXT NOT NULL, query TEXT, score INTEGER, note TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (app_id, url));
CREATE TABLE IF NOT EXISTS ops_insights (id TEXT PRIMARY KEY, app_id TEXT NOT NULL, run_id TEXT, at TEXT NOT NULL, body TEXT NOT NULL, numbers TEXT);
`;
let ready = null;
async function ensure(env) {
  await ensureControl(env);
  if (!ready) ready = (async () => { for (const s of SCHEMA.split(";").map((x) => x.trim()).filter(Boolean)) await env.INTAKE.prepare(s).run(); return true; })().catch((e) => { ready = null; throw e; });
  return ready;
}

/* ---------------- SEO audit ---------------- */

const strip = (h) => h.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const meta = (html, re) => { const m = html.match(re); return m ? decodeEntities(m[1]).trim() : null; };
function decodeEntities(s) { return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'"); }
const metaContent = (html, nameOrProp) => meta(html, new RegExp(`<meta[^>]+(?:name|property)=["']${nameOrProp}["'][^>]*content=["']([^"']*)["']`, "i")) || meta(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${nameOrProp}["']`, "i"));

export async function seoAudit(domain) {
  const url = `https://${domain}/`; const facts = { url }; const findings = [];
  const get = async (u) => { try { const r = await fetch(u, { headers: { "user-agent": "igl-ops marketing agent" }, redirect: "follow", signal: AbortSignal.timeout(10000) }); return { status: r.status, ok: r.ok, text: r.ok ? await r.text() : "", type: r.headers.get("content-type") || "", final: r.url }; } catch (e) { return { status: 0, ok: false, text: "", error: e.name === "TimeoutError" ? "timeout" : "unreachable" }; } };
  const page = await get(url);
  facts.status = page.status; facts.final_url = page.final || url;
  if (!page.ok) { findings.push({ severity: "critical", check: "reachable", found: page.error || `HTTP ${page.status}`, fix: "The home page does not answer. Nothing else can be indexed until it does." }); return { url, score: 0, findings, facts }; }
  const html = page.text;
  const add = (severity, check, found, fix) => findings.push({ severity, check, found, fix });
  facts.title = meta(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!facts.title) add("critical", "title", "missing", "Add a <title> of 50 to 60 characters that names the product and what it does.");
  else if (facts.title.length < 20 || facts.title.length > 70) add("warn", "title", `${facts.title.length} characters: "${facts.title}"`, "Aim for 50 to 60 characters; search results cut longer titles.");
  facts.description = metaContent(html, "description");
  if (!facts.description) add("critical", "meta description", "missing", "Add a meta description of 140 to 160 characters; it is the snippet under the title in results.");
  else if (facts.description.length < 70 || facts.description.length > 170) add("warn", "meta description", `${facts.description.length} characters`, "Aim for 140 to 160 characters.");
  facts.canonical = meta(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  if (!facts.canonical) add("warn", "canonical", "missing", `Add <link rel="canonical" href="${url}"> so www and non-www are not indexed twice.`);
  facts.og = { title: metaContent(html, "og:title"), description: metaContent(html, "og:description"), image: metaContent(html, "og:image"), url: metaContent(html, "og:url") };
  if (!facts.og.title || !facts.og.image) add("warn", "Open Graph", `title ${facts.og.title ? "set" : "missing"}, image ${facts.og.image ? "set" : "missing"}`, "Set og:title, og:description, og:image (1200×630) and og:url; links shared on LinkedIn, Slack and iMessage render from these.");
  facts.twitter = { card: metaContent(html, "twitter:card"), image: metaContent(html, "twitter:image") };
  if (!facts.twitter.card) add("info", "Twitter card", "missing", 'Add <meta name="twitter:card" content="summary_large_image">.');
  const ld = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  facts.jsonld_types = []; for (const block of ld) { try { const j = JSON.parse(block); for (const o of (Array.isArray(j) ? j : [j])) if (o && o["@type"]) facts.jsonld_types.push(String(o["@type"])); } catch { add("warn", "JSON-LD", "a block does not parse", "Fix the JSON so Google and AI crawlers can read the structured data."); } }
  if (!facts.jsonld_types.length) add("warn", "structured data", "no JSON-LD", "Add Organization, WebSite and SoftwareApplication (or Product) JSON-LD; it is what AI answer engines and rich results read.");
  else if (!facts.jsonld_types.some((t) => /SoftwareApplication|Product|Service|FAQPage/.test(t))) add("info", "structured data", facts.jsonld_types.join(", "), "Add SoftwareApplication or Product with offers, and FAQPage for the questions buyers ask.");
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => strip(m[1])).filter(Boolean); facts.h1 = h1s;
  if (h1s.length === 0) add("warn", "H1", "none", "One H1 that states what the product does and for whom.");
  else if (h1s.length > 1) add("info", "H1", `${h1s.length} H1 elements`, "Keep one H1 per page.");
  facts.robots_meta = metaContent(html, "robots");
  if (facts.robots_meta && /noindex/i.test(facts.robots_meta)) add("critical", "indexability", `robots meta: ${facts.robots_meta}`, "Remove noindex from the home page.");
  facts.lang = meta(html, /<html[^>]+lang=["']([^"']+)["']/i); if (!facts.lang) add("info", "lang", "missing", 'Add lang="en" on <html>.');
  facts.viewport = !!metaContent(html, "viewport"); if (!facts.viewport) add("warn", "viewport", "missing", "Add the viewport meta; mobile rendering is the indexing baseline.");
  const text = strip(html); facts.words = text.split(" ").length;
  if (facts.words < 150) add("warn", "content", `${facts.words} words of visible text`, "Search engines and AI crawlers need readable text on the page itself; render the key copy in HTML, not only in a script.");
  facts.excerpt = text.slice(0, 1200);
  const robots = await get(`https://${domain}/robots.txt`); facts.robots_txt = robots.ok ? robots.text.slice(0, 2000) : null;
  if (!robots.ok) add("warn", "robots.txt", `HTTP ${robots.status}`, "Serve robots.txt with a Sitemap: line; allow GPTBot, ClaudeBot, PerplexityBot and Google-Extended if you want AI answer engines to cite the site.");
  else {
    if (!/sitemap:/i.test(robots.text)) add("info", "robots.txt", "no Sitemap line", `Add "Sitemap: https://${domain}/sitemap.xml".`);
    if (/disallow:\s*\/\s*$/im.test(robots.text)) add("critical", "robots.txt", "Disallow: / present", "The whole site is blocked from crawling.");
  }
  const sm = await get(`https://${domain}/sitemap.xml`); facts.sitemap = sm.ok ? (sm.text.match(/<loc>/g) || []).length : null;
  if (!sm.ok) add("warn", "sitemap.xml", `HTTP ${sm.status}`, "Publish sitemap.xml with every indexable page and lastmod dates.");
  const llms = await get(`https://${domain}/llms.txt`); facts.llms_txt = llms.ok && /text/.test(llms.type) && !/<html/i.test(llms.text.slice(0, 200)) ? llms.text.slice(0, 600) : null;
  if (!facts.llms_txt) add("info", "llms.txt", "missing", "Publish llms.txt: a plain-text summary of the product, its pages and its pricing for AI crawlers (id-me.ai has one to copy).");
  const weights = { critical: 25, warn: 8, info: 3 };
  const score = Math.max(0, 100 - findings.reduce((a, f) => a + weights[f.severity], 0));
  return { url, score, findings, facts };
}

/* ---------------- Postiz ---------------- */

const postizBase = (env) => (env.POSTIZ_API_URL || "https://api.postiz.com/public/v1").replace(/\/$/, "");
export const postizConfigured = (env) => Boolean(env.POSTIZ_API_KEY);
async function postiz(env, path, init = {}) {
  if (!postizConfigured(env)) throw new Error("POSTIZ_API_KEY is not set on the ops Worker");
  const r = await fetch(postizBase(env) + path, { ...init, headers: { authorization: env.POSTIZ_API_KEY, "content-type": "application/json", ...(init.headers || {}) }, signal: AbortSignal.timeout(30000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Postiz ${init.method || "GET"} ${path}: ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}
export async function postizIntegrations(env) {
  const list = await postiz(env, "/integrations");
  return (Array.isArray(list) ? list : list.integrations || []).map((i) => ({ id: i.id, identifier: i.identifier, name: i.name, disabled: !!i.disabled, customer: i.customer?.name || null, picture: i.picture || null }));
}
/* Schedule an approved draft in Postiz. The integration is chosen at approval; the post goes to Postiz's queue for the chosen time. */
/** @param {any} env @param {{ integrationId: string, content: string, when: string, settings?: any }} o */
async function postizSchedule(env, { integrationId, content, when, settings }) {
  const body = { type: "schedule", date: when, shortLink: false, tags: [], posts: [{ integration: { id: integrationId }, value: [{ content, image: [] }], settings: settings || {} }] };
  const r = await postiz(env, "/posts", { method: "POST", body: JSON.stringify(body) });
  const first = Array.isArray(r) ? r[0] : (r.posts?.[0] || r);
  return first?.postId || first?.id || null;
}

/* ---------------- the model ---------------- */

async function draftWithModel(env, app, brief, audit, numbers, channels) {
  if (!env.ANTHROPIC_API_KEY) return { error: "ANTHROPIC_API_KEY is not set on the ops Worker; no drafts written" };
  const system = "You write social posts for a software company. Use only facts in the brief and the page excerpt; never invent features, numbers, customers or awards. No emojis, no hashtags inside sentences, no exclamation marks. Each post must name one concrete thing the product does and who it is for. Return JSON only.";
  const user = `Application: ${app.name} (${app.domain}), ${app.kind}.\nAudience: ${brief.audience}\nPitch: ${brief.pitch}\nPage title: ${audit.facts.title || ""}\nPage description: ${audit.facts.description || ""}\nPage excerpt: ${(audit.facts.excerpt || "").slice(0, 900)}\nNumbers this week: ${JSON.stringify(numbers || {})}\nChannels: ${channels.join(", ")}\n\nWrite one post per channel. LinkedIn 600 to 900 characters in short paragraphs; X under 260 characters; Instagram or Facebook or Threads 300 to 500 characters; Reddit, dev.to or Hashnode a title and 400 to 700 characters of plain technical prose. Up to three hashtags at the end, as a list.\nReturn: {"posts":[{"channel":"linkedin","title":null,"body":"...","hashtags":["..."]}]}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: env.MARKETING_MODEL || "claude-sonnet-4-5", max_tokens: 2500, system, messages: [{ role: "user", content: user }] }), signal: AbortSignal.timeout(60000) });
  if (!r.ok) return { error: `model answered ${r.status}: ${(await r.text()).slice(0, 200)}` };
  const j = await r.json(); const text = (j.content || []).map((c) => c.text || "").join("");
  try { const m = text.match(/\{[\s\S]*\}/); const parsed = JSON.parse(m ? m[0] : text); return { posts: Array.isArray(parsed.posts) ? parsed.posts : [] }; }
  catch { return { error: "model did not return JSON" }; }
}

async function sourceLeads(env, app, brief) {
  if (!env.BRAVE_API_KEY) return { error: "BRAVE_API_KEY is not set on the ops Worker; lead sourcing needs a search key", leads: [] };
  const leads = [];
  for (const q of brief.queries.slice(0, 2)) {
    try {
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10`, { headers: { "x-subscription-token": env.BRAVE_API_KEY, accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const j = await r.json();
      for (const w of (j.web?.results || [])) {
        const host = (() => { try { return new URL(w.url).hostname.replace(/^www\./, ""); } catch { return null; } })();
        if (!host || host === app.domain || /wikipedia|youtube|linkedin\.com\/pulse|reddit\.com/.test(host)) continue;
        leads.push({ name: w.title?.slice(0, 160) || host, org: host, url: w.url, source: "brave", query: q, score: 50, note: (w.description || "").slice(0, 300) });
      }
    } catch { /* next query */ }
  }
  return { leads };
}

/* ---------------- a run ---------------- */

/** @param {any} env @param {string} appId @param {string} [trigger] @param {{ integrations?: any[] }} [opts] */
export async function runAgent(env, appId, trigger = "manual", { integrations } = {}) {
  const app = appById(appId); if (!app) return { error: "unknown application", status: 404 };
  if (!env.INTAKE) return { error: "INTAKE binding missing", status: 503 };
  await ensure(env);
  const brief = BRIEFS[appId] || { audience: "", pitch: app.name, channels: ["linkedin"], queries: [] };
  const runId = uuid(); const started = now();
  await env.INTAKE.prepare("INSERT INTO ops_agent_runs (id, app_id, trigger, started_at, status) VALUES (?1, ?2, ?3, ?4, 'running')").bind(runId, appId, trigger, started).run();
  const detail = {};
  // 1. SEO
  const audit = await seoAudit(app.domain); detail.seo = { score: audit.score, findings: audit.findings.length };
  await env.INTAKE.prepare("INSERT INTO ops_seo (id, app_id, checked_at, url, score, findings, facts) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(uuid(), appId, started, audit.url, audit.score, JSON.stringify(audit.findings), JSON.stringify(audit.facts)).run();
  // 2. numbers from ingest and from the store summary the console already computes
  const ev = await env.INTAKE.prepare("SELECT SUM(kind='login') AS logins, SUM(kind='usage') AS usage, COUNT(DISTINCT customer_ref) AS people FROM ops_events WHERE app_id = ?1 AND at >= ?2").bind(appId, new Date(Date.now() - 7 * 864e5).toISOString()).first();
  const numbers = { logins_7d: ev?.logins || 0, usage_events_7d: ev?.usage || 0, people_7d: ev?.people || 0 };
  // 3. channels: those Postiz has connected that the brief wants; otherwise the brief's list, to be assigned at approval
  let channels = brief.channels; let connected = [];
  if (postizConfigured(env)) { try { connected = integrations || await postizIntegrations(env); const have = new Set(connected.filter((i) => !i.disabled).map((i) => i.identifier)); const wanted = brief.channels.filter((c) => have.has(c)); if (wanted.length) channels = wanted; detail.postiz = { connected: connected.length, used: channels }; } catch (e) { detail.postiz = { error: e.message }; } }
  else detail.postiz = { error: "POSTIZ_API_KEY is not set; drafts are queued for a channel to be chosen at approval" };
  // 4. drafts
  const drafted = brief.channels.length ? await draftWithModel(env, app, brief, audit, numbers, channels) : { posts: [], skipped: "not marketed: no channels in the brief" };
  detail.content = drafted.error ? { error: drafted.error } : (drafted.skipped ? { skipped: drafted.skipped } : { drafted: drafted.posts.length });
  for (const p of drafted.posts || []) {
    if (!p.body || typeof p.body !== "string") continue;
    const integ = connected.find((i) => i.identifier === p.channel && !i.disabled);
    await env.INTAKE.prepare("INSERT INTO ops_content (id, app_id, run_id, channel, integration_id, title, body, hashtags, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'draft', ?9)")
      .bind(uuid(), appId, runId, String(p.channel || channels[0]).slice(0, 40), integ?.id || null, p.title ? String(p.title).slice(0, 200) : null, p.body.slice(0, 4000), JSON.stringify(Array.isArray(p.hashtags) ? p.hashtags.slice(0, 5) : []), now()).run();
  }
  // 5. leads
  const sourced = await sourceLeads(env, app, brief); detail.leads = sourced.error ? { error: sourced.error } : { found: sourced.leads.length };
  for (const l of sourced.leads) await env.INTAKE.prepare("INSERT OR IGNORE INTO ops_leads (id, app_id, run_id, name, org, url, source, query, score, note, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'new', ?11)").bind(uuid(), appId, runId, l.name, l.org, l.url, l.source, l.query, l.score, l.note, now()).run();
  // 6. insight: plain sentences from the numbers and the audit, no model needed
  const top = audit.findings.filter((f) => f.severity === "critical")[0] || audit.findings[0];
  const insight = [`${app.name}: site score ${audit.score}/100${top ? `; first fix: ${top.check} (${top.found})` : "; nothing to fix on the home page"}.`,
    numbers.people_7d ? `${numbers.people_7d} people signed in through ingest in the last 7 days, ${numbers.logins_7d} sign-ins, ${numbers.usage_events_7d} usage events.` : "No sign-in events arrived through ingest this week; wire the application's login and logout to /ingest to see activity here.",
    drafted.posts?.length ? `${drafted.posts.length} posts drafted for ${channels.join(", ")}; approve them on the Content tab to schedule.` : "No posts drafted this run.",
    sourced.leads?.length ? `${sourced.leads.length} prospects sourced from ${brief.queries.length} searches.` : (sourced.error ? "Lead sourcing is off until a search key is set." : "No prospects found.")].join(" ");
  await env.INTAKE.prepare("INSERT INTO ops_insights (id, app_id, run_id, at, body, numbers) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(uuid(), appId, runId, now(), insight, JSON.stringify({ ...numbers, seo_score: audit.score })).run();
  const status = drafted.error && sourced.error ? "partial" : "done";
  await env.INTAKE.prepare("UPDATE ops_agent_runs SET finished_at = ?1, status = ?2, summary = ?3, detail = ?4 WHERE id = ?5").bind(now(), status, insight, JSON.stringify(detail), runId).run();
  return { ok: true, run: runId, status, seo: { score: audit.score, findings: audit.findings }, drafted: drafted.posts?.length || 0, leads: sourced.leads?.length || 0, detail };
}

/* The scheduled sweep: one application per hour, in registry order, so every application runs about twice a day. */
export async function scheduledRun(env, apps) {
  const hour = new Date().getUTCHours(); const app = apps[hour % apps.length];
  return runAgent(env, app.id, "schedule");
}

/* ---------------- what the console shows ---------------- */

export async function marketingFor(env, appId) {
  if (!env.INTAKE) return { error: "INTAKE binding missing", status: 503 };
  await ensure(env);
  const q = (sql, ...args) => env.INTAKE.prepare(sql).bind(...args).all().then((r) => r.results);
  const [runs, seo, content, leads, insights] = await Promise.all([
    q("SELECT id, trigger, started_at, finished_at, status, summary FROM ops_agent_runs WHERE app_id = ?1 ORDER BY started_at DESC LIMIT 20", appId),
    q("SELECT id, checked_at, url, score, findings, facts FROM ops_seo WHERE app_id = ?1 ORDER BY checked_at DESC LIMIT 1", appId),
    q("SELECT id, channel, integration_id, title, body, hashtags, status, scheduled_for, postiz_post_id, error, created_at, decided_by, decided_at FROM ops_content WHERE app_id = ?1 ORDER BY created_at DESC LIMIT 100", appId),
    q("SELECT id, name, org, url, source, query, score, note, status, created_at FROM ops_leads WHERE app_id = ?1 ORDER BY created_at DESC LIMIT 100", appId),
    q("SELECT id, at, body, numbers FROM ops_insights WHERE app_id = ?1 ORDER BY at DESC LIMIT 10", appId),
  ]);
  const latest = seo[0] ? { ...seo[0], findings: JSON.parse(seo[0].findings), facts: JSON.parse(seo[0].facts) } : null;
  let integrations = null; if (postizConfigured(env)) { try { integrations = await postizIntegrations(env); } catch (e) { integrations = { error: e.message }; } }
  return { app: appId, brief: BRIEFS[appId] || null, postiz: { configured: postizConfigured(env), integrations }, model: !!env.ANTHROPIC_API_KEY, search: !!env.BRAVE_API_KEY, runs, seo: latest, content: content.map((c) => ({ ...c, hashtags: JSON.parse(c.hashtags || "[]") })), leads, insights };
}

export async function decideContent(env, id, action, { integrationId, when, by }) {
  if (!env.INTAKE) return { error: "INTAKE binding missing", status: 503 };
  await ensure(env);
  const row = await env.INTAKE.prepare("SELECT * FROM ops_content WHERE id = ?1").bind(id).first();
  if (!row) return { error: "no such draft", status: 404 };
  if (row.status !== "draft" && row.status !== "approved") return { error: `draft is already ${row.status}`, status: 409 };
  if (action === "reject") { await env.INTAKE.prepare("UPDATE ops_content SET status = 'rejected', decided_by = ?1, decided_at = ?2 WHERE id = ?3").bind(by, now(), id).run(); return { ok: true, status: "rejected" }; }
  if (action !== "approve") return { error: "action must be approve or reject", status: 422 };
  const integ = integrationId || row.integration_id;
  if (!integ) return { error: "choose the Postiz channel to post to", status: 422 };
  const at = when ? new Date(when) : new Date(Date.now() + 3600e3);
  if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 60e3) return { error: "the time must be in the future", status: 422 };
  const content = row.title ? `${row.title}\n\n${row.body}` : row.body;
  const tags = JSON.parse(row.hashtags || "[]"); const full = tags.length ? `${content}\n\n${tags.map((t) => (t.startsWith("#") ? t : "#" + t)).join(" ")}` : content;
  try {
    const postId = await postizSchedule(env, { integrationId: integ, content: full, when: at.toISOString() });
    await env.INTAKE.prepare("UPDATE ops_content SET status = 'scheduled', integration_id = ?1, scheduled_for = ?2, postiz_post_id = ?3, decided_by = ?4, decided_at = ?5, error = NULL WHERE id = ?6").bind(integ, at.toISOString(), postId, by, now(), id).run();
    return { ok: true, status: "scheduled", postiz_post_id: postId, scheduled_for: at.toISOString() };
  } catch (e) {
    await env.INTAKE.prepare("UPDATE ops_content SET status = 'approved', integration_id = ?1, scheduled_for = ?2, error = ?3, decided_by = ?4, decided_at = ?5 WHERE id = ?6").bind(integ, at.toISOString(), e.message.slice(0, 500), by, now(), id).run();
    return { error: `approved, but Postiz did not take it: ${e.message}`, status: 502 };
  }
}

export async function updateLead(env, id, status) {
  if (!["new", "contacted", "qualified", "dropped"].includes(status)) return { error: "bad status", status: 422 };
  await ensure(env);
  const r = await env.INTAKE.prepare("UPDATE ops_leads SET status = ?1 WHERE id = ?2").bind(status, id).run();
  return r.meta.changes ? { ok: true } : { error: "no such lead", status: 404 };
}
