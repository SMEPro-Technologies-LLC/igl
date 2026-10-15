/* Verify a tenant's audit chain from the platform API without trusting the service.

   Usage:
     IGL_API_BASE=https://sandbox.id-me.ai IGL_API_KEY=igl_test_… IGL_TENANT=<tenant id> node docs/examples/verify-audit-chain.mjs

   Walks GET /audit/events to the beginning, then recomputes every hash:
     eventHash = sha256(previousHash + canonical({ type: eventType, body: event without hashes }))
   with the first previousHash being 64 zeros. This is the same rule as the
   runtime's journal (src/store.js), so the chain is tamper-evident in the
   same way: any edit, insertion, deletion or reorder changes a hash. */

import { createHash } from "node:crypto";

const BASE = process.env.IGL_API_BASE || "https://sandbox.id-me.ai";
const KEY = process.env.IGL_API_KEY; const TENANT = process.env.IGL_TENANT;
if (!KEY || !TENANT) { console.error("set IGL_API_KEY and IGL_TENANT"); process.exit(2); }

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const canonical = (x) => Array.isArray(x) ? "[" + x.map(canonical).join(",") + "]" : x && typeof x === "object" ? "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}" : JSON.stringify(x === undefined ? null : x);

const items = []; let cursor = null;
for (;;) {
  const res = await fetch(`${BASE}/v1/audit/events?limit=200${cursor ? "&cursor=" + cursor : ""}`, { headers: { authorization: `Bearer ${KEY}`, "x-igl-tenant-id": TENANT } });
  if (!res.ok) { console.error(res.status, await res.text()); process.exit(1); }
  const page = await res.json(); items.push(...page.items);
  if (!page.page.hasMore) break; cursor = page.page.nextCursor;
}
items.reverse();
let prev = "0".repeat(64);
for (const [i, ev] of items.entries()) {
  if (ev.previousHash !== prev) { console.log(`BROKEN at ${i} (${ev.id}): previousHash does not link`); process.exit(1); }
  const { previousHash, eventHash, ...body } = ev;
  const expect = sha256(prev + canonical({ type: ev.eventType, body }));
  if (eventHash !== expect) { console.log(`BROKEN at ${i} (${ev.id}): event does not reproduce its hash`); process.exit(1); }
  prev = eventHash;
}
console.log(JSON.stringify({ ok: true, events: items.length, head: prev, first: items[0]?.occurredAt ?? null, last: items[items.length - 1]?.occurredAt ?? null }, null, 2));
