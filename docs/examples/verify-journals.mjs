/* Builds four small identity graphs with signed grants and observations, then verifies each journal chain and Merkle root. The output is what id-me.ai shows on the Enterprise page. Run: node docs/examples/verify-journals.mjs */
import { GraphRuntime, DEFAULT_DIMENSIONS, MemoryJournal, Signer } from "../../src/index.js";
const board = Signer.generate("smepro-governance-board");
const grantors = { [board.id]: board.pub() };
const specs = [
  ["hilcorp-energy", "BOUNDARY", { Jurisdiction: ["US-TX"], Commodity: ["Oil","Gas"], Period: ["2026-Q4"] }],
  ["jordan-avery-dfir", "FOOTPRINT", { Action: ["triage-alert","acquire-disk-image","preserve-evidence","draft-incident-report"] }],
  ["rio-diablo-operating", "BOUNDARY", { Jurisdiction: ["US-TX"], Commodity: ["Gas"], Period: ["2026-Q4"] }],
  ["maria-santos", "FOOTPRINT", { Action: ["review-filing","prepare-filing","track-obligation"] }],
];
const out = [];
let total = 0;
for (const [name, kind, grant] of specs) {
  const dims = kind === "BOUNDARY" ? DEFAULT_DIMENSIONS : { ...DEFAULT_DIMENSIONS, Action: { type: "set" } };
  const journal = new MemoryJournal();
  const g = new GraphRuntime({ dimensions: dims, journal, grantors });
  const actor = name.replace(/[^a-z0-9]+/gi, "_");
  g.grantSigned(board, actor, grant, { role: "Operator", note: "provisioning" });
  g.bindKeySigned(board, board.id, board.pub());
  for (let i = 0; i < 3; i++) g.observe(actor, kind === "BOUNDARY" ? { Jurisdiction: ["US-TX"] } : { Action: [Object.values(grant)[0][0]] }, { cls: "deterministic" });
  for (let i = 0; i < (kind === "BOUNDARY" ? 3 : 5); i++) g.observe(actor, kind === "BOUNDARY" ? { Jurisdiction: ["US-CA"] } : { Action: ["restore-production-systems"] }, { cls: "ai" });
  const v = journal.verify();
  total += v.length;
  out.push({ name, entries: v.length, head: v.head, ok: v.ok, root: journal.merkleRoot() });
}
console.log(JSON.stringify({ journals: out, total, digest: (await import("node:crypto")).createHash("sha256").update(out.map(o => o.head).join("")).digest("hex") }, null, 2));
