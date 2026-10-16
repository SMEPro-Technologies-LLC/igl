/* MCP (Model Context Protocol) endpoint for the provisioning service.
   Streamable-HTTP flavour: JSON-RPC 2.0 over POST /mcp, stateless.

   Tools:
     check_health            read-only, service + model status
     list_graphs             read-only, the caller's graphs (every tenant's for the service principal)
     get_graph               read-only, one graph by id, if the caller may read it
     search / fetch          read-only, the pair read-only connectors expect, scoped the same way
     identity_graph_whoami   read/write, the caller's OWN graph: seeds on first contact, replays after
     provision_identity      write, resolve to fold to generate .igl to governed run, stored under the caller's principal

   Auth (F-01/F-02): credentials in headers only (Authorization: Bearer or
   X-IGL-Caller-Key). Every call runs under an `auth` object from the gate;
   reads and writes are scoped to auth.tenant / auth.principal unless
   auth.admin (the service key). There is no query-string credential. */

import { provisionIdentity, listProvisioned, getProvisioned, searchProvisioned, whoAmI, modelInfo } from "./service.mjs";
import { allowedOrigins, corsHeaders, clientError } from "./auth.mjs";
const ORIGINS = allowedOrigins();

const SERVER_INFO = { name: "igl-identity-graph-provisioning", version: "0.3.0" };
const PROTOCOL_VERSION = "2025-03-26";

const TOOLS = [
  { name: "check_health", description: "Service and model status.", inputSchema: { type: "object", properties: {} } },
  { name: "list_graphs", description: "Graphs the caller may read, newest first.", inputSchema: { type: "object", properties: {} } },
  { name: "get_graph", description: "One graph by id, if the caller may read it.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "search", description: "Search the caller's graphs by slug, actor or kind.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "fetch", description: "Fetch one of the caller's graphs by id.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "identity_graph_whoami",
    description: "Recognize the caller. Returns the caller's own Identity Graph, FOOTPRINT (individual) or BOUNDARY (company), with journal chain status, footprint digest and latest governed results. First contact seeds the graph from the registered profile; every contact after that replays the hash-chained journal. Call this FIRST in every conversation.",
    inputSchema: { type: "object", properties: {} } },
  { name: "provision_identity",
    description: "Provision an Identity Graph from a natural-language description. Stored under the caller's own principal; the service key may pass an explicit owner.",
    inputSchema: { type: "object", properties: { description: { type: "string" }, kind: { type: "string", enum: ["BOUNDARY", "FOOTPRINT"] }, auto: { type: "boolean" }, owner: { type: "object", properties: { tenant: { type: "string" }, principal: { type: "string" } } } } } },
];

function summarize(g) {
  return { id: g.id, slug: g.slug, kind: g.kind, actor: g.actor, boot: g.boot, owner: g.owner, journal: g.journal, footprintDigest: g.footprintDigest,
    attestation: g.attestation ?? null, receiptVerification: g.receiptVerification, results: g.results, provisionedAt: g.provisionedAt };
}

function ownerFor(auth, requested) {
  if (auth?.admin && requested?.tenant && requested?.principal) return { tenant: requested.tenant, principal: requested.principal };
  if (!auth || !auth.tenant || !auth.principal) throw Object.assign(new Error("this session is not bound to a principal, present a registered caller key"), { status: 401 });
  return { tenant: auth.tenant, principal: auth.principal };
}

export async function callTool(name, args, auth) {
  switch (name) {
    case "check_health":
      return { ok: true, model: modelInfo(), graphs: listProvisioned(auth).length };
    case "list_graphs":
      return { graphs: listProvisioned(auth).map(summarize) };
    case "get_graph": {
      const g = getProvisioned(auth, args?.id);
      if (!g) throw Object.assign(new Error(`no readable graph with id "${args?.id}"`), { status: 404 });
      return summarize(g);
    }
    case "search":
      return { results: searchProvisioned(auth, args?.query).map((g) => ({ id: g.id, title: `${g.slug} (${g.kind})`, url: `mcp://graphs/${g.id}` })) };
    case "fetch": {
      const g = getProvisioned(auth, args?.id);
      if (!g) throw Object.assign(new Error(`no readable graph with id "${args?.id}"`), { status: 404 });
      return { id: g.id, title: `${g.slug} (${g.kind})`, text: JSON.stringify(summarize(g)), url: `mcp://graphs/${g.id}` };
    }
    case "identity_graph_whoami": {
      if (!auth?.caller) throw Object.assign(new Error("unrecognized caller, this session is not bound to a registered identity key"), { status: 401 });
      return whoAmI(auth.caller, ownerFor(auth));
    }
    case "provision_identity": {
      const owner = ownerFor(auth, args?.owner);
      const description = (args?.description || "").trim() || auth?.caller?.description || "";
      const kind = args?.kind ?? (description === auth?.caller?.description ? auth?.caller?.kind : null);
      if (!args?.auto && !description) throw Object.assign(new Error("description is required (or set auto=true)"), { status: 400 });
      const { resolved, runtime } = await provisionIdentity({ description, kind, auto: !!args?.auto, owner });
      return { resolved, runtime: summarize(runtime) };
    }
    default:
      throw Object.assign(new Error(`unknown tool "${name}"`), { status: 404 });
  }
}

function rpcResult(id, result) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }
function sendJson(req, res, body) {
  res.writeHead(200, { "content-type": "application/json", "x-content-type-options": "nosniff", ...corsHeaders(req, ORIGINS, { exposeSession: true }) });
  res.end(JSON.stringify(body));
}

export async function handleMcp(req, res, body, auth = null) {
  const msg = body;
  if (!msg || msg.jsonrpc !== "2.0") {
    res.writeHead(400, { "content-type": "application/json", ...corsHeaders(req, ORIGINS) });
    return res.end(JSON.stringify(rpcError(msg?.id ?? null, -32600, "invalid JSON-RPC 2.0 request")));
  }
  if (msg.id === undefined || msg.id === null) { res.writeHead(202, corsHeaders(req, ORIGINS)); return res.end(); }
  try {
    switch (msg.method) {
      case "initialize":
        return sendJson(req, res, rpcResult(msg.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO }));
      case "ping":
        return sendJson(req, res, rpcResult(msg.id, {}));
      case "tools/list":
        return sendJson(req, res, rpcResult(msg.id, { tools: TOOLS }));
      case "tools/call": {
        const { name, arguments: args } = msg.params ?? {};
        try {
          const out = await callTool(name, args ?? {}, auth);
          return sendJson(req, res, rpcResult(msg.id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], isError: false }));
        } catch (err) {
          return sendJson(req, res, rpcResult(msg.id, { content: [{ type: "text", text: clientError(err).message }], isError: true }));
        }
      }
      default:
        return sendJson(req, res, rpcError(msg.id, -32601, `method not found: ${msg.method}`));
    }
  } catch (err) {
    return sendJson(req, res, rpcError(msg.id, -32603, clientError(err).message));
  }
}
