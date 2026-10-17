#!/usr/bin/env node
/* The IGL command line.

     npx igl demo        an agent acts, is refused outside its boundary, and every step is provable: ~10 seconds, no model, no network
     npx igl verify FILE check a journal written by FileJournal (chain, Merkle root, checkpoint)
     npx igl --help

   Everything the demo prints comes from the real runtime in src/: the interpreter, the hash-chained journal,
   Ed25519 receipts and Merkle inclusion proofs. The model is a stub that answers "ok", so nothing is downloaded. */
import { Interpreter } from "../src/interpreter.js";
import { IdentityRuntime, UDMRuntime, AIRuntime, IOSRuntime } from "../src/runtime.js";
import { MemoryJournal, FileJournal } from "../src/store.js";
import { Signer } from "../src/sign.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const ok = (s) => c("32", s), bad = (s) => c("31", s), dim = (s) => c("2", s), bold = (s) => c("1", s);
const short = (h) => String(h).slice(0, 16) + "…";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function demo({ fast = false } = {}) {
  const pause = fast ? () => {} : (ms) => sleep(ms);
  console.log(bold(`IGL ${version}: an AI agent, governed before it executes`));
  console.log(dim("Everything below runs the real runtime (src/). The model is a stub; nothing is downloaded.\n"));

  // 1. Who may act, within what limits. Declared up front; the runtime enforces it.
  const identity = new IdentityRuntime({ actors: { Agent: { roles: ["Operator"], defaultRole: "Operator", footprint: { org: "Example Energy" } } } });
  const udm = new UDMRuntime({ boundaries: { Jurisdiction: { values: ["TX-RRC"] }, Period: { values: ["2026-Q3"] }, Commodity: { values: ["Oil"] } }, forms: { "TX-RRC": { forms: ["PR-202"] } } });
  const ai = new AIRuntime({ models: { "stub-model": { version: "demo" } }, invoke: async () => ({ text: "ok", confidence: 0.9, modelVersion: "demo" }) });
  const journal = new MemoryJournal();
  const ios = new IOSRuntime({ journal });
  const signer = Signer.generate("igl-demo-runtime");
  const it = new Interpreter({ identity, udm, ai, ios, runtimeSigner: signer });
  console.log(`${bold("Rules")}   Agent may act as Operator inside Jurisdiction=TX-RRC, Period=2026-Q3. Nothing else.`);
  await pause(400);

  // 2. An action inside the boundary: committed, traced, signed.
  const allowed = `ID[Agent:Operator | Jurisdiction:TX-RRC, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet, Mode=Full]
    => Compute[UDM.Resolve(AgencyCode=TX-RRC, RequiredForms=[PR-202]), AI.Infer(Task=Missing_Fields, Model=stub-model, MinConfidence=0.6), IOS.Trace(Channels=[Reasoning, Tools])]
    -> Output[Compliance_Packet, TurnTrace_ID];`;
  const r1 = (await it.run(allowed)).results[0];
  const t1 = r1.trace;
  console.log(`\n${bold("Action 1")} Generate_Compliance_Packet in TX-RRC, 2026-Q3`);
  console.log(`         ${ok("committed")}  trace ${t1.id}  intent ${t1.intent}  boundary ${JSON.stringify(t1.boundary)}`);
  const v1 = Signer.verifyTraceReceipt(t1);
  console.log(`         receipt    Ed25519 by ${t1.receipt.signer}, digest ${short(t1.receipt.traceDigest)}  ${v1.ok ? ok("verifies") : bad(v1.reason)}`);
  await pause(600);

  // 3. The same agent, one step outside its boundary: refused before anything runs, and the refusal is itself recorded.
  const outside = `ID[Agent:Operator | Jurisdiction:NM-OCD, Period:2026-Q3]
    :: Intent[Generate_Compliance_Packet, Mode=Full]
    => Compute[IOS.Trace(Channels=[Reasoning])]
    -> Output[Compliance_Packet];`;
  const r2 = (await it.run(outside)).results[0];
  console.log(`\n${bold("Action 2")} the same agent tries Jurisdiction=NM-OCD`);
  console.log(`         ${bad("refused")}    ${r2.error.code}: ${r2.error.message}`);
  const failure = journal.entries("failure").at(-1);
  console.log(`         recorded   journal entry #${failure.seq} type=failure  ${dim("(a refusal is a governed event, not a silent no)")}`);
  await pause(600);

  // 4. The journal: a hash chain, a Merkle root, an inclusion proof for the refusal, and a signed head.
  const v = journal.verify();
  const root = journal.merkleRoot();
  const proof = journal.inclusionProof(failure.seq);
  const inc = MemoryJournal.verifyInclusion(proof).ok;
  const head = signer.headReceipt(journal, { demo: true });
  const hv = Signer.verifyHeadReceipt(head, { journal });
  console.log(`\n${bold("Journal")}  ${v.length} entries, chain ${v.ok ? ok("intact") : bad("broken")}, head ${short(v.head)}`);
  console.log(`         Merkle root ${short(root)}; inclusion proof for the refusal (entry #${failure.seq}, ${proof.proof.length} hashes) ${inc ? ok("verifies") : bad("fails")}`);
  console.log(`         head receipt signed by ${head.signer} ${hv.ok ? ok("verifies") : bad(hv.reason)}`);
  await pause(600);

  // 5. Tamper with history: edit the committed trace in a copy of the journal and watch verification refuse it.
  const copy = new MemoryJournal();
  for (const e of journal.list) copy.list.push(e);
  const target = copy.list.findIndex((e) => e.type === "trace");
  const forged = structuredClone(copy.list[target]); forged.body.intent = "File_Production_Report"; copy.list[target] = forged;
  const tv = copy.verify();
  const hv2 = Signer.verifyHeadReceipt(head, { journal: copy });
  console.log(`\n${bold("Tamper")}   change entry #${target}'s intent after the fact`);
  console.log(`         chain ${tv.ok ? bad("still verifies (bug)") : ok("refused")}: ${tv.reason} at entry #${tv.at}`);
  console.log(`         head receipt against the edited journal: ${hv2.ok ? bad("verifies (bug)") : ok("refused")} ${dim("(" + hv2.reason + ")")}`);

  console.log(`\n${dim("What you just saw: identity resolved, boundary checked before execution, every step (including the refusal) in an append-only journal,")}`);
  console.log(`${dim("receipts you can verify with the public key alone, and a chain that cannot be edited without being detected.")}`);
  console.log(`${dim("Next: node examples/run-igl-language-live.mjs (a real model inside the same limits) · https://github.com/SMEPro-Technologies-LLC/igl")}`);
  return v.ok && v1.ok && inc && hv.ok && !tv.ok && !hv2.ok;
}

async function verify(path) {
  if (!path) { console.error("usage: igl verify <journal file written by FileJournal>"); return 2; }
  let j;
  try { j = new FileJournal(path); }                      // a doctored journal refuses to load at all; say so
  catch (e) { console.log(`${bad("broken")} ${e.message}`); return 1; }
  const v = j.verify();
  if (!v.ok) { console.log(`${bad("broken")} ${v.reason} at entry #${v.at}`); return 1; }
  console.log(`${ok("intact")} ${v.length} entries, head ${v.head}, merkle root ${j.merkleRoot()}`);
  return 0;
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "demo") { const good = await demo({ fast: rest.includes("--fast") }); process.exit(good ? 0 : 1); }
else if (cmd === "verify") process.exit(await verify(rest[0]));
else if (cmd === "--version" || cmd === "-v") console.log(version);
else {
  console.log(`igl ${version}\n\n  npx igl demo [--fast]   an agent governed before it executes: a committed action, a refusal, receipts, the chain (no model, no network)\n  npx igl verify <file>   verify a journal written by FileJournal\n  npx igl --version\n\nDocs: https://github.com/SMEPro-Technologies-LLC/igl`);
  process.exit(cmd && cmd !== "--help" && cmd !== "-h" ? 2 : 0);
}
