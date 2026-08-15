import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Signer, DOMAIN_TRACE, DOMAIN_HEAD, FileJournal, MemoryJournal, GraphRuntime, IOSRuntime, Interpreter, UDMRuntime, AIRuntime, DEFAULT_DIMENSIONS } from "../src/index.js";

const tmp = () => join(mkdtempSync(join(tmpdir(), "igl-")), "journal.jsonl");
const iso = d => new Date(d).toISOString();
const DAY = 86400000;

/* ---------------- envelope signing (R1) ---------------- */
const dated = extra => ({ id: "TRC-000001", finished: iso(Date.now()), ...extra });

test("a trace receipt verifies from the receipt and public key alone", () => {
  const s = Signer.generate("tbradley");
  const trace = dated({ intent: "Compile_Findings", boundary: { Matter: "2026-CV-04417" }, assertions: [] });
  trace.receipt = s.receiptForTrace(trace);
  const v = Signer.verifyTraceReceipt(trace);
  assert.equal(v.ok, true);
  assert.equal(v.signer, "tbradley");
  assert.equal(v.pinned, false, "without a graph the result is explicit about being unpinned");
});

test("an undated trace is refused at signing — the fallback the signer could control is unreachable", () => {
  assert.throws(() => Signer.generate("x").receiptForTrace({ id: "TRC-000001" }), /refusing to sign an undated trace/);
});

test("R1: swapping the signer NAME breaks the signature — the name is authenticated, not metadata", () => {
  const s = Signer.generate("mallory");
  const trace = dated({ intent: "Compile_Findings" });
  trace.receipt = s.receiptForTrace(trace);
  trace.receipt.signer = "tbradley";
  const v = Signer.verifyTraceReceipt(trace);
  assert.equal(v.ok, false);
  assert.match(v.reason, /signature does not verify over the envelope/);
});

test("R1: backdating the receipt timestamp breaks the signature", () => {
  const s = Signer.generate("tbradley");
  const trace = dated({});
  trace.receipt = s.receiptForTrace(trace);
  trace.receipt.at = iso(Date.now() - 400 * DAY);
  assert.equal(Signer.verifyTraceReceipt(trace).ok, false);
});

test("altering a signed trace still breaks the receipt", () => {
  const s = Signer.generate("tbradley");
  const trace = dated({ outputs: { Findings_Memo: { n: 41 } } });
  trace.receipt = s.receiptForTrace(trace);
  trace.outputs.Findings_Memo.n = 12;
  assert.match(Signer.verifyTraceReceipt(trace).reason, /does not reproduce the signed digest/);
});

test("PIN needs a trace timestamp: an undated trace cannot be pinned even if a receipt is attached", () => {
  const graph = new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS });
  const s = Signer.generate("tbradley");
  graph.bindKey("tbradley", s.pub(), { by: "admin" });
  /* forge a receipt onto an undated trace (bypassing receiptForTrace's guard) */
  const trace = { id: "TRC-000009" };
  const body = { ...trace };
  const envelope = { traceDigest: createHash("sha256").update(JSON.stringify(body)).digest("hex"), signer: "tbradley", alg: "Ed25519", at: iso(Date.now()) };
  trace.receipt = { ...envelope, publicKey: s.pub(), signature: s._sign(DOMAIN_TRACE, envelope) };
  const v = Signer.verifyTraceReceipt(trace, { graph });
  assert.equal(v.ok, false);
  assert.match(v.reason, /no timestamp/);
});

