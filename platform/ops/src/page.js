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
    loadMentions();
  }
  async function loadMentions() {
    try {
      const m = await (await fetch("/api/mentions")).json();
      const blocks = [];
      if (m.hackerNews?.items) blocks.push('<h3>Hacker News (' + n(m.hackerNews.total) + ')</h3>' + (m.hackerNews.items.length ? table([{ h: "When", f: (r) => esc(String(r.at).slice(0, 10)) }, { h: "Title", f: (r) => '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.title || r.url) + '</a>' }, { h: "Points", k: "points", n: 1 }, { h: "Comments", k: "comments", n: 1 }], m.hackerNews.items) : '<div class="note">No mentions yet.</div>')); else blocks.push('<div class="note">Hacker News: ' + esc(m.hackerNews?.error || "unavailable") + '</div>');
      if (m.reddit?.items) blocks.push('<h3>Reddit</h3>' + (m.reddit.items.length ? table([{ h: "When", f: (r) => esc(String(r.at).slice(0, 10)) }, { h: "Title", f: (r) => '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.title) + '</a> <span class="sub">r/' + esc(r.subreddit) + '</span>' }, { h: "Score", k: "score", n: 1 }], m.reddit.items) : '<div class="note">No mentions yet.</div>')); else blocks.push('<div class="note">Reddit: ' + esc(m.reddit?.error || "unavailable") + '</div>');
      if (m.githubRepos?.items) blocks.push('<h3>Repositories mentioning it (' + n(m.githubRepos.total) + ')</h3>' + (m.githubRepos.items.length ? table([{ h: "Repository", f: (r) => '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.name) + '</a>' }, { h: "Stars", k: "stars", n: 1 }], m.githubRepos.items) : '<div class="note">None yet.</div>'));
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
