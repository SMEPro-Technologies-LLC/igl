// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { GraphRuntime, DEFAULT_DIMENSIONS } from "../src/graph.js";
import { Interpreter, UDMRuntime, AIRuntime, IOSRuntime } from "../src/index.js";

const iso = (d) => new Date(d).toISOString();
const mkGraph = (opts = {}) => new GraphRuntime({ roles: { Allco: ["Operator"], Hobson: ["Counsel"] }, ...opts });

/* ---------------- containment ---------------- */
test("a grant covers its own value", () => {
  const g = mkGraph();
  g.grant("Allco", { Jurisdiction: ["TX-RRC"], Period: ["2026-Q3"] }, { by: "admin" });
  assert.equal(g.authorize("Allco", { Jurisdiction: "TX-RRC", Period: "2026-Q3" }).ok, true);
});

test("lattice: a grant on the parent covers the child", () => {
  const g = mkGraph();
  g.grant("Allco", { Jurisdiction: ["US-TX"] }, { by: "admin" });
  assert.equal(g.covers("Jurisdiction", ["US-TX"], "TX-RRC"), true, "US-TX must cover TX-RRC");
  assert.equal(g.covers("Jurisdiction", ["TX-RRC"], "US-TX"), false, "containment is one-directional");
});

test("an uncovered dimension names the dimension, not just 'denied'", () => {
  const g = mkGraph();
  g.grant("Allco", { Jurisdiction: ["TX-RRC"] }, { by: "admin" });
  const r = g.authorize("Allco", { Jurisdiction: "NM-OCD" });
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].dimension, "Jurisdiction");
  assert.match(r.violations[0].reason, /does not cover NM-OCD/);
});

/* ---------------- the security property ---------------- */
test("SECURITY: no volume of ai-class observation confers authority", () => {
  const g = mkGraph();
  g.grant("Allco", { Jurisdiction: ["TX-RRC"] }, { by: "admin" });
  for (let i = 0; i < 500; i++) g.observe("Allco", { Jurisdiction: ["NM-OCD"] }, { cls: "ai", traceId: `T${i}` });
  const r = g.authorize("Allco", { Jurisdiction: "NM-OCD" });
  assert.equal(r.ok, false, "500 consistent observations must not grant a permission");
  assert.match(r.violations[0].note, /observation does not confer authority/);
  const fp = g.footprint("Allco");
  assert.ok(fp.observed.proposed.Jurisdiction.some(x => x.value === "NM-OCD"), "it is still learned, in the proposed layer");
  assert.equal(fp.observed.governing.Jurisdiction, undefined, "ai-class evidence never reaches the governing layer");
});

test("SECURITY: anchored observation reaches the governing layer but still does not authorise", () => {
  const g = mkGraph();
  g.grant("Allco", { Jurisdiction: ["TX-RRC"] }, { by: "admin" });
  for (let i = 0; i < 10; i++) g.observe("Allco", { Jurisdiction: ["NM-OCD"] }, { cls: "human" });
  const fp = g.footprint("Allco");
  assert.ok(fp.observed.governing.Jurisdiction.some(x => x.value === "NM-OCD"), "anchored evidence is governing-class");
  assert.equal(g.authorize("Allco", { Jurisdiction: "NM-OCD" }).ok, false, "governing observation is still not a grant");
});

test("promotion candidates are offered, never applied", () => {
  const g = mkGraph({ promoteAfter: 3 });
  g.grant("Allco", { Jurisdiction: ["TX-RRC"] }, { by: "admin" });
  for (let i = 0; i < 4; i++) g.observe("Allco", { Jurisdiction: ["NM-OCD"] }, { cls: "deterministic" });
  for (let i = 0; i < 99; i++) g.observe("Allco", { Jurisdiction: ["LA-DNR"] }, { cls: "ai" });

  const p = g.promotions("Allco");
  const nm = p.find(x => x.value === "NM-OCD");
  const la = p.find(x => x.value === "LA-DNR");
  assert.equal(nm.eligible, true, "4 anchored observations clears the threshold");
  assert.equal(la.eligible, false, "99 ai observations do not");
  assert.match(la.rationale, /cannot promote at any volume/);
  assert.equal(g.authorize("Allco", { Jurisdiction: "NM-OCD" }).ok, false, "eligibility is not application");
});

