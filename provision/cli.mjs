/* CLI for the provisioning service — proof path without HTTP.

     node provision/cli.mjs "Example Energy is a Texas oil and gas operator"
     node provision/cli.mjs --kind FOOTPRINT "Jane Doe is a DFIR coordinator"
     node provision/cli.mjs --auto
     node provision/cli.mjs --list */

import { provisionIdentity, listProvisioned } from "./service.mjs";

const args = process.argv.slice(2);
if (args[0] === "--list") {
  console.log(JSON.stringify(listProvisioned().map((g) => ({ slug: g.slug, kind: g.kind, boot: g.boot, results: g.results.map((r) => r.status) })), null, 2));
  process.exit(0);
}

let kind = null, auto = false;
const rest = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--kind") kind = args[++i];
  else if (args[i] === "--auto") auto = true;
  else rest.push(args[i]);
}
const description = rest.join(" ");

const { resolved, runtime } = await provisionIdentity({ description, kind, auto });
console.log(`\n[provision] ${resolved.kind} · ${resolved.name} (${resolved.actor}) · boot=${runtime.boot}`);
console.log(`[provision] attributes: ${JSON.stringify(resolved.attributes)}`);
console.log(`[provision] journal: ${runtime.journal.length} entries ok=${runtime.journal.ok} head=${runtime.journal.head.slice(0, 16)}…`);
console.log(`[provision] footprint digest: ${runtime.footprintDigest.slice(0, 16)}…`);
console.log(`[provision] program: ${runtime.programPath}`);
for (const r of runtime.results) {
  console.log(`  ${r.traceId ?? "-"} ${r.status} ${r.intent ?? r.error?.code ?? ""}${r.error ? " — " + r.error.message : ""}`);
  for (const p of r.projections) console.log(`      ${p.slot}: emitted="${p.emitted}" → value=${p.value} (${p.how})`);
}
console.log(`[provision] receipt: ${JSON.stringify(runtime.receiptVerification)}`);