/* ---------------- registry pinning (R2) ---------------- */
test("R2: a key-swap forgery FAILS registry-backed verification — attribution is now checked, not aspirational", () => {
  const graph = new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS });
  const real = Signer.generate("tbradley");
  const forger = Signer.generate("mallory");
  graph.bindKey("tbradley", real.pub(), { by: "admin" });

  const trace = { id: "TRC-000002", intent: "Produce_Privilege_Log", at: iso(Date.now()) };
  trace.receipt = real.receiptForTrace(trace);
  assert.equal(Signer.verifyTraceReceipt(trace, { graph }).ok, true);
  assert.equal(Signer.verifyTraceReceipt(trace, { graph }).pinned, true);

  /* forger re-signs the whole envelope under their own key, claiming to be tbradley */
  const forged = { ...trace };
  forged.receipt = forger.receiptForTrace(forged);
  forged.receipt = { ...forged.receipt, signer: "tbradley" };
  /* name is inside the envelope, so this alone already fails; forge it properly: */
  const envelope = { traceDigest: forged.receipt.traceDigest, signer: "tbradley", alg: "Ed25519", at: forged.receipt.at };
  forged.receipt.signature = forger._sign(DOMAIN_TRACE, envelope);
  assert.equal(Signer.verifyTraceReceipt(forged).ok, true, "cryptographically valid under mallory's key…");
  const v = Signer.verifyTraceReceipt(forged, { graph });
  assert.equal(v.ok, false, "…but the graph never bound that key to tbradley");
  assert.match(v.reason, /not registered to tbradley at signing time/);
});

test("R2 ROTATION: a receipt verifies against the key registered at signing time, not the current key", () => {
  const graph = new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS });
  const key1 = Signer.generate("tbradley");
  const key2 = Signer.generate("tbradley");
  const t0 = iso(Date.now() - 10 * DAY), tSign = iso(Date.now() - 5 * DAY), tRotate = iso(Date.now() - 2 * DAY);

  graph.bindKey("tbradley", key1.pub(), { by: "admin", at: t0 });
  const trace = { id: "TRC-000003", intent: "Compile_Findings", finished: tSign };
  trace.receipt = key1.receiptForTrace(trace);

  graph.revokeKey("tbradley", key1.pub(), { by: "admin", at: tRotate });
  graph.bindKey("tbradley", key2.pub(), { by: "admin", at: tRotate });

  assert.equal(Signer.verifyTraceReceipt(trace, { graph }).ok, true,
    "rotation must not invalidate attestations validly made before it");
  assert.equal(graph.hasKey("tbradley", key1.pub(), {}), false, "the old key is dead for NEW signatures");

  /* a trace claiming to be signed AFTER the revocation fails */
  const late = { id: "TRC-000004", intent: "Compile_Findings", finished: iso(Date.now() - 1 * DAY) };
  late.receipt = key1.receiptForTrace(late);
  assert.equal(Signer.verifyTraceReceipt(late, { graph }).ok, false);
});

test("key bindings and revocations must name their grantor, like every other authority event", () => {
  const graph = new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS });
  assert.throws(() => graph.bindKey("x", "AAAA", {}), e => e.code === "IGL_UNSIGNED_GRANT");
  assert.throws(() => graph.revokeKey("x", "AAAA", {}), e => e.code === "IGL_UNSIGNED_REVOKE");
});

/* ---- compromise vs rotation: same event shape, opposite retroactive behaviour ---- */
test("COMPROMISE is retroactive: a signature made BEFORE discovery but after effectiveFrom fails", () => {
  const graph = new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS });
  const key = Signer.generate("tbradley");
  const tBind = iso(Date.now() - 30 * DAY);
  const tSign = iso(Date.now() - 10 * DAY);       // a real signature, before anyone knew
  const tCompromiseFrom = iso(Date.now() - 12 * DAY);  // the key was stolen 12 days ago
  const tDiscovered = iso(Date.now() - 3 * DAY);   // found out 3 days ago

  graph.bindKey("tbradley", key.pub(), { by: "admin", at: tBind });
  const trace = { id: "TRC-000010", intent: "File_Production_Report", finished: tSign };
  trace.receipt = key.receiptForTrace(trace);
  assert.equal(Signer.verifyTraceReceipt(trace, { graph }).ok, true, "valid before the compromise is recorded");

  graph.revokeKey("tbradley", key.pub(), { by: "security", at: tDiscovered, reason: "compromised", effectiveFrom: tCompromiseFrom });
  const v = Signer.verifyTraceReceipt(trace, { graph });
  assert.equal(v.ok, false, "the same signature is now suspect — compromise reaches backward");
  assert.match(v.reason, /key compromised/);
});

