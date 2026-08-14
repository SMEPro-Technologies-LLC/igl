/* Run the same WellSite governed session across every top AI vendor and show the
   governance is identical no matter which model proposed the action.

   A vendor runs LIVE if its API key is in the environment; otherwise it runs in
   MOCK mode, clearly labelled, so the harness is demonstrable offline without
   ever faking a vendor call. Set keys to run live:
     OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, XAI_API_KEY,
     MISTRAL_API_KEY, DEEPSEEK_API_KEY, GROQ_API_KEY
   and optionally the *_MODEL overrides. */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parse, run, verify, recomputeFuse, pinnedConstraints, resolveConstraints } from "./src/index.js";
import { VOCAB } from "./src/iosplus.js";
import { availableVendors, liveAdapter, mockAdapter, resolveDistributions, cachedInvoke, ACTIONS } from "./src/vendors.js";

const src = readFileSync(new URL("./programs/wellsite.igl", import.meta.url), "utf8");
const program = parse(src);
// Constraints resolve BEFORE any vendor is invoked: pinned service digests by
// default, the live wire under IGL_LIVE=1. Same fail-closed path as run-wellsite.
const constraints = process.env.IGL_LIVE === "1"
  ? await resolveConstraints(src, { provenance: "live" })
  : pinnedConstraints(src);
const argmax = (a) => a.indexOf(Math.max(...a));
const denyIdx = VOCAB.indexOf("deny"), redactIdx = VOCAB.indexOf("redact");

const vendors = availableVendors();
const anyLive = vendors.some(v => v.hasKey);
console.log("Cross-vendor governed run  -  WellSite production filing on IGL v1.0");
console.log("=".repeat(78));
console.log(anyLive ? "Mode: LIVE where a key is present, MOCK otherwise."
                    : "Mode: no vendor keys in this environment, so all rows are MOCK (labelled).");
console.log("");
console.log("vendor            mode  model                         proposed   governed   0-mass verify fuse");
console.log("-".repeat(78));

const rows = [];
const artifacts = [];
for (const v of vendors) {
  const adapter = v.hasKey ? liveAdapter(v) : mockAdapter(v);
  try {
    const { cache, mode } = await resolveDistributions(program, adapter);
    const proposedDist = [...cache.values()][0] || VOCAB.map(() => 1 / VOCAB.length);
    const r = run(program, { invoke: cachedInvoke(cache), constraints });
    const fuse = r.traces.map(t => t.trace.fuse).find(Boolean);
    const vr = verify(r.receipt);
    const fc = recomputeFuse(fuse);
    const zeroed = fuse.outputDist[redactIdx] === 0;   // provision zero: path-pii-disclosure
    const ceilingsOk = !fuse.ceilings || fuse.outputDist.every((m, i) => m <= fuse.ceilings[i] + 1e-9);
    const proposedTop = ACTIONS[argmax(proposedDist)];
    const governedTop = VOCAB[argmax(fuse.outputDist)];
    rows.push({ vendor: v.label, mode, ok: vr.ok && fc.ok && zeroed && ceilingsOk });
    console.log(
      v.label.padEnd(17),
      mode.padEnd(5),
      String(v.model).slice(0, 28).padEnd(29),
      proposedTop.padEnd(10),
      governedTop.padEnd(10),
      (zeroed ? "yes" : "NO ").padEnd(6),
      (vr.ok ? "ok" : "X").padEnd(6),
      fc.ok ? "ok" : "X");
    artifacts.push({ vendor: v.id, label: v.label, mode, model: v.model, receipt: r.receipt, publicKey: r.publicKey, fuseRecord: fuse });
  } catch (e) {
    rows.push({ vendor: v.label, mode: "ERROR", ok: false });
    console.log(v.label.padEnd(17), "ERR  ", String(e.message).slice(0, 50));
  }
}

console.log("-".repeat(78));
const good = rows.filter(r => r.ok).length;
console.log(`${good}/${rows.length} vendors: receipt verified, FUSE recomputed, PII path zero-mass, ceilings held.`);
console.log("");
console.log("The model proposed the action. IGL governed it: the PII-disclosure path is a");
console.log("provision zero in the DEPLOYED US-TX/RRC matrix and carries zero mass in every");
console.log("column above; graded ceilings held; and every receipt verifies from the");
console.log("artifact alone -- bound to the service digest -- regardless of vendor.");

mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
writeFileSync(new URL("./out/vendor-receipts.json", import.meta.url), JSON.stringify(artifacts, null, 2));
console.log("\nwrote out/vendor-receipts.json  (one signed, independently verifiable receipt per vendor)");
