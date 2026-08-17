/* Executes examples/vdrpros-ussh.igl against stub runtimes wired to the
   VDRPros matter, and prints the resulting TurnTrace ledger.

   Run:  node examples/run-vdrpros.js            */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Interpreter, IdentityRuntime, UDMRuntime, AIRuntime, IOSRuntime } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "vdrpros-ussh.igl"), "utf8");

/* ---- the matter's identity graph ---- */
const identity = new IdentityRuntime({
  actors: {
    Hobson: { roles: ["Counsel", "Paralegal"], defaultRole: "Counsel",
              footprint: { firm: "Hobson & Bradley", matter: "2026-CV-04417" } },
  },
});

/* ---- UDM: what is governed in this matter ---- */
const udm = new UDMRuntime({
  boundaries: { Matter: { values: ["2026-CV-04417"] } },
  forms: { "US-TX": { forms: [] } },
  constraints: {
    production_integrity: [
      { name: "load_file_present", test: () => true },
      { name: "image_count_matches_opt", test: () => true },
    ],
    named: {
      Bates_Continuity: () => true,          // real impl: reconcile ranges against the privilege log
      Fail_Closed_On_Ambiguity: () => true,  // real impl: hold anything the screen cannot clear
    },
  },
});

/* ---- AI: pinned model, stub inference ---- */
const ai = new AIRuntime({
  models: { "claude-sonnet-5": { version: "2026-05-01" } },
  invoke: async call => ({
    text: `[${call.task}] over ${call.inputs.length} bound input(s), ${call.context.length} context trace(s)`,
    confidence: 0.86,
  }),
});

const ios = new IOSRuntime({ decay: 0.75, floor: 0.4, maxDepth: 3 });

const interp = new Interpreter({ identity, udm, ai, ios });
const { results, halted } = await interp.run(src);

const pad = (s, n) => String(s).padEnd(n);
console.log("\nUSSH / USSP discovery — IGL execution ledger\n");
console.log(pad("TRACE", 12), pad("INTENT", 30), pad("STATE", 11), pad("CLASS", 14), "DEPTH  CONF");
console.log("-".repeat(88));
for (const r of results) {
  if (r.status === "failed") { console.log(pad("—", 12), pad(r.error.code, 30), pad("failed", 11), r.error.message); continue; }
  const t = r.trace;
  console.log(pad(t.id, 12), pad(t.intent, 30), pad(t.state, 11), pad(t.attestation, 14),
    pad(t.depth, 6), t.confidence.toFixed(2));
}
console.log("-".repeat(88));
console.log(`${results.filter(r => r.status === "committed").length} committed · ` +
            `${ios.traces.length} traces written · halted: ${!!halted}\n`);

/* the provenance question a reviewer actually asks */
const memo = results.find(r => r.trace?.intent === "Compile_Findings");
if (memo) {
  console.log("Findings memo provenance:");
  for (const a of memo.trace.assertions) {
    const cls = a.attestation.padEnd(14);
    const detail = a.assertion === "inference"
      ? `${a.task} · ${a.model}@${a.modelVersion} · seed ${a.seed} · conf ${a.confidence}`
      : a.assertion === "attestation" ? `signed by ${a.signer} (${a.role})`
      : a.assertion;
    console.log(`  ${cls} ${detail}`);
  }
  console.log(`  context read: ${memo.trace.contextTraceIds.length} trace(s) under ` +
              `${JSON.stringify(memo.trace.contextPredicate)}\n`);
}