test("ROTATION is prospective: a signature before the rotation stays valid", () => {
  const graph = new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS });
  const key = Signer.generate("tbradley");
  const tSign = iso(Date.now() - 10 * DAY);
  graph.bindKey("tbradley", key.pub(), { by: "admin", at: iso(Date.now() - 30 * DAY) });
  const trace = { id: "TRC-000011", intent: "File_Production_Report", finished: tSign };
  trace.receipt = key.receiptForTrace(trace);
  graph.revokeKey("tbradley", key.pub(), { by: "admin", at: iso(Date.now() - 5 * DAY), reason: "rotated" });
  assert.equal(Signer.verifyTraceReceipt(trace, { graph }).ok, true, "rotation must not invalidate prior good signatures");
});

test("revocation reason is validated", () => {
  const graph = new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS });
  assert.throws(() => graph.revokeKey("x", "K", { by: "a", reason: "lost" }), e => e.code === "IGL_BAD_REVOKE_REASON");
});

/* ---- fold ordering: a backdated bind cannot resurrect a revoked key ---- */
test("FOLD ORDER: a bindKey appended AFTER a revoke but timestamped BEFORE it does not resurrect the key", () => {
  const graph = new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS });
  const key = Signer.generate("tbradley");
  graph.bindKey("tbradley", key.pub(), { by: "admin", at: iso(Date.now() - 20 * DAY) });
  graph.revokeKey("tbradley", key.pub(), { by: "admin", at: iso(Date.now() - 10 * DAY), reason: "rotated" });
  /* an attacker appends a bind event dated between the original bind and the revoke */
  graph.bindKey("tbradley", key.pub(), { by: "attacker", at: iso(Date.now() - 15 * DAY) });
  assert.equal(graph.hasKey("tbradley", key.pub(), { asOf: iso(Date.now() - 1 * DAY) }), false,
    "the revoke is later in time than the backdated bind, so the key stays dead");
});

/* ---------------- domain separation + meta nesting (R4) ---------------- */
test("R4: a head-domain signature can never verify in the trace domain", () => {
  const s = Signer.generate("x");
  const envelope = { traceDigest: createHash("sha256").update("z").digest("hex"), signer: "x", alg: "Ed25519", at: iso(Date.now()) };
  const headSig = s._sign(DOMAIN_HEAD, envelope);
  assert.equal(Signer._verify(DOMAIN_TRACE, envelope, s.pub(), headSig), false);
  assert.equal(Signer._verify(DOMAIN_HEAD, envelope, s.pub(), headSig), true);
});

test("R4: headReceipt meta is nested and cannot shadow the verified chain head", () => {
  const j = new MemoryJournal();
  j.append("trace", { id: "TRC-000001" });
  const trueHead = j.verify().head;
  const r = Signer.generate("custodian").headReceipt(j, { head: "f".repeat(64), matter: "2026-CV-04417" });
  assert.equal(r.head, trueHead, "the envelope head is the chain's, not the caller's");
  assert.equal(r.meta.head, "f".repeat(64), "caller data lives under meta");
  assert.equal(Signer.verifyHeadReceipt(r, { journal: j }).ok, true);
});

/* ---------------- head receipts ---------------- */
test("a head receipt binds the verified chain and fails once the chain advances past it", () => {
  const j = new MemoryJournal();
  j.append("trace", { id: "TRC-000001" });
  const r = Signer.generate("custodian").headReceipt(j);
  assert.equal(Signer.verifyHeadReceipt(r, { journal: j }).ok, true);
  j.append("trace", { id: "TRC-000002" });
  assert.match(Signer.verifyHeadReceipt(r, { journal: j }).reason, /does not match the journal head/);
});

