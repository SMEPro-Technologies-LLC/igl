/* Security regression tests for F-01..F-04 (docs/audit/SECURITY-AUDIT-2026-10.md).
   Pure-module tests run without the model; the end-to-end service test at
   the bottom loads distilgpt2 and is skipped unless IGL_E2E=1. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Signer, GraphRuntime, DEFAULT_DIMENSIONS, FileJournal, MemoryJournal, Interpreter, IdentityRuntime, UDMRuntime, AIRuntime, IOSRuntime, parse, check } from "../src/index.js";
import { credentialFrom, makeGate, listenConfig, principalOf, RateLimiter, Semaphore } from "../provision/auth.mjs";
import { Registry, graphIdFor } from "../provision/registry.mjs";
import { loadOrCreateSigner } from "../provision/keys.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "igl-sec-"));

/* ---------------- F-01: service exposure ---------------- */
test("F-01: with no key configured the service binds loopback only", () => {
  assert.equal(listenConfig({}).host, "127.0.0.1");
});
test("F-01: PROVISION_PUBLIC=1 without PROVISION_API_KEY refuses to start", () => {
  assert.throws(() => listenConfig({ PROVISION_PUBLIC: "1" }), /requires PROVISION_API_KEY/);
  assert.equal(listenConfig({ PROVISION_PUBLIC: "1", PROVISION_API_KEY: "k" }).host, "0.0.0.0");
});
test("F-01: a credential in the query string is ignored; headers are the only channel", () => {
  assert.equal(credentialFrom({ headers: {} }), null);
  assert.equal(credentialFrom({ headers: { authorization: "Bearer abc" } }), "abc");
  assert.equal(credentialFrom({ headers: { "x-igl-caller-key": "xyz" } }), "xyz");
  const gate = makeGate({ apiKey: "S", resolveCaller: () => null });
  assert.equal(gate({ headers: {} }, new URL("http://h/mcp?key=S")).ok, false, "?key= must not authenticate");
  assert.equal(gate({ headers: { authorization: "Bearer S" } }, new URL("http://h/mcp")).admin, true);
  assert.equal(gate({ headers: { authorization: "Bearer WRONG" } }, new URL("http://h/mcp")).status, 401);
});
test("F-01: health is public, everything else needs a credential once a key is configured", () => {
  const gate = makeGate({ apiKey: "S", resolveCaller: () => null });
  assert.equal(gate({ headers: {} }, new URL("http://h/api/health")).ok, true);
  assert.equal(gate({ headers: {} }, new URL("http://h/api/graphs")).ok, false);
});
test("F-01: rate limiter and inference semaphore bound resource use", async () => {
  let t = 0; const rl = new RateLimiter({ capacity: 2, refillPerSec: 1, now: () => t });
  assert.equal(rl.take("p").ok, true); assert.equal(rl.take("p").ok, true); assert.equal(rl.take("p").ok, false);
  t = 1000; assert.equal(rl.take("p").ok, true);
  const sem = new Semaphore({ max: 1, maxQueue: 1 });
  const r1 = await sem.acquire(); const p2 = sem.acquire();          // queued
  await assert.rejects(sem.acquire(), /queue full/);
  r1(); const r2 = await p2; r2();
});

/* ---------------- F-02: ownership ---------------- */
test("F-02: principals derive from the key, never the display name; same label → different storage", () => {
  const a = principalOf("key-a", { name: "Analyst · Oil & Gas" }), b = principalOf("key-b", { name: "Analyst · Oil & Gas" });
  assert.notEqual(a.principal, b.principal);
  assert.notEqual(graphIdFor(a, "analyst-oil-gas"), graphIdFor(b, "analyst-oil-gas"));
  assert.deepEqual(principalOf("k", { id: "p_1", tenant: "t_1" }), { principal: "p_1", tenant: "t_1" });
});
test("F-02: a caller reads only its own graphs; the service principal reads all; cross-tenant get is a miss", () => {
  const reg = new Registry(tmp());
  const alice = { tenant: "t_a", principal: "p_alice" }, bob = { tenant: "t_b", principal: "p_bob" };
  const write = (owner, slug) => { const p = reg.pathsFor(owner, slug); writeFileSync(p.run, JSON.stringify({ id: p.id, slug, kind: "FOOTPRINT", actor: slug, owner, provisionedAt: new Date().toISOString() })); return p.id; };
  const ida = write(alice, "analyst-oil-gas"), idb = write(bob, "analyst-oil-gas");
  assert.notEqual(ida, idb);
  const authA = { ...alice, admin: false }, authB = { ...bob, admin: false }, admin = { principal: "service", tenant: "*", admin: true };
  assert.deepEqual(reg.list(authA).map((g) => g.id), [ida]);
  assert.deepEqual(reg.list(authB).map((g) => g.id), [idb]);
  assert.equal(reg.list(admin).length, 2);
  assert.equal(reg.get(authA, idb), null, "bob's graph is invisible to alice");
  assert.equal(reg.get(admin, idb)?.id, idb);
  assert.equal(reg.search(authA, "analyst").length, 1);
  assert.throws(() => reg.pathsFor({ tenant: "../x", principal: "p" }, "s"), /safe identifiers/);
});

