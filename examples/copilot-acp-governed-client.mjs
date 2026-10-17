/* An Agent Client Protocol client for GitHub Copilot CLI, with IGL as the
   permission authority.

   Copilot CLI runs as an ACP server (`copilot --acp --stdio`). Under ACP the
   agent must ask the client for permission before a tool call, so the client
   is where governance belongs. This client answers every permission request
   by asking the IGL platform (POST /authority/evaluate) and selects the
   option the decision implies:

     allow                     the "allow_once" option; never "allow_always",
                               because each call is evaluated on its own
     deny                      the "reject_once" option, with the decision id
                               and reason codes printed
     escalate, conditional     refused as well: an ACP client has no person
                               to hand the question to, so the call is
                               recorded as escalated and the agent is told

   Authority decisions are recorded by IGL; execution outcomes are recorded
   with POST /audit/interactions when the tool-call update is terminal.

   Setup is shared with examples/copilot-sdk-governed-session.mjs: run it
   with --setup once to create the agent identity and the two policies, then
   export IGL_AGENT_ID. Needs Node 20+, Copilot CLI on PATH (or
   COPILOT_CLI_PATH), and `npm install @agentclientprotocol/sdk`.

   Usage:
     node examples/copilot-acp-governed-client.mjs "Summarize the README" */

import * as acp from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";

const BASE = (process.env.IGL_API_BASE || "https://sandbox.id-me.ai/v1").replace(/\/$/, "");
const KEY = process.env.IGL_API_KEY;
const TENANT = process.env.IGL_TENANT_ID;
const AGENT = process.env.IGL_AGENT_ID;
if (!KEY || !TENANT || !AGENT) { console.error("Set IGL_API_KEY, IGL_TENANT_ID and IGL_AGENT_ID (see copilot-sdk-governed-session.mjs --setup)."); process.exit(2); }
const prompt = process.argv.slice(2).join(" ");
if (!prompt) { console.error("Usage: \"<prompt>\""); process.exit(2); }

async function igl(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { authorization: `Bearer ${KEY}`, "x-igl-tenant-id": TENANT, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json.title || ""} ${json.detail || ""}`.trim());
  return json;
}

const purposes = await igl("GET", "/purposes");
const purpose = (purposes.items.find((p) => p.default) || purposes.items[0]).id;

const copilot = spawn(process.env.COPILOT_CLI_PATH ?? "copilot", ["--acp", "--stdio"], { stdio: ["pipe", "pipe", "inherit"] });
const stream = acp.ndJsonStream(Writable.toWeb(copilot.stdin), Readable.toWeb(copilot.stdout));
const toolNames = new Map();
const pendingToolCalls = new Map();
const callKey = (sessionId, toolCallId) => JSON.stringify([sessionId, toolCallId]);
const isName = (value) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const canonicalName = (call) =>
  isName(call?.name) ||
  isName(call?.toolName) ||
  isName(call?.meta?.toolName) ||
  isName(call?._meta?.toolName) ||
  isName(call?.rawInput?.toolName) ||
  isName(call?.rawInput?.name);

/** @type {acp.Client} */
const client = {
  async requestPermission({ sessionId, toolCall, options }) {
    const key = callKey(sessionId, toolCall.toolCallId);
    const tool = canonicalName(toolCall) || toolNames.get(key);
    const pick = (kind) => options.find((o) => o.kind === kind);
    const reject = pick("reject_once") || pick("reject_always");

    if (!tool || !isName(toolCall.toolCallId)) {
      pendingToolCalls.set(key, { tool: tool || "unresolved tool", allowed: false, outcome: "refused", reason: "tool identity could not be resolved" });
      process.stderr.write("\n[igl] refusing ACP permission request: tool identity could not be resolved\n");
      return { outcome: reject ? { outcome: "selected", optionId: reject.optionId } : { outcome: "cancelled" } };
    }

    const decision = await igl("POST", "/authority/evaluate", {
      actor: { identityId: AGENT },
      action: `tool.${tool}`,
      resource: { type: "tool", id: tool, attributes: { kind: toolCall.kind ?? null, title: toolCall.title ?? null } },
      context: { sessionId, toolCallId: toolCall.toolCallId, protocol: "acp" },
    });
    const why = `${decision.reasonCodes.join(", ")} (decision ${decision.decisionId})`;
    const allow = decision.effect === "allow" && pick("allow_once");
    const outcome = allow
      ? { outcome: "selected", optionId: allow.optionId }
      : reject ? { outcome: "selected", optionId: reject.optionId } : { outcome: "cancelled" };
    pendingToolCalls.set(key, {
      tool,
      allowed: Boolean(allow),
      outcome: decision.effect === "deny" || decision.effect === "allow" ? "refused" : "escalated",
      reason: why,
    });
    if (!allow) process.stderr.write(`\n[igl] ${decision.effect} tool.${tool}: ${why}\n`);
    return { outcome };
  },

  async sessionUpdate({ sessionId, update }) {
    if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
      process.stdout.write(update.content.text);
      return;
    }
    if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") return;

    const key = callKey(sessionId, update.toolCallId);
    const reportedName = canonicalName(update) || canonicalName(update.toolCall) || canonicalName(update.rawInput);
    if (reportedName) toolNames.set(key, reportedName);
    if (update.status !== "completed" && update.status !== "failed") return;

    const call = pendingToolCalls.get(key);
    toolNames.delete(key);
    if (!call) return;
    pendingToolCalls.delete(key);
    try {
      await igl("POST", "/audit/interactions", {
        identityId: AGENT,
        purpose,
        outcome: call.allowed ? update.status === "completed" ? "completed" : "refused" : call.outcome,
        reason: `tool.${call.tool} over ACP in session ${sessionId}, call ${update.toolCallId}: ${call.reason || update.status}`,
      });
    } catch (error) {
      process.stderr.write(`[igl] failed to record ACP tool outcome: ${String(error)}\n`);
    }
  },
};

const connection = new acp.ClientSideConnection(() => client, stream);
await connection.initialize({ protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: {} });
const { sessionId } = await connection.newSession({ cwd: process.cwd(), mcpServers: [] });
const result = await connection.prompt({ sessionId, prompt: [{ type: "text", text: prompt }] });
process.stdout.write("\n");
if (result.stopReason !== "end_turn") process.stderr.write(`stopReason=${result.stopReason}\n`);

copilot.stdin.end();
copilot.kill("SIGTERM");
await new Promise((resolve) => { copilot.once("exit", resolve); setTimeout(resolve, 2000); });
