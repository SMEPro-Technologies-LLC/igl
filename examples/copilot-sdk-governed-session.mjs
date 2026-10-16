/* A GitHub Copilot SDK session governed by IGL.

   The Copilot SDK (@github/copilot-sdk) exposes session hooks that fire
   before and after every tool the agent calls. This example wires three of
   them to the IGL platform so that:

     onSessionStart   the agent is told which IGL identity it acts as and
                      that every tool call is evaluated by policy;
     onPreToolUse     each tool call is sent to POST /authority/evaluate as
                      the action `tool.<name>`; "allow" lets it run, "deny"
                      refuses it with the decision id and reason codes, and
                      "escalate" or "conditional" turns into an "ask" so a
                      person decides;
     onPostToolUse    each completed tool call is recorded with
                      POST /audit/interactions, metadata only.

   IGL fails closed: with no policy, `tool.*` actions are denied with the
   reason code `no_policy`. `--setup` creates the agent identity and two
   active policies (allow `tool.*`, deny `tool.bash`, `tool.shell` and
   `tool.powershell`) and prints the identity id to put in IGL_AGENT_ID.
   Policies are immutable once created; run --setup once per tenant.

   Environment:
     IGL_API_BASE    default https://sandbox.id-me.ai/v1
     IGL_API_KEY     an igl_test_ key from POST /sandbox/signup
     IGL_TENANT_ID   the tenant the key belongs to
     IGL_AGENT_ID    the agent identity created by --setup

   Needs Node 20.19+ or 22.12+, a Copilot subscription, and
   `npm install @github/copilot-sdk` (not a dependency of this repository).

   Usage:
     node examples/copilot-sdk-governed-session.mjs --setup
     node examples/copilot-sdk-governed-session.mjs "List the files in this directory"

   Every decision and interaction this example causes is on the tenant's
   audit chain: GET /audit/events?eventType=authority.evaluated shows the
   decisions, and GET /audit/receipts/{receiptId} returns any receipt. */

import { CopilotClient } from "@github/copilot-sdk";

const BASE = (process.env.IGL_API_BASE || "https://sandbox.id-me.ai/v1").replace(/\/$/, "");
const KEY = process.env.IGL_API_KEY;
const TENANT = process.env.IGL_TENANT_ID;
if (!KEY || !TENANT) { console.error("Set IGL_API_KEY and IGL_TENANT_ID (POST /sandbox/signup issues both)."); process.exit(2); }

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

/* ---------------- one-time setup ---------------- */
async function setup() {
  const agent = await igl("POST", "/identities", {
    type: "agent",
    displayName: "Copilot SDK session",
    attributes: { runtime: "@github/copilot-sdk" },
  });
  const allow = await igl("POST", "/policies", {
    name: "copilot-tools-allow", version: "1", status: "active", effect: "allow",
    description: "Copilot SDK sessions may call tools that are not refused elsewhere.",
    rule: { actions: ["tool.*"], resourceTypes: ["tool"], reasonCode: "copilot_tool_allowed" },
  });
  const deny = await igl("POST", "/policies", {
    name: "copilot-no-shell", version: "1", status: "active", effect: "deny",
    description: "Copilot SDK sessions never get a shell.",
    rule: { actions: ["tool.bash", "tool.shell", "tool.powershell"], resourceTypes: ["tool"], reasonCode: "shell_not_permitted" },
  });
  console.log(`agent identity ${agent.id}\npolicies ${allow.id} (allow tool.*), ${deny.id} (deny shell)\n\nexport IGL_AGENT_ID=${agent.id}`);
}

/* ---------------- the governed session ---------------- */
async function run(prompt) {
  const AGENT = process.env.IGL_AGENT_ID;
  if (!AGENT) { console.error("Set IGL_AGENT_ID (run with --setup first)."); process.exit(2); }
  const identity = await igl("GET", `/identities/${AGENT}`);
  const purposes = await igl("GET", "/purposes");
  const purpose = (purposes.items.find((p) => p.default) || purposes.items[0]).id;

  const client = new CopilotClient();
  const session = await client.createSession({
    /* Copilot's own permission prompt is answered by the IGL decision in onPreToolUse,
       so nothing here is approved without a policy saying so. */
    onPermissionRequest: async () => ({ kind: "approve-once" }),
    hooks: {
      onSessionStart: async () => ({
        additionalContext:
          `You act as IGL identity ${identity.id} ("${identity.displayName}") in tenant ${TENANT}. ` +
          `Every tool call is evaluated against the tenant's policies before it runs. ` +
          `A refusal carries a decision id; report it to the user instead of retrying.`,
      }),

      onPreToolUse: async (input, { sessionId }) => {
        const decision = await igl("POST", "/authority/evaluate", {
          actor: { identityId: AGENT },
          action: `tool.${input.toolName}`,
          resource: { type: "tool", id: input.toolName },
          context: { sessionId, workingDirectory: input.workingDirectory, agentId: input.agentId ?? null },
        });
        const why = `${decision.reasonCodes.join(", ")} (decision ${decision.decisionId})`;
        if (decision.effect === "allow") return { permissionDecision: "allow" };
        if (decision.effect === "deny") return { permissionDecision: "deny", permissionDecisionReason: `IGL refused tool.${input.toolName}: ${why}` };
        const needs = decision.requiredApprovals.map((a) => a.authorityType).join(", ") || "a person";
        return { permissionDecision: "ask", permissionDecisionReason: `IGL ${decision.effect}: ${why}; needs ${needs}` };
      },

      onPostToolUse: async (input, { sessionId }) => {
        await igl("POST", "/audit/interactions", {
          identityId: AGENT,
          purpose,
          outcome: "completed",
          reason: `tool.${input.toolName} in Copilot session ${sessionId}`,
        });
      },

      onPostToolUseFailure: async (input, { sessionId }) => {
        await igl("POST", "/audit/interactions", {
          identityId: AGENT,
          purpose,
          outcome: "refused",
          reason: `tool.${input.toolName} failed in Copilot session ${sessionId}: ${String(input.error).slice(0, 500)}`,
        });
      },
    },
  });

  session.on("assistant.message_delta", (event) => process.stdout.write(event.data.deltaContent ?? ""));
  await session.sendAndWait({ prompt });
  process.stdout.write("\n");
  await session.disconnect();
  await client.stop();
}

const args = process.argv.slice(2);
if (args[0] === "--setup") await setup();
else if (args.length) await run(args.join(" "));
else { console.error("Usage: --setup | \"<prompt>\""); process.exit(2); }
