/* MCP (Model Context Protocol) endpoint for the provisioning service —
   this is what ChatGPT's "Apps" model connects to. Streamable-HTTP flavour:
   JSON-RPC 2.0 over POST /mcp, stateless, no SSE session required.

   Tools:
     check_health       read-only — service + model status
     list_graphs        read-only — every provisioned graph, newest first
     get_graph          read-only — one graph by slug
     search / fetch     read-only — the pair read-only ChatGPT connectors expect
     provision_identity write     — resolve → fold → generate .igl → governed run

   Auth: when PROVISION_API_KEY is set, the MCP endpoint accepts it as either
   an Authorization bearer header or a ?key= query parameter (developer-mode
   connectors that cannot send custom headers can carry it in the URL). */

import { provisionIdentity, listProvisioned } from "./service.mjs";

const SERVER_INFO = { name: "igl-identity-graph-provisioning", version: "0.2.0" };
const PROTOCOL_VERSION = "2025-03-26";
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8787",
];
const ALLOWED_ORIGINS = new Set(
  (process.env.PROVISION_ALLOWED_ORIGINS
    ? process.env.PROVISION_ALLOWED_ORIGINS.split(",")
    : DEFAULT_ALLOWED_ORIGINS).map((o) => o.trim()).filter(Boolean),
);

const TOOLS = [
  {
    name: "check_health",
    description: "Check that the Identity Graph provisioning service and the AI model are warm.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_graphs",
    description: "List every provisioned Identity Graph (companies are BOUNDARY graphs, individuals are FOOTPRINT graphs), newest first, with journal chain status, footprint digest, and per-statement execution results.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_graph",
    description: "Get one provisioned Identity Graph by slug (kebab-case, e.g. example-energy-llc). Returns the runtime artifact: boot mode, journal head, footprint digest, statement results, receipt verification.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "Kebab-case graph slug" } },
      required: ["slug"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "search",
    description: "Search provisioned Identity Graphs by name/slug fragment. Read-only connector tool.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "fetch",
    description: "Fetch one provisioned Identity Graph by id (the graph slug). Read-only connector tool.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "identity_graph_whoami",
    description:
      "Recognize the caller. Returns the caller's own Identity Graph — their FOOTPRINT (individual) or BOUNDARY (company) — with journal chain status, footprint digest, and latest governed results. First contact seeds the graph from the registered profile; every contact after that replays the existing hash-chained journal instantly. Call this FIRST in every conversation to bind the session to the caller's identity graph before any other tool.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "provision_identity",
    description:
      "Provision an Identity Graph from a natural-language description of a company or individual. Deterministically resolves attributes, folds the identity graph into a hash-chained journal (one-time boot; repeat calls replay idempotently), generates the executable IGL program, and runs it with the model inside the compiled governance mask. For individuals, the second statement deliberately asserts an observed-but-never-granted action and is refused with IGL_FOOTPRINT_DENIED — that refusal is the governance proof, NOT an error.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "e.g. 'Example Energy, LLC is a Texas oil and gas operator' or 'Jordan Avery is a DFIR coordinator in Houston, Texas'" },
        kind: { type: "string", enum: ["BOUNDARY", "FOOTPRINT"], description: "Optional override; omit to let the resolver decide." },
        auto: { type: "boolean", description: "Provision a synthetic entity (description not required)." },
      },
    },
    annotations: { readOnlyHint: false },
  },
];

function summarize(graph) {
  if (!graph) return null;
  const { programSource, ...rest } = graph;
  return { ...rest, programSourceIncluded: false, note: "programSource stripped for transport; present in the .run.json artifact" };
}

async function callTool(name, args, caller) {
  switch (name) {
    case "identity_graph_whoami": {
      if (!caller) throw new Error("unrecognized caller — this session is not bound to a registered identity key");
      const { whoAmI } = await import("./service.mjs");
      return whoAmI(caller);
    }
    case "check_health":
      return { ok: true, model: "Xenova/distilgpt2", graphs: listProvisioned().length };
    case "list_graphs":
      return { graphs: listProvisioned().map(summarize) };
    case "get_graph": {
      const g = listProvisioned().find((x) => x.slug === args?.slug);
      if (!g) throw new Error(`no provisioned graph with slug "${args?.slug}"`);
      return summarize(g);
    }
    case "search": {
      const q = String(args?.query ?? "").toLowerCase();
      const hits = listProvisioned().filter((g) => g.slug.includes(q));
      return { results: hits.map((g) => ({ id: g.slug, title: `${g.slug} (${g.kind})`, url: `mcp://graphs/${g.slug}` })) };
    }
    case "fetch": {
      const g = listProvisioned().find((x) => x.slug === args?.id);
      if (!g) throw new Error(`no provisioned graph with id "${args?.id}"`);
      return { id: g.slug, title: `${g.slug} (${g.kind})`, text: JSON.stringify(summarize(g)), url: `mcp://graphs/${g.slug}` };
    }
    case "provision_identity": {
      // No description + recognized caller → provision the caller's OWN graph.
      const description = (args?.description || "").trim() || caller?.description || "";
      const kind = args?.kind ?? (description === caller?.description ? caller?.kind : null);
      if (!args?.auto && !description)
        throw new Error("description is required (or set auto=true)");
      const { resolved, runtime } = await provisionIdentity({
        description,
        kind,
        auto: !!args?.auto,
      });
      return { resolved, runtime: summarize(runtime) };
    }
    default:
      throw new Error(`unknown tool "${name}"`);
  }
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function corsHeaders(req, { exposeSession = false } = {}) {
  const origin = req.headers.origin;
  const headers = {
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,mcp-session-id",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["access-control-allow-origin"] = origin;
  if (exposeSession) headers["access-control-expose-headers"] = "mcp-session-id";
  return headers;
}

export async function handleMcp(req, res, body, caller = null) {
  const msg = body;
  if (!msg || msg.jsonrpc !== "2.0") {
    res.writeHead(400, { "content-type": "application/json", ...corsHeaders(req) });
    return res.end(JSON.stringify(rpcError(msg?.id ?? null, -32600, "invalid JSON-RPC 2.0 request")));
  }

  // Notifications (no id) → accepted, nothing returned.
  if (msg.id === undefined || msg.id === null) {
    res.writeHead(202, corsHeaders(req));
    return res.end();
  }

  try {
    switch (msg.method) {
      case "initialize":
        return sendJson(req, res, rpcResult(msg.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        }));
      case "ping":
        return sendJson(req, res, rpcResult(msg.id, {}));
      case "tools/list":
        return sendJson(req, res, rpcResult(msg.id, { tools: TOOLS }));
      case "tools/call": {
        const { name, arguments: args } = msg.params ?? {};
        try {
          const out = await callTool(name, args ?? {}, caller);
          return sendJson(req, res, rpcResult(msg.id, {
            content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
            isError: false,
          }));
        } catch (err) {
          return sendJson(req, res, rpcResult(msg.id, {
            content: [{ type: "text", text: String(err?.message ?? err) }],
            isError: true,
          }));
        }
      }
      default:
        return sendJson(req, res, rpcError(msg.id, -32601, `method not found: ${msg.method}`));
    }
  } catch (err) {
    return sendJson(req, res, rpcError(msg.id, -32603, String(err?.message ?? err)));
  }
}

function sendJson(req, res, payload) {
  res.writeHead(200, {
    "content-type": "application/json",
    ...corsHeaders(req, { exposeSession: true }),
  });
  res.end(JSON.stringify(payload));
}
