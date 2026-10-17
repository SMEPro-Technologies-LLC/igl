/* The console page. Plain HTML, inline CSS and JS, no external assets, so
   the content security policy can be strict. Renders /api/overview and
   /api/mentions. */

export const SIGNOUT = `<form method="post" action="/logout" style="margin:0"><button type="submit">Sign out</button></form>`;

export const LOGIN = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>IGL operations, sign in</title>
<meta name="robots" content="noindex">
<style>
  :root { color-scheme: dark; --bg: #0b0d14; --panel: #12151e; --hair: #262a36; --ink: #e8ecf4; --ink2: #a9b0c2; --acc: #6a7bff; --bad: #ef5d5d; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--ink); font: 15px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 16px; }
  form { width: 100%; max-width: 360px; background: var(--panel); border: 1px solid var(--hair); border-radius: 14px; padding: 24px; display: grid; gap: 12px; }
  h1 { font-size: 16px; margin: 0 0 4px; } h1 b { letter-spacing: .08em; } h1 span { color: var(--ink2); font-weight: 400; }
  label { display: grid; gap: 4px; font-size: 13px; color: var(--ink2); }
  input { font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--hair); border-radius: 8px; padding: 9px 10px; }
  button { font: inherit; color: #fff; background: var(--acc); border: 1px solid var(--acc); border-radius: 8px; padding: 9px 12px; cursor: pointer; }
  .err { color: var(--bad); font-size: 13px; min-height: 1.2em; }
  .note { color: var(--ink2); font-size: 12.5px; }
</style>
</head>
<body>
<form method="post" action="/login" autocomplete="on">
  <h1 style="display:flex;align-items:center;gap:10px"><svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 384 384" role="img" aria-label="IGL Identity Governed Logic"><title>IGL | Identity Governed Logic</title><defs><linearGradient id="igl-gradient" x1="35" y1="0" x2="256" y2="270" gradientUnits="userSpaceOnUse"><stop stop-color="#1455FF"/><stop offset="0.53" stop-color="#333CFF"/><stop offset="1" stop-color="#713BFF"/></linearGradient></defs><g transform="translate(35.5,57)"><g fill="url(#igl-gradient)"><path d="M162 0H197L270 50V110L194 58Q180 48 164 48C98 48 53 92 53 143C53 185 77 218 108 230V94L165 64V270H137C61 270 0 212 0 137C0 59 68 0 162 0Z"/><path d="M176 116L232 155V221H287L313 246L287 270H176Z"/></g></g></svg><span><b>IGL</b> <span>operations</span></span></h1>
  <label>Username <input name="username" autocomplete="username" required autofocus></label>
  <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
  <div class="err">__ERROR__</div>
  <button type="submit">Sign in</button>
  <div class="note">Private console for SMEPro Technologies operators. Sessions last twelve hours.</div>
</form>
</body>
</html>`;

export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>IGL operations</title>
<meta name="robots" content="noindex">
<style>
  :root { color-scheme: dark; --bg: #0b0d14; --panel: #12151e; --hair: #262a36; --ink: #e8ecf4; --ink2: #a9b0c2; --acc: #6a7bff; --ok: #4cc94c; --warn: #e6b450; --bad: #ef5d5d; --mono: ui-monospace, SFMono-Regular, Menlo, monospace; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--hair); flex-wrap: wrap; }
  header b { letter-spacing: .08em; }
  .brandline { display: flex; align-items: center; gap: 10px; } .brandline svg { display: block; }
  header .r { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; color: var(--ink2); font-size: 13px; }
  select, button { font: inherit; color: var(--ink); background: var(--panel); border: 1px solid var(--hair); border-radius: 8px; padding: 6px 10px; }
  button.p { background: var(--acc); border-color: var(--acc); color: #fff; }
  main { padding: 16px 20px 40px; display: grid; gap: 16px; max-width: 1400px; margin: 0 auto; }
  .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .card { background: var(--panel); border: 1px solid var(--hair); border-radius: 12px; padding: 14px 16px; min-width: 0; }
  .card h2 { font-size: 13px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--ink2); margin: 0 0 8px; }
  .kpi { font-size: 30px; font-weight: 600; line-height: 1.1; }
  .sub { color: var(--ink2); font-size: 13px; }
  .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--hair); vertical-align: top; }
  th { color: var(--ink2); font-weight: 500; font-size: 12px; letter-spacing: .05em; text-transform: uppercase; }
  td.n, th.n { text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .tag { display: inline-block; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--hair); font-size: 12px; color: var(--ink2); }
  .tag.ok { color: var(--ok); border-color: var(--ok); } .tag.bad { color: var(--bad); border-color: var(--bad); } .tag.warn { color: var(--warn); border-color: var(--warn); }
  .note { color: var(--ink2); font-size: 13px; }
  svg.spark { width: 100%; height: 56px; display: block; margin-top: 6px; }
  .mono { font-family: var(--mono); font-size: 12.5px; }
  a { color: var(--acc); text-decoration: none; } a:hover { text-decoration: underline; }
  details summary { cursor: pointer; color: var(--ink2); }
  textarea { width: 100%; font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--hair); border-radius: 8px; padding: 8px; }
  .unconf { border-style: dashed; }
</style>
</head>
<body>
<header>
  <div class="brandline"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 384 384" role="img" aria-label="IGL Identity Governed Logic"><title>IGL | Identity Governed Logic</title><defs><linearGradient id="igl-gradient" x1="35" y1="0" x2="256" y2="270" gradientUnits="userSpaceOnUse"><stop stop-color="#1455FF"/><stop offset="0.53" stop-color="#333CFF"/><stop offset="1" stop-color="#713BFF"/></linearGradient></defs><g transform="translate(35.5,57)"><g fill="url(#igl-gradient)"><path d="M162 0H197L270 50V110L194 58Q180 48 164 48C98 48 53 92 53 143C53 185 77 218 108 230V94L165 64V270H137C61 270 0 212 0 137C0 59 68 0 162 0Z"/><path d="M176 116L232 155V221H287L313 246L287 270H176Z"/></g></g></svg><b>IGL</b> <span class="sub">operations</span></div>
  <div class="r"><span id="who">__WHO__</span>
    <select id="days"><option value="1">last 24 hours</option><option value="7" selected>last 7 days</option><option value="30">last 30 days</option><option value="90">last 90 days</option></select>
    <button id="refresh" class="p">Refresh</button><span id="stamp" class="sub"></span>__SIGNOUT__</div>
</header>
<main id="main"><div class="note">Loading</div></main>
<script>
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const n = (x) => (x === null || x === undefined) ? "n/a" : Number(x).toLocaleString();
  function spark(points, key) {
    if (!points || !points.length) return "";
    const vals = points.map((p) => Number(p[key]) || 0); const max = Math.max(1, ...vals); const w = 300, h = 50;
    const pts = vals.map((v, i) => [(i / Math.max(1, vals.length - 1)) * w, h - (v / max) * (h - 4) - 2]);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><path d="' + d + '" fill="none" stroke="#6a7bff" stroke-width="2"/></svg>';
  }
  function unconf(title, why) { return '<div class="card unconf"><h2>' + esc(title) + '</h2><div class="note">Not configured: ' + esc(why) + '</div></div>'; }
  function table(cols, rows) {
    return '<table><thead><tr>' + cols.map((c) => '<th class="' + (c.n ? "n" : "") + '">' + esc(c.h) + '</th>').join("") + '</tr></thead><tbody>' +
      rows.map((r) => '<tr>' + cols.map((c) => '<td class="' + (c.n ? "n" : "") + '">' + (c.f ? c.f(r) : esc(r[c.k])) + '</td>').join("") + '</tr>').join("") + '</tbody></table>';
  }
  function render(d) {
    const out = [];
    // health
    out.push('<div class="row">' + Object.entries(d.health).map(([k, h]) => '<div class="card"><h2>' + esc(k) + '</h2><div class="kpi"><span class="tag ' + (h.ok ? "ok" : "bad") + '">' + (h.ok ? "up" : (h.error || "down")) + '</span></div><div class="sub">' + esc(h.url) + ' ' + (h.status || "") + ' ' + h.ms + ' ms</div></div>').join("") + '</div>');
    out.push('<div class="card" id="apps"><h2>Applications</h2><div class="note">Loading</div></div>');
    out.push('<div class="card" id="billing"><h2>Billing</h2><div class="note">Loading</div></div>');
    // site
    if (!d.site.configured) out.push(unconf("Site traffic", d.site.why));
    else if (d.site.error) out.push(unconf("Site traffic", d.site.error));
    else out.push('<div class="row"><div class="card"><h2>Page views (' + d.days + 'd)</h2><div class="kpi">' + n(d.site.totals.requests) + '</div>' + spark(d.site.daily, "requests") + '</div><div class="card"><h2>Visits (' + d.days + 'd)</h2><div class="kpi">' + n(d.site.totals.visits) + '</div>' + spark(d.site.daily, "visits") + '</div></div>' +
      '<div class="grid2"><div class="card"><h2>Top pages</h2>' + table([{ h: "Path", k: "path" }, { h: "Views", k: "views", n: 1 }, { h: "Visits", k: "visits", n: 1 }], d.site.paths) + '</div><div class="card"><h2>Referrers</h2>' + table([{ h: "Host", k: "host" }, { h: "Views", k: "views", n: 1 }], d.site.referers) + '</div><div class="card"><h2>Countries</h2>' + table([{ h: "Country", k: "country" }, { h: "Views", k: "views", n: 1 }, { h: "Visits", k: "visits", n: 1 }], d.site.countries) + '</div><div class="card"><h2>Status codes</h2>' + table([{ h: "Status", k: "status" }, { h: "Count", k: "count", n: 1 }], d.site.status) + '</div></div>');
    // github
    const g = d.github;
    out.push('<div class="row"><div class="card"><h2>GitHub stars</h2><div class="kpi">' + n(g.stars) + '</div><div class="sub"><a href="https://github.com/' + esc(g.repo) + '" target="_blank" rel="noopener">' + esc(g.repo) + '</a>' + (g.error ? ' (' + esc(g.error) + ')' : '') + '</div>' + spark(g.starsByDay, "count") + '</div><div class="card"><h2>Forks</h2><div class="kpi">' + n(g.forks) + '</div><div class="sub">' + n(g.watchers) + ' watching, ' + n(g.openIssues) + ' open issues</div></div>' +
      (g.traffic ? '<div class="card"><h2>Repo views (14d)</h2><div class="kpi">' + n(g.traffic.views?.count) + '</div><div class="sub">' + n(g.traffic.views?.uniques) + ' unique</div>' + spark(g.traffic.views?.daily, "count") + '</div><div class="card"><h2>Clones (14d)</h2><div class="kpi">' + n(g.traffic.clones?.count) + '</div><div class="sub">' + n(g.traffic.clones?.uniques) + ' unique</div>' + spark(g.traffic.clones?.daily, "count") + '</div>' : unconf("Repo traffic", "GITHUB_TOKEN with push access to the repository is not set on the ops Worker")) + '</div>');
    if (g.traffic) out.push('<div class="grid2"><div class="card"><h2>Repo referrers (14d)</h2>' + table([{ h: "Referrer", k: "referrer" }, { h: "Views", k: "count", n: 1 }, { h: "Unique", k: "uniques", n: 1 }], g.traffic.referrers) + '</div><div class="card"><h2>Popular repo paths</h2>' + table([{ h: "Path", k: "path" }, { h: "Views", k: "count", n: 1 }, { h: "Unique", k: "uniques", n: 1 }], g.traffic.paths) + '</div></div>');
    // platform
    for (const envName of ["production", "sandbox"]) {
      const p = d.platform[envName];
      if (!p.configured) { out.push(unconf("Platform " + envName, p.why)); continue; }
      if (p.error) { out.push(unconf("Platform " + envName, p.error)); continue; }
      out.push('<div class="row"><div class="card"><h2>' + envName + ' tenants</h2><div class="kpi">' + n(p.tenants) + '</div><div class="sub">' + n(p.tenantsRecent) + ' new in ' + d.days + 'd, ' + n(p.activeKeys) + ' active keys</div></div><div class="card"><h2>' + envName + ' identities</h2><div class="kpi">' + n(p.identities) + '</div></div><div class="card"><h2>' + envName + ' projections (' + d.days + 'd)</h2><div class="kpi">' + n(p.projections) + '</div>' + spark(p.byDay, "projections") + '</div><div class="card"><h2>' + envName + ' audit events (' + d.days + 'd)</h2><div class="kpi">' + n(p.events) + '</div>' + spark(p.byDay, "events") + '</div><div class="card"><h2>' + envName + ' runs (' + d.days + 'd)</h2><div class="kpi">' + n(Object.values(p.runs).reduce((a, b) => a + b, 0)) + '</div><div class="sub">' + esc(Object.entries(p.runs).map(([k, v]) => k + " " + v).join(", ") || "none") + '</div></div></div>');
      out.push('<div class="card"><h2>' + envName + ' newest tenants</h2>' + table([{ h: "Created", f: (r) => esc(String(r.createdAt).slice(0, 16).replace("T", " ")) }, { h: "Name", k: "name" }, { h: "Contact", f: (r) => esc(r.contact || "") }, { h: "Self-serve", f: (r) => r.selfServe ? "yes" : "" }, { h: "Id", f: (r) => '<span class="mono">' + esc(r.id) + '</span>' }], p.recentTenants) + '</div>');
    }
    // intake
    const q = d.intake;
    if (!q.configured) out.push(unconf("Contact Sales intake", q.why));
    else if (q.error) out.push(unconf("Contact Sales intake", q.error));
    else out.push('<div class="row"><div class="card"><h2>Inquiries (' + d.days + 'd)</h2><div class="kpi">' + n(q.recent) + '</div><div class="sub">' + n(q.total) + ' all time: ' + esc(Object.entries(q.byStatus).map(([k, v]) => k + " " + v).join(", ") || "none") + '</div>' + spark(q.byDay, "n") + '</div></div>' +
      '<div class="card"><h2>Latest inquiries</h2>' + table([{ h: "Received", f: (r) => esc(String(r.received_at).slice(0, 16).replace("T", " ")) }, { h: "Who", f: (r) => esc(r.first_name + " " + r.last_name) + '<br><span class="sub">' + esc(r.title || "") + ', ' + esc(r.company) + '</span>' }, { h: "Email", f: (r) => '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' }, { h: "Region / size", f: (r) => esc((r.region || "") + " / " + (r.company_size || "")) }, { h: "Interests", f: (r) => esc((r.interests || []).join(", ")) }, { h: "Message", f: (r) => esc(r.message) }, { h: "Status", f: (r) => '<select data-id="' + esc(r.id) + '" class="st">' + ["new", "contacted", "qualified", "closed"].map((s) => '<option' + (s === r.status ? " selected" : "") + '>' + s + '</option>').join("") + '</select>' }, { h: "Ref", f: (r) => '<span class="mono">' + esc(r.reference) + '</span>' }], q.latest) + '</div>');
    // npm
    if (!d.npm.configured) out.push(unconf("npm downloads", d.npm.why)); else if (d.npm.error) out.push(unconf("npm downloads", d.npm.error)); else out.push('<div class="row"><div class="card"><h2>npm downloads, last week</h2><div class="kpi">' + n(d.npm.lastWeek) + '</div><div class="sub">' + esc(d.npm.package) + '</div>' + spark(d.npm.daily, "downloads") + '</div></div>');
    out.push('<div class="card" id="mentions"><h2>Mentions</h2><div class="note">Loading</div></div>');
    $("#main").innerHTML = out.join("");
    document.querySelectorAll("select.st").forEach((s) => s.addEventListener("change", async () => { const r = await fetch("/api/inquiry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.dataset.id, status: s.value }) }); if (!r.ok) alert("Could not update"); }));
    loadMentions(); loadApps(); loadBilling();
  }
  /* ---------------- billing: the catalog in Finix ---------------- */
  async function loadBilling() {
    const box = $("#billing"); if (!box) return;
    try {
      const r = await fetch("/api/billing"); const d = await r.json(); if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
      if (!d.configured) { box.innerHTML = '<h2>Billing (Finix)</h2><div class="note">Not configured: ' + esc(d.why) + '</div>' + catalogTable(d.catalog, null); box.classList.add("unconf"); return; }
      if (d.error) { box.innerHTML = '<h2>Billing (Finix, ' + esc(d.env) + ')</h2><div class="note">Finix answered with an error: ' + esc(d.error) + '</div>'; return; }
      const totalMrr = Object.values(d.apps).reduce((a, x) => a + (x.mrr_cents || 0), 0);
      const missing = Object.values(d.apps).reduce((a, x) => a + x.missing, 0);
      const subs = Object.values(d.apps).reduce((a, x) => a + x.subscriptions.length, 0);
      box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h2 style="margin:0">Billing (Finix, ' + esc(d.env) + ')</h2><div><button id="syncplans" class="p"' + (missing ? "" : " disabled") + '>Create ' + missing + ' missing plan' + (missing === 1 ? "" : "s") + ' in Finix</button></div></div>' +
        '<div class="row" style="margin:8px 0"><div class="card"><h2>MRR on Finix subscriptions</h2><div class="kpi">' + money(totalMrr) + '</div><div class="sub">' + n(subs) + ' subscriptions matched to applications, ' + n(d.unassigned.subscriptions) + ' not matched, ' + n(d.unassigned.transfers) + ' transfers without an app tag</div></div>' +
        '<div class="card"><h2>Merchant</h2><div class="mono">' + esc(d.merchant || "none") + '</div><div class="sub">' + n(d.finixPlans.length) + ' plans on the account</div></div></div>' + catalogTable(d.catalog, d.apps);
      const b = $("#syncplans"); if (b) b.addEventListener("click", async () => { if (!confirm("Create the missing catalog plans in Finix " + d.env + "? Existing plans are never changed.")) return; b.disabled = true; const r2 = await fetch("/api/billing/sync", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); const j = await r2.json(); alert(r2.ok ? ("Created " + j.created.length + ", existing " + j.existing.length + (j.failed.length ? ", failed " + j.failed.length + ": " + j.failed.map((f) => f.app + "/" + f.tier + " " + f.error).join("; ") : "")) : (j.error || "failed")); loadBilling(); });
      document.querySelectorAll("button.cancelsub").forEach((el) => el.addEventListener("click", async () => { if (!confirm("Cancel subscription " + el.dataset.id + " in Finix? The customer keeps access until their application reads the cancellation.")) return; const r2 = await fetch("/api/billing/subscriptions/" + encodeURIComponent(el.dataset.id) + "/cancel", { method: "POST" }); const j = await r2.json(); alert(r2.ok ? "Now " + j.status : (j.error || "failed")); loadBilling(); }));
    } catch (e) { box.innerHTML = '<h2>Billing</h2><div class="note">Unavailable: ' + esc(e.message) + '</div>'; }
  }
  function catalogTable(catalog, apps) {
    const rows = [];
    for (const [id, cat] of Object.entries(catalog)) {
      const a = (appsCache || []).find((x) => x.id === id); const live = apps ? apps[id] : null;
      const plans = cat.plans.map((p) => { const f = live ? live.plans.find((x) => x.tier === p.tier) : null; return '<span class="tag' + (f ? (f.in_finix ? " ok" : " warn") : "") + '" title="' + esc(p.description) + '">' + esc(p.name) + ' ' + (p.amount_cents ? money(p.amount_cents) + '/mo' : 'no monthly') + (f && f.in_finix ? '' : (apps ? ' · not in Finix' : '')) + '</span>'; }).join(" ");
      const meters = cat.meters.map((m) => esc(m.name) + " $" + m.usd_per_unit + "/" + esc(m.unit)).join(", ");
      const subs = live ? live.subscriptions : [];
      rows.push('<tr><td><b>' + esc(a ? a.name : id) + '</b><br><span class="sub">' + esc(cat.model) + (cat.note ? ' · ' + esc(cat.note) : '') + '</span></td><td>' + (plans || '<span class="sub">none</span>') + '</td><td><span class="sub">' + (meters || 'none') + '</span></td><td class="n">' + (live ? money(live.mrr_cents) : '') + '</td><td>' + (subs.length ? subs.slice(0, 8).map((s) => '<div><span class="tag ' + (s.status === "active" ? "ok" : (s.status === "canceled" ? "bad" : "")) + '">' + esc(s.status) + '</span> ' + esc(s.plan || s.plan_id || "direct") + ' ' + money(s.amount_cents) + ' <span class="sub">' + esc(s.email || s.customer || "") + (s.next_billing ? ' · next ' + esc(s.next_billing) : '') + '</span> ' + (s.status === "active" || s.status === "trialing" ? '<button class="cancelsub" data-id="' + esc(s.id) + '">Cancel</button>' : '') + '</div>').join("") + (subs.length > 8 ? '<div class="sub">and ' + (subs.length - 8) + ' more</div>' : '') : '<span class="sub">' + (apps ? 'none' : '') + '</span>') + '</td></tr>');
    }
    return '<table><thead><tr><th>Application</th><th>Plans (catalog, approved Oct 16)</th><th>Metered</th><th class="n">MRR</th><th>Subscriptions in Finix</th></tr></thead><tbody>' + rows.join("") + '</tbody></table>';
  }
  /* ---------------- applications: the portfolio ---------------- */
  let appsCache = null; const openApp = { id: null, tab: "customers", customer: null, q: "" };
  const when = (v) => v ? esc(String(v).slice(0, 16).replace("T", " ")) : '<span class="sub">never</span>';
  const money = (c) => (c === null || c === undefined) ? "n/a" : "$" + (Number(c) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  async function loadApps() {
    try {
      const r = await fetch("/api/apps"); if (!r.ok) throw new Error("HTTP " + r.status);
      appsCache = (await r.json()).apps; renderApps();
    } catch (e) { $("#apps").innerHTML = '<h2>Applications</h2><div class="note">Unavailable: ' + esc(e.message) + '</div>'; }
  }
  function renderApps() {
    const apps = appsCache || [];
    const rows = apps.map((a) => {
      const h = a.health || {}; const st = h.ok ? '<span class="tag ok">up</span>' : '<span class="tag bad">' + esc(h.error || ("HTTP " + h.status)) + '</span>';
      const sm = a.summary || {};
      const plans = (sm.plans || []).map((p) => esc(p.plan || "none") + " " + n(p.n)).join(", ");
      const store = a.configured ? '<span class="tag ok">' + esc(a.store) + '</span>' : '<span class="tag warn" title="' + esc(a.why || "") + '">' + esc(a.store ? "store not bound" : "no store") + '</span>';
      const ing = a.ingest && !a.ingest.error ? n(a.ingest.logins_7d) + " in / " + n(a.ingest.logouts_7d) + " out" : "n/a";
      return '<tr class="app" data-id="' + esc(a.id) + '" style="cursor:pointer"><td><b>' + esc(a.name) + '</b><br><span class="sub">' + esc(a.domain) + ' · ' + esc(a.kind) + '</span></td><td>' + st + ' <span class="sub">' + (h.ms || "") + ' ms' + (h.note ? ', ' + esc(h.note) : '') + '</span></td><td>' + store + '</td><td class="n">' + n(sm.customers) + '</td><td class="n">' + n(sm.signed_in ?? sm.active_subscriptions ?? sm.active) + '</td><td>' + (plans || '<span class="sub">n/a</span>') + '</td><td class="n">' + money(sm.mrr_cents ?? sm.paid_cents ?? sm.gas_cents) + '</td><td>' + ing + '</td></tr>';
    }).join("");
    $("#apps").innerHTML = '<h2>Applications (' + apps.length + ')</h2><div class="sub" style="margin-bottom:8px">Every row reads the application’s own store. Click a row to manage its customers, sessions, usage and plans. Logins and logouts posted to /ingest are counted in the last column.</div>' +
      '<table><thead><tr><th>Application</th><th>Health</th><th>Store</th><th class="n">Customers</th><th class="n">Active</th><th>Plans</th><th class="n">Revenue</th><th>Ingest 7d</th></tr></thead><tbody>' + rows + '</tbody></table><div id="appdetail"></div>';
    document.querySelectorAll("tr.app").forEach((tr) => tr.addEventListener("click", () => { openApp.id = tr.dataset.id; openApp.customer = null; openApp.tab = "customers"; renderAppDetail(); }));
    if (openApp.id) renderAppDetail();
  }
  async function renderAppDetail() {
    const a = (appsCache || []).find((x) => x.id === openApp.id); if (!a) return;
    const box = $("#appdetail"); const tabs = ["customers", "sessions", "activity", "usage", "subscriptions", "messages", "plans", "marketing"];
    box.innerHTML = '<div class="card" style="margin-top:12px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h2 style="margin:0">' + esc(a.name) + ' <span class="sub">' + esc(a.domain) + '</span></h2><div>' +
      tabs.map((t) => '<button class="tab' + (t === openApp.tab ? ' p' : '') + '" data-tab="' + t + '">' + t + '</button>').join(" ") + ' <button id="appclose">Close</button></div></div>' +
      (a.configured ? '<div class="sub">' + esc(a.describe) + '</div>' : '<div class="note">' + esc(a.why || "") + '</div>') +
      '<div id="appbody" style="margin-top:10px"><div class="note">Loading</div></div><div id="custbody"></div></div>';
    box.querySelectorAll("button.tab").forEach((b) => b.addEventListener("click", () => { openApp.tab = b.dataset.tab; renderAppDetail(); }));
    $("#appclose").addEventListener("click", () => { openApp.id = null; box.innerHTML = ""; });
    if (openApp.tab === "marketing") { renderMarketing(a); return; }
    if (!a.configured) { $("#appbody").innerHTML = '<div class="note">Nothing to manage until a store is bound. Health is checked every refresh' + (a.ingest && a.ingest.events_7d ? '; ' + n(a.ingest.events_7d) + ' events arrived through /ingest in the last 7 days.' : '.') + '</div>'; return; }
    try {
      const r = await fetch("/api/apps/" + a.id + "/" + openApp.tab + "?limit=200&days=90" + (openApp.q ? "&q=" + encodeURIComponent(openApp.q) : "")); const d = await r.json();
      if (!r.ok) { $("#appbody").innerHTML = '<div class="note">' + esc(d.error || ("HTTP " + r.status)) + '</div>'; return; }
      const rows = d.rows || [];
      let html = "";
      if (openApp.tab === "customers") {
        html = '<div style="display:flex;gap:8px;margin-bottom:8px"><input id="custq" placeholder="Search email, name, company" value="' + esc(openApp.q) + '" style="font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--hair);border-radius:8px;padding:6px 10px;min-width:260px"><button id="custgo">Search</button></div>' +
          (rows.length ? table([{ h: "Customer", f: (c) => '<a href="#" class="cust" data-id="' + esc(c.id) + '"><b>' + esc(c.name || c.email || c.id) + '</b></a><br><span class="sub">' + esc(c.email || "") + (c.org ? " · " + esc(c.org) : "") + '</span>' }, { h: "Plan", f: (c) => '<span class="tag">' + esc(c.plan || "none") + '</span>' }, { h: "Status", f: (c) => esc(c.status || "") }, { h: "MRR", f: (c) => money(c.mrr_cents), n: 1 }, { h: "Since", f: (c) => when(c.created_at) }, { h: "Last seen", f: (c) => when(c.last_seen_at) }, { h: "Detail", f: (c) => '<span class="sub">' + esc(Object.entries(c.external || {}).filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false).map(([k, v]) => k + ": " + (Array.isArray(v) ? v.join("/") : v)).join(", ")) + '</span>' }], rows) : '<div class="note">No customers match.</div>');
      } else if (openApp.tab === "sessions") {
        html = d.kept === false ? '<div class="note">' + esc(d.why) + '</div>' : (rows.length ? table([{ h: "Who", f: (s) => esc(s.email || s.customer_id) }, { h: "Signed in", f: (s) => when(s.started_at) }, { h: "Last seen", f: (s) => when(s.last_seen_at) }, { h: "Signed out", f: (s) => s.ended_at ? when(s.ended_at) + ' <span class="sub">' + esc(s.end_reason || "") + '</span>' : '<span class="tag ok">open</span>' }, { h: "From", f: (s) => '<span class="mono">' + esc(s.ip || "") + '</span><br><span class="sub">' + esc((s.user_agent || "").slice(0, 60)) + '</span>' }], rows) : '<div class="note">No sessions recorded.</div>');
        if (d.ingest && d.ingest.length) html += '<h3>Posted through /ingest</h3>' + table([{ h: "When", f: (e) => when(e.at) }, { h: "Who", f: (e) => esc(e.email || e.customer_ref || "") }, { h: "Kind", k: "kind" }, { h: "Meter", f: (e) => esc(e.meter || "") + (e.qty !== null ? " × " + n(e.qty) : "") }, { h: "From", f: (e) => '<span class="mono">' + esc(e.ip || "") + '</span>' }], d.ingest);
      } else if (openApp.tab === "activity") {
        html = rows.length ? table([{ h: "When", f: (e) => when(e.at) }, { h: "Who", f: (e) => esc(e.email || e.account_id || e.acct_id || "") }, { h: "Kind", k: "kind" }, { h: "Detail", f: (e) => '<span class="sub">' + esc(String(e.detail || "").slice(0, 160)) + '</span>' }], rows) : '<div class="note">No activity recorded.</div>';
      } else if (openApp.tab === "usage") {
        html = rows.length ? table([{ h: "Period", k: "period" }, { h: "Customer", f: (u) => '<span class="mono">' + esc(u.customer_id) + '</span>' }, { h: "Meter", k: "meter" }, { h: "Quantity", f: (u) => n(u.qty), n: 1 }, { h: "Tokens in / out", f: (u) => (u.tokens_in != null ? n(u.tokens_in) + " / " + n(u.tokens_out) : ""), n: 1 }, { h: "Cost", f: (u) => u.cost_usd != null ? "$" + Number(u.cost_usd).toFixed(4) : "", n: 1 }], rows) : '<div class="note">No metered usage in the window.</div>';
      } else if (openApp.tab === "subscriptions") {
        html = rows.length ? table([{ h: "Who", f: (s) => esc(s.email || s.user_id) }, { h: "Plan", k: "plan_key" }, { h: "Status", k: "status" }, { h: "Provider", f: (s) => esc(s.provider || "") + (s.billing_cycle ? " · " + esc(s.billing_cycle) : "") }, { h: "Started", f: (s) => when(s.started_at) }, { h: "Next billing", f: (s) => when(s.next_billing_at) }, { h: "Cancelled", f: (s) => when(s.cancelled_at) }], rows) : '<div class="note">No subscriptions recorded by the application.</div>';
      } else if (openApp.tab === "messages") {
        html = rows.length ? table([{ h: "When", f: (m) => when(m.at) }, { h: "Customer", k: "customer" }, { h: "Direction", f: (m) => esc(m.direction + " " + m.kind) }, { h: "Subject", k: "subject" }, { h: "To", k: "to_email" }, { h: "Status", f: (m) => esc(m.status) + (m.provider ? " via " + esc(m.provider) : "") }], rows) : '<div class="note">No messages recorded by the application.</div>';
      } else if (openApp.tab === "plans") {
        html = rows.length ? table([{ h: "Plan", k: "plan" }, { h: "Customers", f: (p) => n(p.n), n: 1 }, { h: "MRR", f: (p) => p.mrr_cents != null ? money(p.mrr_cents) : (p.mrr != null ? "$" + Number(p.mrr).toFixed(2) : ""), n: 1 }], rows) : '<div class="note">No plan column in this store.</div>';
      }
      $("#appbody").innerHTML = html;
      const qi = $("#custq"); if (qi) { $("#custgo").addEventListener("click", () => { openApp.q = qi.value.trim(); renderAppDetail(); }); qi.addEventListener("keydown", (e) => { if (e.key === "Enter") { openApp.q = qi.value.trim(); renderAppDetail(); } }); }
      document.querySelectorAll("a.cust").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); openApp.customer = el.dataset.id; renderCustomer(); }));
      if (openApp.customer) renderCustomer();
    } catch (e) { $("#appbody").innerHTML = '<div class="note">Could not load: ' + esc(e.message) + '</div>'; }
  }
  /* ---------------- marketing: the agent's work for one application ---------------- */
  async function renderMarketing(a) {
    const body = $("#appbody"); body.innerHTML = '<div class="note">Loading</div>';
    try {
      const r = await fetch("/api/apps/" + a.id + "/marketing"); const d = await r.json(); if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
      const integ = Array.isArray(d.postiz.integrations) ? d.postiz.integrations.filter((i) => !i.disabled) : [];
      const sev = (s) => '<span class="tag ' + (s === "critical" ? "bad" : (s === "warn" ? "warn" : "")) + '">' + esc(s) + '</span>';
      let h = '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><div class="sub">' + (d.brief ? esc(d.brief.audience) + ' · ' + esc(d.brief.pitch) : '') + '</div><button id="runagent" class="p">Run the agent now</button></div>' +
        '<div class="row" style="margin:8px 0">' +
        '<div class="card"><h2>Site score</h2><div class="kpi">' + (d.seo ? d.seo.score + '<span class="sub">/100</span>' : 'n/a') + '</div><div class="sub">' + (d.seo ? 'checked ' + when(d.seo.checked_at) : 'not audited yet') + '</div></div>' +
        '<div class="card"><h2>Channels (Postiz)</h2><div>' + (d.postiz.configured ? (integ.length ? integ.map((i) => '<span class="tag ok">' + esc(i.identifier) + (i.name ? ' · ' + esc(i.name) : '') + '</span>').join(" ") : (d.postiz.integrations && d.postiz.integrations.error ? '<span class="tag bad">' + esc(d.postiz.integrations.error) + '</span>' : '<span class="sub">none connected</span>')) : '<span class="tag warn">POSTIZ_API_KEY not set</span>') + '</div><div class="sub">model ' + (d.model ? 'on' : 'off (ANTHROPIC_API_KEY)') + ' · search ' + (d.search ? 'on' : 'off (BRAVE_API_KEY)') + '</div></div>' +
        '<div class="card"><h2>Queue</h2><div class="kpi">' + d.content.filter((c) => c.status === "draft").length + '</div><div class="sub">drafts awaiting approval · ' + d.content.filter((c) => c.status === "scheduled").length + ' scheduled · ' + d.leads.filter((l) => l.status === "new").length + ' new leads</div></div></div>';
      if (d.insights.length) h += '<h3>Insights</h3>' + d.insights.slice(0, 3).map((i) => '<div style="margin:4px 0"><span class="sub">' + when(i.at) + '</span> ' + esc(i.body) + '</div>').join("");
      if (d.seo) h += '<details open style="margin-top:10px"><summary>SEO findings (' + d.seo.findings.length + ') for ' + esc(d.seo.url) + '</summary>' + (d.seo.findings.length ? table([{ h: "Severity", f: (f) => sev(f.severity) }, { h: "Check", k: "check" }, { h: "Found", f: (f) => esc(f.found) }, { h: "Fix", f: (f) => esc(f.fix) }], d.seo.findings) : '<div class="note">Nothing to fix on the home page.</div>') +
        '<div class="sub" style="margin-top:6px">title: ' + esc(d.seo.facts.title || "none") + ' · description: ' + esc((d.seo.facts.description || "none").slice(0, 160)) + ' · JSON-LD: ' + esc((d.seo.facts.jsonld_types || []).join(", ") || "none") + ' · sitemap entries: ' + esc(d.seo.facts.sitemap ?? "none") + ' · llms.txt: ' + (d.seo.facts.llms_txt ? 'yes' : 'no') + '</div></details>';
      const drafts = d.content.filter((c) => c.status === "draft" || c.status === "approved");
      h += '<details open style="margin-top:10px"><summary>Content queue (' + drafts.length + ' to review, ' + d.content.length + ' total)</summary>' + (d.content.length ? d.content.slice(0, 40).map((c) => '<div class="card" style="margin:8px 0"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><span class="tag">' + esc(c.channel) + '</span> <span class="tag ' + (c.status === "scheduled" ? "ok" : (c.status === "rejected" ? "bad" : (c.status === "approved" ? "warn" : ""))) + '">' + esc(c.status) + '</span> <span class="sub">' + when(c.created_at) + (c.scheduled_for ? ' · scheduled ' + when(c.scheduled_for) : '') + (c.decided_by ? ' · ' + esc(c.decided_by) : '') + (c.error ? ' · ' + esc(c.error) : '') + '</span></div>' +
        (c.status === "draft" || c.status === "approved" ? '<div style="display:flex;gap:6px;flex-wrap:wrap"><select class="ch" data-id="' + esc(c.id) + '">' + (integ.length ? integ.map((i) => '<option value="' + esc(i.id) + '"' + (i.id === c.integration_id || (!c.integration_id && i.identifier === c.channel) ? ' selected' : '') + '>' + esc(i.identifier) + (i.name ? ' · ' + esc(i.name) : '') + '</option>').join("") : '<option value="">no Postiz channel</option>') + '</select><input type="datetime-local" class="wh" data-id="' + esc(c.id) + '" style="font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--hair);border-radius:8px;padding:4px 8px"><button class="approve p" data-id="' + esc(c.id) + '">Approve and schedule</button><button class="reject" data-id="' + esc(c.id) + '">Reject</button></div>' : '') + '</div>' +
        (c.title ? '<div><b>' + esc(c.title) + '</b></div>' : '') + '<div style="white-space:pre-wrap;margin-top:6px">' + esc(c.body) + '</div>' + (c.hashtags.length ? '<div class="sub">' + esc(c.hashtags.map((t) => "#" + t.replace(/^#/, "")).join(" ")) + '</div>' : '') + '</div>').join("") : '<div class="note">No drafts yet. Run the agent.</div>') + '</details>';
      h += '<details style="margin-top:10px"><summary>Leads (' + d.leads.length + ')</summary>' + (d.leads.length ? table([{ h: "Prospect", f: (l) => '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.name) + '</a><br><span class="sub">' + esc(l.org || "") + '</span>' }, { h: "From", f: (l) => esc(l.source) + ' <span class="sub">' + esc(l.query || "") + '</span>' }, { h: "Note", f: (l) => '<span class="sub">' + esc(l.note || "") + '</span>' }, { h: "Status", f: (l) => '<select class="lead" data-id="' + esc(l.id) + '">' + ["new", "contacted", "qualified", "dropped"].map((s) => '<option' + (s === l.status ? ' selected' : '') + '>' + s + '</option>').join("") + '</select>' }], d.leads) : '<div class="note">' + (d.search ? 'No leads yet.' : 'Lead sourcing needs BRAVE_API_KEY on the ops Worker.') + '</div>') + '</details>';
      h += '<details style="margin-top:10px"><summary>Agent runs (' + d.runs.length + ')</summary>' + (d.runs.length ? table([{ h: "Started", f: (x) => when(x.started_at) }, { h: "Trigger", k: "trigger" }, { h: "Status", k: "status" }, { h: "Summary", f: (x) => '<span class="sub">' + esc(x.summary || "") + '</span>' }], d.runs) : '<div class="note">Never run. The schedule runs one application an hour.</div>') + '</details>';
      body.innerHTML = h;
      $("#runagent").addEventListener("click", async () => { $("#runagent").disabled = true; $("#runagent").textContent = "Running"; const r2 = await fetch("/api/apps/" + a.id + "/marketing/run", { method: "POST" }); const j = await r2.json(); if (!r2.ok) alert(j.error || "failed"); renderMarketing(a); });
      body.querySelectorAll("button.approve").forEach((b) => b.addEventListener("click", async () => { const id = b.dataset.id; const ch = body.querySelector('select.ch[data-id="' + id + '"]'); const wh = body.querySelector('input.wh[data-id="' + id + '"]'); const r2 = await fetch("/api/apps/" + a.id + "/marketing/content/" + encodeURIComponent(id), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve", integrationId: ch ? ch.value : null, when: wh && wh.value ? new Date(wh.value).toISOString() : null }) }); const j = await r2.json(); if (!r2.ok) alert(j.error || "failed"); renderMarketing(a); }));
      body.querySelectorAll("button.reject").forEach((b) => b.addEventListener("click", async () => { const r2 = await fetch("/api/apps/" + a.id + "/marketing/content/" + encodeURIComponent(b.dataset.id), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reject" }) }); if (!r2.ok) alert("failed"); renderMarketing(a); }));
      body.querySelectorAll("select.lead").forEach((s) => s.addEventListener("change", async () => { const r2 = await fetch("/api/apps/" + a.id + "/marketing/lead/" + encodeURIComponent(s.dataset.id), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: s.value }) }); if (!r2.ok) alert("failed"); }));
    } catch (e) { body.innerHTML = '<div class="note">Could not load: ' + esc(e.message) + '</div>'; }
  }
  async function renderCustomer() {
    const a = (appsCache || []).find((x) => x.id === openApp.id); if (!a || !openApp.customer) return;
    const box = $("#custbody"); box.innerHTML = '<div class="note">Loading customer</div>';
    try {
      const r = await fetch("/api/apps/" + a.id + "/customer/" + encodeURIComponent(openApp.customer) + "?days=365"); const d = await r.json();
      if (!r.ok) { box.innerHTML = '<div class="note">' + esc(d.error) + '</div>'; return; }
      const c = d.customer_row || {};
      let h = '<div class="card" style="margin-top:12px;border-color:var(--acc)"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><h2 style="margin:0">' + esc(c.name || c.email || openApp.customer) + ' <span class="sub">' + esc(c.email || "") + (c.org ? " · " + esc(c.org) : "") + '</span></h2><button id="custclose">Close</button></div>' +
        '<div class="row" style="margin-top:8px"><div class="card"><h2>Plan</h2><div class="kpi">' + esc(c.plan || "none") + '</div><div class="sub">' + esc(c.status || "") + (c.mrr_cents != null ? " · " + money(c.mrr_cents) + " MRR" : "") + '</div>' +
        '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><input id="planv" placeholder="new plan id" style="font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--hair);border-radius:8px;padding:6px 10px;width:140px"><input id="planr" placeholder="reason" style="font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--hair);border-radius:8px;padding:6px 10px;flex:1;min-width:140px"><button id="plango" class="p">Change plan</button></div></div>' +
        '<div class="card"><h2>Since / last seen</h2><div>' + when(c.created_at) + '<br>' + when(c.last_seen_at) + '</div></div>' +
        '<div class="card"><h2>Record</h2><div class="sub">' + esc(Object.entries(c.external || {}).filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false).map(([k, v]) => k + ": " + (Array.isArray(v) ? v.join("/") : v)).join(" · ")) + '</div></div></div>';
      const sec = (title, inner) => '<details open style="margin-top:10px"><summary>' + esc(title) + '</summary>' + inner + '</details>';
      if (d.sessions) h += sec("Sessions (" + d.sessions.length + ")", d.sessions.length ? table([{ h: "Signed in", f: (s) => when(s.started_at) }, { h: "Last seen", f: (s) => when(s.last_seen_at) }, { h: "Signed out", f: (s) => s.ended_at ? when(s.ended_at) + " " + esc(s.end_reason || "") : '<span class="tag ok">open</span>' }, { h: "From", f: (s) => '<span class="mono">' + esc(s.ip || "") + '</span>' }], d.sessions) : '<div class="note">None.</div>');
      if (d.ingested && d.ingested.length) h += sec("Events posted by the application (" + d.ingested.length + ")", table([{ h: "When", f: (e) => when(e.at) }, { h: "Kind", k: "kind" }, { h: "Meter", f: (e) => esc(e.meter || "") + (e.qty !== null ? " × " + n(e.qty) : "") }, { h: "From", f: (e) => '<span class="mono">' + esc(e.ip || "") + '</span>' }], d.ingested));
      if (d.activity) h += sec("Activity (" + d.activity.length + ")", d.activity.length ? table([{ h: "When", f: (e) => when(e.at) }, { h: "Kind", k: "kind" }, { h: "Detail", f: (e) => '<span class="sub">' + esc(String(e.detail || "").slice(0, 200)) + '</span>' }], d.activity) : '<div class="note">None.</div>');
      if (d.usage) h += sec("Usage (" + d.usage.length + ")", d.usage.length ? table([{ h: "Period", k: "period" }, { h: "Meter", k: "meter" }, { h: "Quantity", f: (u) => n(u.qty), n: 1 }, { h: "Cost", f: (u) => u.cost_usd != null ? "$" + Number(u.cost_usd).toFixed(4) : "", n: 1 }], d.usage) : '<div class="note">None.</div>');
      if (d.subscriptions) h += sec("Subscriptions (" + d.subscriptions.length + ")", d.subscriptions.length ? table([{ h: "Plan", k: "plan_key" }, { h: "Status", k: "status" }, { h: "Provider", k: "provider" }, { h: "Started", f: (s) => when(s.started_at) }, { h: "Next billing", f: (s) => when(s.next_billing_at) }], d.subscriptions) : '<div class="note">None.</div>');
      if (d.messages) h += sec("Messages in the application (" + d.messages.length + ")", d.messages.length ? table([{ h: "When", f: (m) => when(m.at) }, { h: "Direction", f: (m) => esc(m.direction + " " + m.kind) }, { h: "Subject", k: "subject" }, { h: "Status", k: "status" }], d.messages) : '<div class="note">None.</div>');
      h += sec("Plan changes from this console (" + (d.plan_changes || []).length + ")", (d.plan_changes || []).length ? table([{ h: "When", f: (p) => when(p.at) }, { h: "From", k: "from_plan" }, { h: "To", k: "to_plan" }, { h: "Reason", k: "reason" }, { h: "By", k: "by_email" }], d.plan_changes) : '<div class="note">None.</div>');
      h += sec("Notes (" + (d.notes || []).length + ")", ((d.notes || []).map((x) => '<div style="margin:6px 0"><span class="sub">' + when(x.at) + ' ' + esc(x.by_email) + '</span><br>' + esc(x.body) + '</div>').join("") || '<div class="note">None.</div>') + '<textarea id="notev" rows="2" placeholder="Add a note"></textarea><button id="notego" style="margin-top:6px">Save note</button>');
      h += '</div>';
      box.innerHTML = h;
      $("#custclose").addEventListener("click", () => { openApp.customer = null; box.innerHTML = ""; });
      $("#plango").addEventListener("click", async () => { const plan = $("#planv").value.trim(); if (!plan) return; if (!confirm("Change plan of " + (c.email || openApp.customer) + " to " + plan + "? This writes to " + a.name + "'s own store.")) return; const r2 = await fetch("/api/apps/" + a.id + "/plan/" + encodeURIComponent(openApp.customer), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, reason: $("#planr").value }) }); const j = await r2.json(); if (!r2.ok) alert(j.error || "Could not change plan"); else { renderAppDetail(); } });
      $("#notego").addEventListener("click", async () => { const body = $("#notev").value.trim(); if (!body) return; const r2 = await fetch("/api/apps/" + a.id + "/note/" + encodeURIComponent(openApp.customer), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) }); if (!r2.ok) alert("Could not save"); else renderCustomer(); });
    } catch (e) { box.innerHTML = '<div class="note">Could not load: ' + esc(e.message) + '</div>'; }
  }
  async function loadMentions() {
    try {
      const m = await (await fetch("/api/mentions")).json();
      const blocks = [];
      if (m.hackerNews?.items) blocks.push('<h3>Hacker News (first-page partial count: ' + n(m.hackerNews.total) + ')</h3>' + (m.hackerNews.items.length ? table([{ h: "When", f: (r) => esc(String(r.at).slice(0, 10)) }, { h: "Title", f: (r) => '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.title || r.url) + '</a>' }, { h: "Points", k: "points", n: 1 }, { h: "Comments", k: "comments", n: 1 }], m.hackerNews.items) : '<div class="note">No mentions yet.</div>')); else blocks.push('<div class="note">Hacker News: ' + esc(m.hackerNews?.error || "unavailable") + '</div>');
      if (m.reddit?.items) blocks.push('<h3>Reddit</h3>' + (m.reddit.items.length ? table([{ h: "When", f: (r) => esc(String(r.at).slice(0, 10)) }, { h: "Title", f: (r) => '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.title) + '</a> <span class="sub">r/' + esc(r.subreddit) + '</span>' }, { h: "Score", k: "score", n: 1 }], m.reddit.items) : '<div class="note">No mentions yet.</div>')); else blocks.push('<h3>Reddit</h3><div class="note">' + esc(m.reddit?.error || "unavailable") + (m.reddit?.searchUrl ? ' <a href="' + esc(m.reddit.searchUrl) + '" target="_blank" rel="noopener">Search Reddit in your browser</a>' : '') + '</div>');
      if (m.githubRepos?.items) blocks.push('<h3>Other repositories mentioning it (' + n(m.githubRepos.total) + ')</h3>' + (m.githubRepos.note ? '<div class="sub">' + esc(m.githubRepos.note) + '</div>' : '') + (m.githubRepos.items.length ? table([{ h: "Repository", f: (r) => '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.name) + '</a>' }, { h: "Stars", k: "stars", n: 1 }], m.githubRepos.items) : '<div class="note">None yet.</div>')); else if (m.githubRepos?.error) blocks.push('<h3>Other repositories mentioning it</h3><div class="note">GitHub: ' + esc(m.githubRepos.error) + '</div>');
      $("#mentions").innerHTML = '<h2>Mentions of ' + esc(m.query) + '</h2>' + blocks.join("");
    } catch (e) { $("#mentions").innerHTML = '<h2>Mentions</h2><div class="note">Unavailable: ' + esc(e.message) + '</div>'; }
  }
  async function load() {
    $("#stamp").textContent = "Loading";
    try {
      const r = await fetch("/api/overview?days=" + $("#days").value); if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json(); render(d); $("#stamp").textContent = "Updated " + new Date(d.generatedAt).toLocaleTimeString();
    } catch (e) { $("#main").innerHTML = '<div class="card"><div class="note">Could not load: ' + esc(e.message) + '</div></div>'; $("#stamp").textContent = ""; }
  }
  $("#refresh").addEventListener("click", load); $("#days").addEventListener("change", load);
  load(); setInterval(load, 5 * 60 * 1000);
})();
</script>
</body>
</html>`;