test("a signer refuses to sign a broken chain", () => {
  const j = new MemoryJournal();
  j.append("graph", { a: 1 }); j.append("graph", { a: 2 });
  j.list[0].body.a = 99;
  assert.throws(() => Signer.generate("x").headReceipt(j), /refusing to sign a broken chain/);
});

/* ---------------- keyed attestation through the language (R3) ---------------- */
const mkInterp = ({ signers, journal } = {}) => {
  const g = new GraphRuntime({ roles: { Allco: ["Operator"] }, dimensions: DEFAULT_DIMENSIONS });
  g.grant("Allco", { Jurisdiction: ["TX-RRC"], Commodity: ["Oil"], Period: ["2026-Q3"] }, { by: "admin" });
  return new Interpreter({
    identity: g,
    udm: new UDMRuntime({
      boundaries: { Jurisdiction: { values: ["TX-RRC"] }, Commodity: { values: ["Oil"] }, Period: { values: ["2026-Q3"] } },
      forms: { "TX-RRC": { forms: ["PR-202"] } },
    }),
    ai: new AIRuntime({ models: { "claude-sonnet-5": { version: "2026-05-01" } }, invoke: async () => ({ text: "ok", confidence: 0.9 }) }),
    ios: new IOSRuntime(journal ? { journal } : {}),
    signers,
  });
};
const FILING = `ID[Allco:Operator | Jurisdiction:TX-RRC, Commodity:Oil, Period:2026-Q3]
  :: Intent[File_Production_Report, Mode=Full]
  => Compute[UDM.Resolve(AgencyCode=TX-RRC, RequiredForms=[PR-202]),
             IOS.Attest(Signer=jhayes, Role=Operator),
             IOS.Trace(Channels=[Reasoning])]
  -> Output[Filed_Report, TurnTrace_ID];`;

test("KEYED ATTESTATION: the filing trace is human-class, receipted, chained, and third-party verifiable", async () => {
  const jhayes = Signer.generate("jhayes");
  const journal = new FileJournal(tmp());
  const { results } = await mkInterp({ signers: { jhayes }, journal }).run(FILING);
  const t = results[0].trace;
  assert.equal(t.attestation, "human");
  assert.equal(Signer.verifyTraceReceipt(t).ok, true);
  const replayed = new FileJournal(journal.path).entries("trace")[0].body;
  assert.equal(Signer.verifyTraceReceipt(replayed).ok, true, "verification from the journal alone");
});

test("R3 FAIL-CLOSED CLASS: an unkeyed attestation commits the statement but is CLASSED ai, not human", async () => {
  const { results } = await mkInterp({}).run(FILING);
  assert.equal(results[0].status, "committed", "execution proceeds — the class is what refuses to lie");
  const t = results[0].trace;
  assert.equal(t.attestation, "ai", "human class is not mintable by omitting the registry");
  const att = t.assertions.find(a => a.assertion === "attestation");
  assert.equal(att.attestation, "ai");
  assert.match(att.note, /unkeyed attestation/);
  assert.equal(t.receipt, undefined);
});

test("FORGERY CLOSED at attest: with a registry configured, an unregistered signer cannot attest at all", async () => {
  const { results } = await mkInterp({ signers: { jhayes: Signer.generate("jhayes") } })
    .run(FILING.replace("Signer=jhayes", "Signer=mallory"));
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].error.code, "IGL_UNKNOWN_SIGNER");
});

test("an unkeyed-attested trace folds into the graph as ai-class — it cannot anchor the observation layer either", async () => {
  const it = mkInterp({});
  await it.run(FILING);
  const fp = it.identity.footprint("Allco");
  assert.equal(fp.observed.governing.Jurisdiction, undefined, "no governing-layer observation from an unkeyed attestation");
  assert.ok(fp.observed.proposed.Jurisdiction?.length, "it lands in proposed, where unanchored things live");
});
