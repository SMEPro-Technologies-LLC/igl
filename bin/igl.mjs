#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MemoryJournal } from "../src/store.js";
import { Signer } from "../src/sign.js";
import { GraphRuntime } from "../src/graph.js";
import { Interpreter } from "../src/interpreter.js";
import { IOSRuntime, UDMRuntime } from "../src/runtime.js";

const usage = `Usage: igl <command>

  demo       Run a local governance demo (no model or network)
  --help     Show this help
  --version  Print the package version`;
const color = (code, text) => Object.hasOwn(process.env, "NO_COLOR") ? text : `\x1b[${code}m${text}\x1b[0m`;

async function demo() {
  const journal = new MemoryJournal();
  const signer = Signer.generate("demo-runtime");
  const graph = new GraphRuntime({
    journal,
    dimensions: { Action: { type: "set" } },
    grantors: { [signer.id]: signer.pub() },
  });
  graph.grantSigned(signer, "Jordan_Avery", { Action: ["draft-incident-report"] }, { role: "DFIR_Coordinator" });
  const interpreter = new Interpreter({
    identity: graph,
    ios: new IOSRuntime({ journal }),
    runtimeSigner: signer,
    udm: new UDMRuntime({
      boundaries: { Action: { values: ["draft-incident-report", "restore-production-systems"] } },
    }),
    intents: {
      Execute_DFIR_Action: {
        roles: ["DFIR_Coordinator"],
        requiresBoundary: ["Action"],
        outputs: { Action_Record: "artifact", TurnTrace_ID: "code" },
        requiresAttestation: false,
        params: {},
      },
    },
  });
  const statement = action => `ID[Jordan_Avery:DFIR_Coordinator | Action:${action}]
    :: Intent[Execute_DFIR_Action]
    => Context[Traces=None],
       Compute[IOS.Stage(Artifact="Local incident report draft"), IOS.Trace(Channels=[Tools])]
    -> Output[Action_Record="Local incident report draft", TurnTrace_ID];`;

  function showReceipt(entry) {
    assert.ok(entry && journal.isDurable(entry), "outcome was not journaled");
    const receipt = signer.headReceipt(journal, { id: `DEMO-${entry.seq}` });
    assert.ok(Signer.verifyHeadReceipt(receipt, { journal }).ok, "receipt did not verify");
    console.log(`  Journal seq ${entry.seq}, hash ${entry.digest.slice(0, 16)}…`);
    console.log(`  Receipt ${receipt.meta.id} | Ed25519 ${receipt.signature.slice(0, 16)}… | chain head ${receipt.head.slice(0, 16)}…`);
    return receipt;
  }

  console.log(color("1", "IGL demo — local execution, no model or network"));
  console.log("Agent acting for Jordan_Avery:DFIR_Coordinator");
  console.log("Boundary: draft-incident-report allowed; restore-production-systems not granted");

  const allowed = (await interpreter.run(statement("draft-incident-report"))).results[0];
  assert.equal(allowed.status, "committed", "allowed action did not commit");
  assert.equal(allowed.outputs.Action_Record, "Local incident report draft");
  assert.ok(Signer.verifyTraceReceipt(allowed.trace).ok, "trace receipt did not verify");
  const entry = journal.entries("trace")[0];
  console.log(color("32", "ALLOWED draft-incident-report — ran; local report draft committed"));
  const allowedReceipt = showReceipt(entry);

  const denied = (await interpreter.run(statement("restore-production-systems"))).results[0];
  assert.equal(denied.status, "failed", "forbidden action was not refused");
  assert.equal(denied.error.code, "IGL_FOOTPRINT_DENIED", "unexpected refusal");
  assert.equal(journal.entries("trace").length, 1, "forbidden action wrote a success trace");
  const failure = journal.entries("failure")[0];
  assert.equal(failure?.body.code, denied.error.code, "refusal was not journaled");
  console.log(color("33", `REFUSED restore-production-systems — ${denied.error.code}`));
  const deniedReceipt = showReceipt(failure);

  const verified = journal.verify();
  assert.ok(verified.ok, verified.reason);
  assert.ok(Signer.verifyHeadReceipt(allowedReceipt, { journal, extended: true }).ok);
  assert.ok(Signer.verifyHeadReceipt(deniedReceipt, { journal }).ok);
  console.log(color("32", `chain verified, ${verified.length} entries`));

  const tampered = new MemoryJournal();
  tampered.list = structuredClone(journal.entries());
  tampered.durable = tampered.list.length;
  tampered.list[entry.seq].body.outputs.Action_Record = "Altered report";
  const broken = tampered.verify();
  assert.equal(broken.ok, false, "tampering went undetected");
  assert.equal(broken.at, entry.seq, "wrong tampered sequence");
  assert.ok(journal.verify().ok, "original journal was changed");
  console.log(color("31", `TAMPER DETECTED — verification failed at sequence ${broken.at}: ${broken.reason}`));
  console.log("Next: README quick start and docs/SPEC.md");
}

try {
  const [command, ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error("unexpected arguments; use igl --help");
  switch (command) {
    case undefined:
    case "--help":
      console.log(usage);
      break;
    case "--version":
      console.log(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
      break;
    case "demo":
      await demo();
      break;
    default:
      throw new Error(`unknown command: ${command}; use igl --help`);
  }
} catch (error) {
  console.error(`igl: ${error.message}`);
  process.exitCode = 1;
}
