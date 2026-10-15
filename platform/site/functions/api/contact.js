/* POST /api/contact
   Cloudflare Pages Function behind the Contact Sales form on id-me.ai.
   Writes one row to the INTAKE D1 database (table: inquiries) and returns a
   reference the person can quote. The operator console (platform/ops) reads
   the same table. No email is sent from here; a mailbox is not an API.

   Bindings (wrangler.toml): INTAKE = D1 database "igl-intake".
   Schema: platform/site/schema/intake.sql */

const MAX = { first: 80, last: 80, email: 254, company: 160, site: 300, title: 120, size: 40, region: 80, industry: 80, volume: 80, when: 80, message: 4000, page: 300 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function problem(status, title, detail, extra = {}) {
  return new Response(JSON.stringify({ type: "about:blank", title, status, detail, ...extra }), {
    status, headers: { "content-type": "application/problem+json", "cache-control": "no-store" },
  });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return problem(400, "Bad request", "Body must be JSON.", { error: "invalid JSON" }); }
  const v = {};
  for (const [k, max] of Object.entries(MAX)) {
    const raw = body[k];
    v[k] = typeof raw === "string" ? raw.trim().slice(0, max) : "";
  }
  const interests = Array.isArray(body.interests) ? body.interests.filter((x) => typeof x === "string").map((x) => x.slice(0, 60)).slice(0, 10) : [];
  const missing = ["first", "last", "email", "company", "title", "size", "region", "volume", "message"].filter((k) => !v[k]);
  if (missing.length) return problem(422, "Missing fields", `Required: ${missing.join(", ")}.`, { error: `missing ${missing.join(", ")}` });
  if (!EMAIL.test(v.email)) return problem(422, "Invalid email", "Enter a valid work email.", { error: "invalid email" });
  if (body.consent !== true) return problem(422, "Consent required", "The person must agree to be contacted.", { error: "consent required" });
  if (v.site && !/^https?:\/\//i.test(v.site)) return problem(422, "Invalid website", "Website must start with http:// or https://.", { error: "invalid site" });

  // Honeypot: real users never fill this.
  if (typeof body.website_url === "string" && body.website_url) return new Response(JSON.stringify({ ok: true, reference: "IGL-OK" }), { headers: { "content-type": "application/json" } });

  const id = crypto.randomUUID();
  const reference = "IGL-" + id.replace(/-/g, "").slice(0, 8).toUpperCase();
  const receivedAt = new Date().toISOString();
  const ip = request.headers.get("cf-connecting-ip") || "";
  const country = request.headers.get("cf-ipcountry") || "";
  const ua = (request.headers.get("user-agent") || "").slice(0, 300);

  if (!env.INTAKE) return problem(503, "Intake unavailable", "The intake database is not bound to this deployment.", { error: "intake database not configured" });
  try {
    await env.INTAKE.prepare(
      `INSERT INTO inquiries (id, reference, received_at, first_name, last_name, email, company, website, title, company_size, region, industry, interests, volume, timeline, message, page, ip, country, user_agent, status)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, 'new')`
    ).bind(id, reference, receivedAt, v.first, v.last, v.email, v.company, v.site, v.title, v.size, v.region, v.industry, JSON.stringify(interests), v.volume, v.when, v.message, v.page, ip, country, ua).run();
  } catch (err) {
    console.error("intake insert failed", err?.message);
    return problem(500, "Intake failed", "The request could not be stored.", { error: "intake write failed" });
  }
  return new Response(JSON.stringify({ ok: true, reference, receivedAt }), {
    status: 201, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function onRequest({ request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } });
  return problem(405, "Method not allowed", "Use POST.", { error: "use POST" });
}