test("FAIL-CLOSED ROLE: an actor with no recorded roles holds no role — the empty set is not a wildcard", () => {
  const g = new GraphRuntime({ dimensions: DEFAULT_DIMENSIONS });      // no roles seeded
  g.grant("Ghost", { Jurisdiction: ["TX-RRC"] }, { by: "admin" });
  assert.throws(() => g.resolve(["Ghost", "Operator"]), e => e.code === "IGL_ROLE_DENIED",
    "a role must be HELD, not merely un-contradicted");
});

test("an unsigned grant or revoke is refused", () => {
  const g = mkGraph();
  assert.throws(() => g.grant("Allco", { Jurisdiction: ["TX-RRC"] }, {}), e => e.code === "IGL_UNSIGNED_GRANT");
  assert.throws(() => g.revoke("Allco", { Jurisdiction: ["TX-RRC"] }, {}), e => e.code === "IGL_UNSIGNED_REVOKE");
});

/* ---------------- revocation and decay ---------------- */
test("revocation takes effect on the next authorisation", () => {
  const g = mkGraph();
  g.grant("Allco", { Jurisdiction: ["TX-RRC"] }, { by: "admin" });
  assert.equal(g.authorize("Allco", { Jurisdiction: "TX-RRC" }).ok, true);
  g.revoke("Allco", { Jurisdiction: ["TX-RRC"] }, { by: "admin" });
  assert.equal(g.authorize("Allco", { Jurisdiction: "TX-RRC" }).ok, false);
});

test("DISUSE MUST NOT REVOKE: a grant unused for years still authorises", () => {
  const g = mkGraph({ halfLifeDays: 30 });
  const longAgo = iso(Date.now() - 5 * 365 * 86400000);
  g.grant("Allco", { Jurisdiction: ["TX-RRC"] }, { by: "admin", at: longAgo });
  g.observe("Allco", { Jurisdiction: ["TX-RRC"] }, { cls: "deterministic", at: longAgo });
  assert.equal(g.authorize("Allco", { Jurisdiction: "TX-RRC" }).ok, true,
    "absence of activity is not a revocation — the alternative is a silent security event");
  const fp = g.footprint("Allco");
  assert.ok(fp.observed.governing.Jurisdiction[0].weight < 0.01, "descriptive weight does decay");
});

test("descriptive weight falls with recency", () => {
  const g = mkGraph({ halfLifeDays: 100 });
  g.observe("Allco", { Jurisdiction: ["TX-RRC"] }, { cls: "deterministic", at: iso(Date.now() - 100 * 86400000) });
  const [e] = g.footprint("Allco").observed.governing.Jurisdiction;
  assert.ok(Math.abs(e.weight - 0.5) < 0.02, `one half-life should halve the weight, got ${e.weight}`);
});

/* ---------------- reconstruction ---------------- */
test("asOf reconstructs the footprint as it stood, not as it stands", () => {
  const g = mkGraph();
  const t0 = iso(Date.now() - 3 * 86400000);
  const t1 = iso(Date.now() - 1 * 86400000);
  g.grant("Allco", { Jurisdiction: ["TX-RRC"] }, { by: "admin", at: t0 });
  g.revoke("Allco", { Jurisdiction: ["TX-RRC"] }, { by: "admin", at: t1 });

  assert.equal(g.authorize("Allco", { Jurisdiction: "TX-RRC" }).ok, false, "now: revoked");
  assert.equal(g.authorize("Allco", { Jurisdiction: "TX-RRC" }, { asOf: iso(Date.now() - 2 * 86400000) }).ok, true,
    "a past statement must be judged by the authority in force at the time");
});

