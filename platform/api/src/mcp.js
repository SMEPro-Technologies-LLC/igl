/* Model Context Protocol endpoint: POST /v1/mcp (JSON-RPC 2.0, Streamable
   HTTP, single response per request). The seven tools documented at
   id-me.ai map one to one onto contract operations and run through the
   same handlers, so a model caller and an application get the same
   projection under the same purpose, with the same receipt.

     whoami               GET /identities/me?purpose=
     list_purposes        GET /purposes
     get_identity_context GET /identities/{id}/projection
     explain_projection   GET /identities/{id}/projection/explain
     list_obligations     GET /identities/{id}/obligations
     search_graph         GET /identities?q=  (+ POST /graph/paths when fromId and toId are given)
     record_interaction   POST /audit/interactions

   Authentication is the same as REST: Authorization: Bearer <key or token>
   and X-IGL-Tenant-Id. Each tool call is checked against the scopes of the
   operation it maps to. */

import { handlers } from "./handlers.js";
import { ROUTES, CONTRACT_VERSION } from "./routes.generated.js";
import { ApiError } from "./lib/http.js";

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_INFO = { name: "igl_identity_mcp", version: "1.4.0" };

export const TOOLS = [
  { name: "whoami", description: "Resolve the calling identity under a purpose and return its projection: the nodes an application may see, what was withheld, and a signed governance receipt.", inputSchema: { type: "object", properties: { purpose: { type: "string", description: "Purpose profile id, from list_purposes. Defaults to the tenant's default profile." } } }, op: "whoami" },
  { name: "list_purposes", description: "List the purpose profiles available to this key and what each permits.", inputSchema: { type: "object", properties: {} }, op: "listPurposes" },
  { name: "get_identity_context", description: "Project a named identity under a purpose, with node budget and depth.", inputSchema: { type: "object", required: ["identityId", "purpose"], properties: { identityId: { type: "string" }, purpose: { type: "string" }, nodeBudget: { type: "integer" }, maxDepth: { type: "integer" } } }, op: "getIdentityProjection" },
  { name: "explain_projection", description: "Every node considered for a projection, with the four gates it passed or failed and the first failure.", inputSchema: { type: "object", required: ["identityId", "purpose"], properties: { identityId: { type: "string" }, purpose: { type: "string" }, nodeBudget: { type: "integer" }, maxDepth: { type: "integer" } } }, op: "explainIdentityProjection" },
  { name: "list_obligations", description: "Obligations in scope for an identity under a purpose that permits them. Each carries attested or proposed status; proposed is not a confirmed date. Paged: pass the returned page.nextCursor as cursor for the next page.", inputSchema: { type: "object", required: ["identityId", "purpose"], properties: { identityId: { type: "string" }, purpose: { type: "string" }, status: { type: "string", enum: ["attested", "proposed"] }, dueBefore: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200, description: "Page size, default 50." }, cursor: { type: "string", description: "page.nextCursor from the previous call." } } }, op: "listObligations" },
  { name: "search_graph", description: "Find identities by name or alias (paged: pass page.nextCursor as cursor); with fromId and toId, find governed paths between two identities.", inputSchema: { type: "object", properties: { q: { type: "string" }, type: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200, description: "Page size, default 25." }, cursor: { type: "string", description: "page.nextCursor from the previous call." }, fromId: { type: "string" }, toId: { type: "string" }, maxHops: { type: "integer" } } }, op: "listIdentities" },
  { name: "record_interaction", description: "Record what the model did with a projection: completed, refused, proceeded on truncated or empty context, or escalated. Metadata only.", inputSchema: { type: "object", required: ["purpose", "outcome"], properties: { identityId: { type: "string" }, purpose: { type: "string" }, outcome: { type: "string", enum: ["completed", "refused", "proceeded_on_truncated", "proceeded_on_empty", "escalated"] }, reason: { type: "string" }, projectionReceiptId: { type: "string" }, runId: { type: "string" }, model: { type: "string" } } }, op: "recordInteraction" },
];

export function routeFor(operationId) { return ROUTES.find((r) => r.operationId === operationId); }

/* Run a contract operation in-process for a tool call. */
async function invoke(h, operationId, { params = {}, query = {}, body = null }) {
  const route = routeFor(operationId);
  const url = new URL(h.url.origin + "/v1" + route.path.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(params[k] ?? "")));
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const handler = handlers[operationId];
  return handler({ ...h, url, params, body, route });
}

export async function toolCall(h, name, args, checkScopes) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new ApiError(404, "Unknown tool", `No tool named ${name}.`);
  checkScopes(routeFor(tool.op));
  const a = args || {};
  switch (name) {
    case "whoami": return (await invoke(h, "whoami", { query: { purpose: a.purpose || h.principal.tenantSettings.defaultPurpose || "identity-introduction" } })).body;
    case "list_purposes": return (await invoke(h, "listPurposes", {})).body;
    case "get_identity_context": return (await invoke(h, "getIdentityProjection", { params: { identityId: a.identityId }, query: { purpose: a.purpose, nodeBudget: a.nodeBudget, maxDepth: a.maxDepth } })).body;
    case "explain_projection": return (await invoke(h, "explainIdentityProjection", { params: { identityId: a.identityId }, query: { purpose: a.purpose, nodeBudget: a.nodeBudget, maxDepth: a.maxDepth } })).body;
    case "list_obligations": return (await invoke(h, "listObligations", { params: { identityId: a.identityId }, query: { purpose: a.purpose, status: a.status, dueBefore: a.dueBefore, limit: a.limit, cursor: a.cursor } })).body;
    case "search_graph": {
      if (a.fromId && a.toId) { checkScopes(routeFor("findGraphPaths")); return { paths: (await invoke(h, "findGraphPaths", { body: { fromId: a.fromId, toId: a.toId, maxHops: a.maxHops || 4 } })).body }; }
      return (await invoke(h, "listIdentities", { query: { q: a.q, type: a.type, limit: a.limit || 25, cursor: a.cursor } })).body;
    }
    case "record_interaction": return (await invoke(h, "recordInteraction", { body: { identityId: a.identityId, purpose: a.purpose, outcome: a.outcome, reason: a.reason, projectionReceiptId: a.projectionReceiptId, runId: a.runId, model: a.model } })).body;
  }
}

const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message, data) => ({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });

export async function handleMcp(h, msg, checkScopes) {
  if (!msg || msg.jsonrpc !== "2.0") return { status: 400, body: rpcError(msg?.id ?? null, -32600, "invalid JSON-RPC 2.0 request") };
  if (msg.id === undefined || msg.id === null) return { status: 202, body: null };   // notification
  switch (msg.method) {
    case "initialize": return { status: 200, body: rpcResult(msg.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { ...SERVER_INFO, contract: CONTRACT_VERSION } }) };
    case "ping": return { status: 200, body: rpcResult(msg.id, {}) };
    case "tools/list": return { status: 200, body: rpcResult(msg.id, { tools: TOOLS.map(({ op, ...t }) => t) }) };
    case "tools/call": {
      const { name, arguments: args } = msg.params || {};
      try {
        const out = await toolCall(h, name, args, checkScopes);
        return { status: 200, body: rpcResult(msg.id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out, isError: false }) };
      } catch (err) {
        if (err instanceof ApiError) return { status: 200, body: rpcResult(msg.id, { content: [{ type: "text", text: `${err.title}: ${err.detail || err.message}` }], isError: true }) };
        throw err;
      }
    }
    default: return { status: 200, body: rpcError(msg.id, -32601, `method not found: ${msg.method}`) };
  }
}