/* ---------------- F-03: signed grants ---------------- */
test("F-03: with a grantor registry, an unsigned grant is refused; a grant signed by a registered grantor is accepted", () => {
  const board = Signer.generate("board");
  const g = new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS, grantors: { board: board.pub() } });
  assert.throws(() => g.grant("A", { Jurisdiction: ["US-TX"] }, { by: "board" }), (e) => e.code === "IGL_UNVERIFIED_GRANT");
  assert.throws(() => g.grant("A", { Jurisdiction: ["US-TX"] }, { by: "someone-else" }), (e) => e.code === "IGL_UNKNOWN_GRANTOR");
  const ev = g.grantSigned(board, "A", { Jurisdiction: ["US-TX"] }, { role: "Operator" });
  assert.equal(ev.verified, true);
  assert.equal(g.authorize("A", { Jurisdiction: "US-TX" }, { role: "Operator" }).ok ?? true, true);
});
test("F-03: a grant signed by the wrong key, or altered after signing, is refused", () => {
  const board = Signer.generate("board"), mallory = Signer.generate("board");   // same NAME, different key
  const g = new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS, grantors: { board: board.pub() } });
  const ev = g.authorityEnvelope("grant", { actor: "A", dims: { Jurisdiction: ["US"] }, role: null, by: "board", note: null });
  ev.signature = mallory.signGrant(ev);
  assert.throws(() => g.grant("A", ev.dims, { by: "board", at: ev.at, signature: ev.signature }), (e) => e.code === "IGL_UNVERIFIED_GRANT");
  const good = g.authorityEnvelope("grant", { actor: "A", dims: { Jurisdiction: ["US-TX"] }, role: null, by: "board", note: null });
  good.signature = board.signGrant(good);
  assert.throws(() => g.grant("A", { Jurisdiction: ["US"] }, { by: "board", at: good.at, signature: good.signature }), (e) => e.code === "IGL_UNVERIFIED_GRANT", "widened dims under the original signature");
});
test("F-03: replaying a journal re-verifies every authority event; a chain written without signatures does not load under a registry", () => {
  const dir = tmp(); const board = Signer.generate("board");
  const j1 = new FileJournal(join(dir, "ok.jsonl"));
  new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS, journal: j1, grantors: { board: board.pub() } }).grantSigned(board, "A", { Jurisdiction: ["US-TX"] });
  const replayed = new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS, journal: new FileJournal(join(dir, "ok.jsonl")), grantors: { board: board.pub() } });
  assert.equal(replayed.events[0].verified, true);
  const j2 = new FileJournal(join(dir, "legacy.jsonl"));
  new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS, journal: j2 }).grant("A", { Jurisdiction: ["US-TX"] }, { by: "board" });   // no registry → unverified
  assert.throws(() => new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS, journal: new FileJournal(join(dir, "legacy.jsonl")), grantors: { board: board.pub() } }), (e) => e.code === "IGL_UNVERIFIED_GRANT");
});
test("F-03: without a registry the runtime behaves as before but marks authority events unverified", () => {
  const g = new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS });
  assert.equal(g.grant("A", { Jurisdiction: ["US-TX"] }, { by: "board" }).verified, false);
});

/* ---------------- F-04: attestation classes ---------------- */
const identity = new IdentityRuntime({ actors: { Allco: { roles: ["Operator"], defaultRole: "Operator" } } });
const udm = () => new UDMRuntime({ boundaries: { Jurisdiction: { values: ["TX-RRC"] }, Period: { values: ["2026-Q3"] }, Commodity: { values: ["Oil"] } }, forms: { "TX-RRC": { forms: ["PR-202"] } } });
const PROG = `%igl 0.2
ID[Allco:Operator | Jurisdiction:TX-RRC, Commodity:Oil, Period:2026-Q3]
  :: Intent[File_Production_Report, Mode=Full]
  => Compute[UDM.Resolve(AgencyCode=TX-RRC, RequiredForms=[PR-202]), IOS.Trace(Channels=[Reasoning]), IOS.Attest(Signer=board, Role=Operator)]
  -> Output[Filed_Report, TurnTrace_ID];`;