test("FOLD IS ASSOCIATIVE AND COMMUTATIVE: shuffled replay reaches the same state", () => {
  const base = Date.now() - 50 * 86400000;
  const events = [];
  for (let i = 0; i < 60; i++) {
    events.push({ actor: "Allco", dims: { Jurisdiction: [i % 3 ? "TX-RRC" : "NM-OCD"] },
      cls: i % 2 ? "ai" : "deterministic", at: iso(base + i * 3600000) });
  }
  const build = list => {
    const g = mkGraph();
    g.grant("Allco", { Jurisdiction: ["TX-RRC"] }, { by: "admin", at: iso(base - 86400000) });
    for (const e of list) g.observe(e.actor, e.dims, { cls: e.cls, at: e.at });
    return JSON.stringify(g.footprint("Allco", { asOf: iso(base + 100 * 3600000) }));
  };
  const inOrder = build(events);
  for (let trial = 0; trial < 5; trial++) {
    const shuffled = [...events].sort(() => Math.random() - 0.5);
    assert.equal(build(shuffled), inOrder, "out-of-order folding must reach the same projection");
  }
});

/* ---------------- interpreter integration: the loop closes ---------------- */
const udm = () => new UDMRuntime({
  boundaries: { Jurisdiction: { values: ["TX-RRC", "NM-OCD"] }, Period: { values: ["2026-Q3"] }, Commodity: { values: ["Oil"] } },
  forms: { "TX-RRC": { forms: ["PR-202"] } },
});
const ai = () => new AIRuntime({ models: { "claude-sonnet-5": { version: "2026-05-01" } },
  invoke: async () => ({ text: "ok", confidence: 0.9 }) });

const stmt = (jur) => `ID[Allco:Operator | Jurisdiction:${jur}, Period:2026-Q3]
  :: Intent[Generate_Compliance_Packet, Mode=Full]
  => Compute[UDM.Resolve(AgencyCode=TX-RRC, RequiredForms=[PR-202]),
             AI.Infer(Task=Missing_Fields, Model=claude-sonnet-5, Seed=3),
             IOS.Trace(Channels=[Reasoning, Context])]
  -> Output[Compliance_Packet, TurnTrace_ID];`;

test("interpreter refuses a statement outside the granted footprint", async () => {
  const g = mkGraph();
  g.grant("Allco", { Jurisdiction: ["TX-RRC"], Period: ["2026-Q3"] }, { by: "admin" });
  const it = new Interpreter({ identity: g, udm: udm(), ai: ai(), ios: new IOSRuntime() });
  const { results } = await it.run(stmt("NM-OCD"));
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].error.code, "IGL_FOOTPRINT_DENIED");
  assert.equal(it.ios.traces.length, 0, "an unauthorised statement never reaches compute");
});

test("a committed trace folds back into the graph and lands in the right layer", async () => {
  const g = mkGraph();
  g.grant("Allco", { Jurisdiction: ["TX-RRC"], Period: ["2026-Q3"] }, { by: "admin" });
  const it = new Interpreter({ identity: g, udm: udm(), ai: ai(), ios: new IOSRuntime() });
  const { results } = await it.run(stmt("TX-RRC"));
  assert.equal(results[0].status, "committed");
  assert.equal(results[0].trace.attestation, "ai");

  const fp = g.footprint("Allco");
  assert.ok(fp.observed.proposed.Jurisdiction?.some(x => x.value === "TX-RRC"),
    "the trace folded back — the graph learned from its own execution");
  assert.equal(fp.observed.governing.Jurisdiction, undefined,
    "an ai-class trace may never reach the layer that could widen authority");
});

test("the graph gets richer every turn without the governing layer moving", async () => {
  const g = mkGraph();
  g.grant("Allco", { Jurisdiction: ["TX-RRC"], Period: ["2026-Q3"] }, { by: "admin" });
  const grantedBefore = JSON.stringify(g.footprint("Allco").granted);
  const it = new Interpreter({ identity: g, udm: udm(), ai: ai(), ios: new IOSRuntime() });
  for (let i = 0; i < 5; i++) {
    it.env.clear();
    await it.run(stmt("TX-RRC").replace("Seed=3", `Seed=${i}`));
  }
  const fp = g.footprint("Allco");
  assert.ok(fp.observed.proposed.Jurisdiction[0].count >= 1, "descriptive knowledge accumulates");
  assert.equal(JSON.stringify(fp.granted), grantedBefore, "prescriptive authority is unchanged by any amount of activity");
});
