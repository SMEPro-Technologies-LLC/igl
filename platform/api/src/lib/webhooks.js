/* Webhook delivery. Subscriptions live in the webhooks table (managed through
   the admin surface). Each delivery is signed:
     X-IGL-Signature: t=<unix seconds>,v1=<hmac-sha256(secret, t + "." + body)>
   Three attempts with backoff, run after the response is sent. */

import { hmacHex } from "./crypto.js";
import { uuid, nowIso } from "./http.js";

export async function emit(db, ctx, tenantId, event, payload) {
  const { results } = await db.prepare("SELECT * FROM webhooks WHERE tenant_id = ?1 AND status = 'active'").bind(tenantId).all();
  const subs = results.filter((w) => { const ev = JSON.parse(w.events || "[]"); return ev.includes("*") || ev.includes(event); });
  if (!subs.length) return;
  const body = JSON.stringify({ event, tenantId, occurredAt: nowIso(), data: payload });
  for (const w of subs) {
    const id = uuid();
    await db.prepare("INSERT INTO webhook_deliveries (id, tenant_id, webhook_id, event, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(id, tenantId, w.id, event, body, nowIso()).run();
    ctx.waitUntil(deliver(db, w, id, event, body));
  }
}

async function deliver(db, w, id, event, body) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t = Math.floor(Date.now() / 1000);
    let status = 0;
    try {
      const res = await fetch(w.url, { method: "POST", headers: { "content-type": "application/json", "x-igl-event": event, "x-igl-delivery": id, "x-igl-signature": `t=${t},v1=${hmacHex(w.secret, t + "." + body)}` }, body, signal: AbortSignal.timeout(8000) });
      status = res.status;
    } catch { status = 0; }
    await db.prepare("UPDATE webhook_deliveries SET attempts = ?1, last_status = ?2, delivered_at = ?3 WHERE id = ?4").bind(attempt, status, status >= 200 && status < 300 ? nowIso() : null, id).run();
    if (status >= 200 && status < 300) return;
    await new Promise((r) => setTimeout(r, attempt * 1500));
  }
}
