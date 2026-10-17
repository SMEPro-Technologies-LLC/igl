import { test } from "node:test";
import assert from "node:assert/strict";
import { govern, governHandler } from "../src/mcp.js";
import { IdentityRuntime, UDMRuntime, IOSRuntime } from "../src/runtime.js";
import { MemoryJournal } from "../src/store.js";
import { Signer } from "../src/sign.js";

/* An in-memory MCP "server": the shape the SDK's Client exposes, nothing more. */
function fakeClient(log) {
  return {
    connected: true,
    async callTool({ name, arguments: args }) {
      log.push(name);
      if (name === "explode") throw new Error("tool blew up");
      return { content: [{ type: "text", text: `${name} ran with ${JSON.stringify(args)}` }] };
    },
    async listTools() { return { tools: [{ name: "file_report" }, { name: "shell" }] }; },
  };
}
const setup = () => {
  const journal = new MemoryJournal();
  return {
    journal, log: [],
    identity: new IdentityRuntime({ actors: { Agent: { roles: ["Operator"], defaultRole: "Operator" } } }),
    udm: new UDMRuntime({ boundaries: { Jurisdiction: { values: ["TX-RRC"] }, Period: { values: ["2026-Q3"] } } }),
    ios: new IOSRuntime({ journal }),
    signer: Signer.generate("mcp-test"),
    boundaryOf: (name, args) => [{ key: "Jurisdiction", value: args.state }, { key: "Period", value: "2026-Q3" }],
  };
};

test("an allowed tool call is forwarded, traced with a verifying receipt, and carries the trace in _meta", async () => {
  const s = setup();
  const client = govern(fakeClient(s.log), { ...s, actor: ["Agent", "Operator"] });
  const r = await client.callTool({ name: "file_report", arguments: { state: "TX-RRC" } });
  assert.deepEqual(s.log, ["file_report"]);
  assert.match(r.content[0].text, /file_report ran/);
  assert.equal(r._meta.igl.traceId, "TRC-MCP-000001");
  const trace = s.ios.find(r._meta.igl.traceId);
  assert.equal(trace.intent, "Call_Tool");
  assert.deepEqual(trace.boundary, { Jurisdiction: "TX-RRC", Period: "2026-Q3" });
  assert.equal(trace.params.tool, "file_report");
  assert.equal("state" in trace.params, false, "arguments never enter the journal, only their digest");
  assert.equal(Signer.verifyTraceReceipt(trace).ok, true);
  assert.equal(s.journal.verify().ok, true);
  assert.equal(client.connected, true, "other properties of the client pass through");
  assert.equal((await client.listTools()).tools.length, 2);
});

test("a call outside the boundary is refused before it is forwarded, and the refusal is journaled", async () => {
  const s = setup();
  const client = govern(fakeClient(s.log), { ...s, actor: ["Agent", "Operator"] });
  await assert.rejects(client.callTool({ name: "file_report", arguments: { state: "NM-OCD" } }), (e) => e.code === "IGL_BOUNDARY_REJECTED");
  assert.deepEqual(s.log, [], "nothing reached the server");
  const failures = s.journal.entries("failure");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].body.code, "IGL_BOUNDARY_REJECTED");
  assert.equal(failures[0].body.actor, "Agent");
});

test("an unknown actor, a role the actor does not hold, a disallowed tool and a nameless call are all refused", async () => {
  const s = setup();
  const client = govern(fakeClient(s.log), { ...s, actor: ["Agent", "Operator"], allow: (name) => name !== "shell" });
  await assert.rejects(govern(fakeClient(s.log), { ...s, actor: ["Nobody"] }).callTool({ name: "file_report", arguments: { state: "TX-RRC" } }), (e) => e.code === "IGL_UNKNOWN_ACTOR");
  await assert.rejects(govern(fakeClient(s.log), { ...s, actor: ["Agent", "Counsel"] }).callTool({ name: "file_report", arguments: { state: "TX-RRC" } }), (e) => e.code === "IGL_ROLE_DENIED");
  await assert.rejects(client.callTool({ name: "shell", arguments: { state: "TX-RRC" } }), (e) => e.code === "IGL_TOOL_REFUSED");
  await assert.rejects(client.callTool({ arguments: {} }), (e) => e.code === "IGL_TOOL_REFUSED");
  assert.deepEqual(s.log, []);
  assert.equal(s.journal.entries("failure").length, 4);
});

test("a tool that fails after admission leaves a failed trace, not a committed one, and the error carries the trace id", async () => {
  const s = setup();
  const client = govern(fakeClient(s.log), { ...s, actor: ["Agent", "Operator"] });
  let caught;
  try { await client.callTool({ name: "explode", arguments: { state: "TX-RRC" } }); } catch (e) { caught = e; }
  assert.equal(caught.message, "tool blew up");
  const trace = s.ios.find(caught.igl.traceId);
  assert.equal(trace.state, "failed");
  assert.equal(trace.error.message, "tool blew up");
  assert.equal(Signer.verifyTraceReceipt(trace).ok, true);
});

test("the server side: governHandler gates a tools/call handler and resolves the actor from the request", async () => {
  const s = setup();
  const handler = governHandler(async (request) => ({ content: [{ type: "text", text: "served " + request.params.name }] }), {
    ...s,
    actorOf: (request, extra) => [extra?.caller || "Agent", "Operator"],
    boundaryOf: (name, args) => [{ key: "Jurisdiction", value: args.state }, { key: "Period", value: "2026-Q3" }],
  });
  const ok = await handler({ params: { name: "file_report", arguments: { state: "TX-RRC" } } }, { caller: "Agent" });
  assert.match(ok.content[0].text, /served file_report/);
  assert.equal(ok._meta.igl.traceId, "TRC-MCP-000001");
  await assert.rejects(handler({ params: { name: "file_report", arguments: { state: "TX-RRC" } } }, { caller: "Intruder" }), (e) => e.code === "IGL_UNKNOWN_ACTOR");
  assert.equal(handler.igl.journal.verify().ok, true);
  assert.equal(handler.igl.journal.entries("trace").length, 1);
  assert.equal(handler.igl.journal.entries("failure").length, 1);
});
