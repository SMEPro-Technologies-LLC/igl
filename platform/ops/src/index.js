/* IGL operator console, ops.id-me.ai. One Worker: the page at /, JSON at
   /api/*, both behind a sign-in (Cloudflare Access or the built-in
   username and password; see access.js). Reads: zone analytics for the site,
   GitHub repository metrics, the Contact Sales intake database, the platform
   API databases (production and sandbox), service health, public mentions,
   npm downloads. Writes: inquiry status and notes only. */

import { requireAccess, builtinConfigured, checkLogin, lockedOut, issueSession, sessionCookie, clearSessionCookie } from "./access.js";
import { siteTraffic, github, intake, platform, health, mentions, npm } from "./sources.js";
import { PAGE, LOGIN, SIGNOUT } from "./page.js";

const json = (b, s = 200, h = {}) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store", ...h } });
const secure = { "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "strict-transport-security": "max-age=31536000; includeSubDomains", "content-security-policy": "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'" };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") return json({ ok: true, service: "igl-ops" });
    const html = (body, status = 200, h = {}) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...secure, ...h } });
    const redirect = (to, h = {}) => new Response(null, { status: 303, headers: { location: to, "cache-control": "no-store", ...secure, ...h } });

    // Built-in sign-in pages (only when configured and Access is not in front)
    if (url.pathname === "/login" && builtinConfigured(env) && !(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD)) {
      if (request.method === "GET") {
        const m = lockedOut(request);
        return html(LOGIN.replace("__ERROR__", m ? `Too many attempts. Try again in ${m} minute${m === 1 ? "" : "s"}.` : ""));
      }
      if (request.method === "POST") {
        const form = await request.formData().catch(() => null);
        const r = await checkLogin(request, env, form?.get("username"), form?.get("password"));
        if (r.ok) return redirect("/", { "set-cookie": sessionCookie(await issueSession(env, r.email)) });
        const m = lockedOut(request);
        return html(LOGIN.replace("__ERROR__", r.locked || m ? `Too many attempts. Try again in ${m || 15} minutes.` : "That username and password do not match."), 401);
      }
    }
    if (url.pathname === "/logout" && request.method === "POST") return redirect("/login", { "set-cookie": clearSessionCookie() });

    const who = await requireAccess(request, env);
    if (who.error) {
      if (who.signin && request.method === "GET" && !url.pathname.startsWith("/api/")) return redirect("/login");
      return json({ error: who.error }, who.status, secure);
    }
    const days = Math.min(Math.max(Number(url.searchParams.get("days") || 7), 1), 90);
    try {
      if (url.pathname === "/" && request.method === "GET") return html(PAGE.replace("__WHO__", escapeHtml(who.email)).replace("__SIGNOUT__", who.mode === "builtin" ? SIGNOUT : ""));
      if (url.pathname === "/api/overview") {
        const [site, gh, inq, plat, hz, npmd] = await Promise.all([siteTraffic(env, days), github(env), intake(env, days), platform(env, days), health(env), npm(env)]);
        return json({ generatedAt: new Date().toISOString(), days, viewer: who.email, site, github: gh, intake: inq, platform: plat, health: hz, npm: npmd }, 200, secure);
      }
      if (url.pathname === "/api/mentions") return json(await mentions(env), 200, secure);
      if (url.pathname === "/api/inquiry" && request.method === "POST") {
        if (!env.INTAKE) return json({ error: "INTAKE binding missing" }, 503, secure);
        const body = await request.json().catch(() => null);
        if (!body?.id || !["new", "contacted", "qualified", "closed"].includes(body.status)) return json({ error: "id and a valid status are required" }, 422, secure);
        const notes = typeof body.notes === "string" ? body.notes.slice(0, 4000) : null;
        await env.INTAKE.prepare("UPDATE inquiries SET status = ?1, notes = COALESCE(?2, notes) WHERE id = ?3").bind(body.status, notes, body.id).run();
        return json({ ok: true }, 200, secure);
      }
      if (url.pathname === "/api/inquiry" && request.method === "GET") {
        const id = url.searchParams.get("id"); if (!id || !env.INTAKE) return json({ error: "id required" }, 422, secure);
        const row = await env.INTAKE.prepare("SELECT * FROM inquiries WHERE id = ?1").bind(id).first();
        return row ? json(row, 200, secure) : json({ error: "not found" }, 404, secure);
      }
      return json({ error: "not found" }, 404, secure);
    } catch (e) {
      console.error("ops error", e?.stack || e);
      return json({ error: "internal error" }, 500, secure);
    }
  },
};

function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