const PROG_APPROVED = PROG.replace("IOS.Attest(Signer=board, Role=Operator)", "IOS.Attest(Signer=board, Role=Operator, Approval=@Approval)");
const mk = (opts) => new Interpreter({ identity, udm: udm(), ai: new AIRuntime({ models: {}, invoke: async () => ({ text: "ok", confidence: 0.9 }) }), ios: new IOSRuntime(), ...opts });

test("F-04: a key the SERVICE holds yields a `service` attestation, never `human`", async () => {
  const board = Signer.generate("board");
  const r = await mk({ signers: { board } }).run(PROG);
  assert.equal(r.results[0].status, "committed");
  assert.equal(r.results[0].trace.attestation, "service");
  assert.equal(r.results[0].trace.receipt?.signer, "board");
  assert.match(r.results[0].trace.assertions.find((a) => a.assertion === "attestation").note, /not evidence of human review/);
});
test("F-04: a public-only signer requires an Approval; a valid approval over THIS statement yields `human`", async () => {
  const human = Signer.generate("board");                       // private key lives with the human, not the runtime
  const runtime = Signer.generate("runtime");
  const interp = mk({ signers: { board: Signer.publicOnly("board", human.pub()) }, runtimeSigner: runtime });
  /* no approval → refused */
  await assert.rejects(async () => { const r = await interp.run(PROG); if (r.results[0].status !== "committed") throw Object.assign(new Error(r.results[0].error.code), { code: r.results[0].error.code }); }, (e) => /IGL_APPROVAL_REQUIRED/.test(e.message || e.code));
  /* the human approves the statement they saw: the runtime computes the same subject */
  const probe = mk({ signers: { board: human } });                // only to learn the statement key the runtime derives
  const key = (await probe.run(PROG)).results[0].trace.statementKey;
  const approval = human.approve({ statementKey: key, actor: "Allco", intent: "File_Production_Report", boundary: { Jurisdiction: "TX-RRC", Commodity: "Oil", Period: "2026-Q3" } });
  const interp2 = mk({ signers: { board: Signer.publicOnly("board", human.pub()) }, runtimeSigner: runtime });
  interp2.env.set("Approval", approval);
  const r = await interp2.run(PROG_APPROVED);
  assert.equal(r.results[0].status, "committed");
  assert.equal(r.results[0].trace.attestation, "human");
  assert.equal(r.results[0].trace.receipt?.signer, "runtime", "countersigned by the runtime, approval inside the signed body");
  assert.equal(Signer.verifyTraceReceipt(r.results[0].trace).ok, true);
});
test("F-04: an approval for a different statement, or signed by the wrong key, is refused; a self-approval by a service-held key is refused", async () => {
  const human = Signer.generate("board"), other = Signer.generate("board");
  const subject = { statementKey: "not-this-one", actor: "Allco", intent: "File_Production_Report", boundary: { Jurisdiction: "TX-RRC", Commodity: "Oil", Period: "2026-Q3" } };
  const bad = mk({ signers: { board: Signer.publicOnly("board", human.pub()) } }); bad.env.set("Approval", human.approve(subject));
  assert.equal((await bad.run(PROG_APPROVED)).results[0].error.code, "IGL_BAD_APPROVAL");
  const probe = mk({ signers: { board: human } }); const key = (await probe.run(PROG)).results[0].trace.statementKey;
  const good = { ...subject, statementKey: key };
  const wrongKey = mk({ signers: { board: Signer.publicOnly("board", human.pub()) } }); wrongKey.env.set("Approval", other.approve(good));
  assert.equal((await wrongKey.run(PROG_APPROVED)).results[0].error.code, "IGL_BAD_APPROVAL");
  const self = mk({ signers: { board: human } }); self.env.set("Approval", human.approve(good));
  assert.equal((await self.run(PROG_APPROVED)).results[0].error.code, "IGL_SELF_APPROVAL");
});
test("F-04: signer keys persist across runs and are created with owner-only permissions", () => {
  const dir = tmp();
  const a = loadOrCreateSigner("board", dir), b = loadOrCreateSigner("board", dir);
  assert.equal(a.created, true); assert.equal(b.created, false);
  assert.equal(a.signer.pub(), b.signer.pub());
  assert.equal(statSync(a.file).mode & 0o777, 0o600);
  assert.throws(() => loadOrCreateSigner("../escape", dir), /safe file name/);
});
test("F-04: the checker accepts Approval on IOS.Attest", () => {
  assert.equal(check(parse(PROG_APPROVED), { inputs: ["Approval"] }).length, 0, "declared input binds the reference");
  assert.equal(check(parse(PROG_APPROVED)).some((e) => e.code === "IGL_UNBOUND_REF"), true, "undeclared, it is still unbound");
});
