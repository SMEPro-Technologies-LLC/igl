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

   The tool's identity is what is evaluated, never its category. ACP permission
   requests do not always carry a programmatic tool name, so the client keeps
   the name from earlier tool_call updates for the same tool-call id, falls
   back to the agent's own naming in rawInput, treats an "execute" kind as the
   shell (which the deny policy covers), and refuses anything it still cannot
   name: a call whose identity cannot be resolved is not evaluated against the
   wildcard allow policy, it is rejected.

   What is recorded: the authority decision itself is on the audit chain
   (GET /audit/events?eventType=authority.evaluated). A refusal or escalation
   is recorded as an interaction at once, because the call never happens. An
   allowed call is recorded only when ACP reports its terminal status
   (tool_call_update completed or failed), correlated by session and tool-call
   id, so the chain never says "completed" for a call that failed or was
   cancelled.

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

/* What the agent has told us about each tool call, by tool-call id: the name as it was first
   reported, its kind, and the decision once one was made. Terminal updates close the record. */
const calls = new Map();
const call = (id) => { if (!calls.has(id)) calls.set(id, { name: null, kind: null, decision: null, recorded: false }); return calls.get(id); };
const SHELL_KINDS = new Set(["execute"]);

/* The canonical tool name, or null when it cannot be resolved. Never the category. */
function resolveName(toolCall, known) {
  const explicit = toolCall.name || toolCall.rawInput?.tool || toolCall.rawInput?.name || toolCall._meta?.toolName || null;
  const name = explicit || known.name || null;
  if (name && /^[A-Za-z0-9_.:-]{1,80}$/.test(String(name))) return String(name);
  const kind = toolCall.kind || known.kind;
  if (SHELL_KINDS.has(kind)) return "shell";        // an execute call is a shell call whatever it is titled; the deny policy names it
  return null;
}

/* The interaction record for a terminal update, once, correlated by tool-call id. */
async function recordTerminal(sessionId, id, status, c) {
  if (c.recorded) return;
  c.recorded = true;
  const outcome = status === "completed" ? "completed" : "refused";
  await igl("POST", "/audit/interactions", { identityId: AGENT, purpose, outcome, reason: `tool.${c.name} over ACP in session ${sessionId}: ${status} (decision ${c.decision?.decisionId ?? "n/a"})` }).catch((e) => process.stderr.write(`[igl] could not record ${id}: ${e.message}\n`));
}

/** @type {acp.Client} */
const client = {
  async requestPermission({ sessionId, toolCall, options }) {
    const pick = (kind) => options.find((o) => o.kind === kind);
    const reject = () => { const r = pick("reject_once") || pick("reject_always"); return r ? { outcome: "selected", optionId: r.optionId } : { outcome: "cancelled" }; };
    const c = call(toolCall.toolCallId);
    if (toolCall.kind) c.kind = toolCall.kind;
    const tool = resolveName(toolCall, c);
    if (!tool) {
      process.stderr.write(`\n[igl] refused tool call ${toolCall.toolCallId} ("${toolCall.title ?? ""}", kind ${toolCall.kind ?? "unknown"}): its tool name could not be resolved, so it was not evaluated\n`);
      c.recorded = true;
      await igl("POST", "/audit/interactions", { identityId: AGENT, purpose, outcome: "refused", reason: `unidentified tool call over ACP in session ${sessionId}: kind ${toolCall.kind ?? "unknown"}, title ${toolCall.title ?? ""}` }).catch(() => {});
      return { outcome: reject() };
    }
    c.name = tool;
    let decision;
    try {
      decision = await igl("POST", "/authority/evaluate", {
        actor: { identityId: AGENT },
        action: `tool.${tool}`,
        resource: { type: "tool", id: tool, attributes: { kind: toolCall.kind ?? null, title: toolCall.title ?? null } },
        context: { sessionId, toolCallId: toolCall.toolCallId, protocol: "acp" },
      });
      if (!decision || typeof decision.effect !== "string" || !Array.isArray(decision.reasonCodes)) throw new Error("malformed decision");
    } catch (e) {
      /* Evaluation failed: the gate fails closed. */
      process.stderr.write(`\n[igl] could not evaluate tool.${tool}: ${e.message}; refused\n`);
      c.recorded = true;
      await igl("POST", "/audit/interactions", { identityId: AGENT, purpose, outcome: "refused", reason: `tool.${tool} over ACP: evaluation failed, ${String(e.message).slice(0, 200)}` }).catch(() => {});
      return { outcome: reject() };
    }
    c.decision = decision;
    const why = `${decision.reasonCodes.join(", ")} (decision ${decision.decisionId})`;
    if (decision.effect === "allow" && pick("allow_once")) {
      /* Allowed. The decision is already on the audit chain; the interaction is recorded when the call ends. */
      return { outcome: { outcome: "selected", optionId: pick("allow_once").optionId } };
    }
    const recorded = decision.effect === "deny" ? "refused" : "escalated";
    process.stderr.write(`\n[igl] ${decision.effect} tool.${tool}: ${why}\n`);
    c.recorded = true;
    await igl("POST", "/audit/interactions", { identityId: AGENT, purpose, outcome: recorded, reason: `tool.${tool} over ACP, ${why}` }).catch(() => {});
    return { outcome: reject() };
  },

  async sessionUpdate({ sessionId, update }) {
    if (update.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") process.stdout.write(update.content.text);
    if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
      const c = call(update.toolCallId);
      if (update.kind) c.kind = update.kind;
      const name = update.name || update.rawInput?.tool || update.rawInput?.name || update._meta?.toolName;
      if (name && !c.name) c.name = String(name);
      if (update.status === "completed" || update.status === "failed") {
        if (c.decision?.effect === "allow") await recordTerminal(sessionId, update.toolCallId, update.status, c);
        else if (!c.recorded) process.stderr.write(`[igl] tool call ${update.toolCallId} reached ${update.status} without a permission request; nothing recorded\n`);
      }
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
