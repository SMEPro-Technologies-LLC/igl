/* igl/mcp: the four guarantees around the tool calls of an agent you already run.

   Model Context Protocol clients call tools; servers serve them. This module wraps either side
   without depending on the MCP SDK: anything with a `callTool({ name, arguments })` method is a
   client, and any `tools/call` request handler is a server-side handler. Each call is:

     identified   the caller is resolved in the IdentityRuntime (actor and role);
     bounded      the call's boundary, derived from the tool name and arguments by `boundaryOf`, is
                  validated by the UDMRuntime; a tool outside the declared boundary does not run;
     intended     the intent for the call, from `intentOf` (default Call_Tool), is on the record;
     traced       a trace is written to the journal through the IOSRuntime, with an Ed25519 receipt
                  when a signer is configured; a refusal or a failed call is a journaled failure.

   Refusals are IGLErrors with the runtime's codes (IGL_UNKNOWN_ACTOR, IGL_ROLE_DENIED,
   IGL_BOUNDARY_REJECTED, IGL_TOOL_REFUSED). Nothing is forwarded before the identity and the
   boundary have passed, and a call whose tool name cannot be read is refused rather than guessed.
   Only the argument digest enters the trace: arguments and results stay out of the journal.

     import { govern } from "igl/mcp";
     const client = govern(mcpClient, {
       identity, udm, ios, signer,
       actor: ["Agent", "Operator"],
       boundaryOf: (name, args) => [{ key: "Jurisdiction", value: args.state }],
     });
     const r = await client.callTool({ name: "file_report", arguments: { state: "TX-RRC" } });
     r._meta.igl   // { traceId, receipt }

   Server side: `governHandler(handler, options)` wraps a tools/call handler `(request, extra) => result`
   the same way, resolving the actor from `extra` (or the request) with `actorOf`. */
import { IGLError } from "./lexer.js";
import { IdentityRuntime, UDMRuntime, IOSRuntime } from "./runtime.js";
import { sha256, canonical } from "./sign.js";

const DEFAULTS = Object.freeze({ intent: "Call_Tool", channels: ["Tools"] });

/** @typedef {{ identity?: any, udm?: any, ios?: any, signer?: any, actor?: string[]|((call:any)=>string[]), boundaryOf?: (name:string, args:any, call:any)=>Array<{key:string,value:any}>, intentOf?: (name:string, args:any)=>string, allow?: (name:string, args:any)=>boolean, now?: ()=>string, traceId?: ()=>string }} GovernOptions */

function settings(options = {}) {
  const identity = options.identity || new IdentityRuntime();
  const udm = options.udm || new UDMRuntime();
  const ios = options.ios || new IOSRuntime();
  let seq = 0;
  return {
    identity, udm, ios,
    signer: options.signer || null,
    actor: options.actor || ["Agent"],
    boundaryOf: options.boundaryOf || (() => []),
    intentOf: options.intentOf || (() => DEFAULTS.intent),
    allow: options.allow || null,
    now: options.now || (() => new Date().toISOString()),
    traceId: options.traceId || (() => `TRC-MCP-${String(++seq).padStart(6, "0")}`),
  };
}

const toolName = (call) => (call && typeof call.name === "string" && /^[A-Za-z0-9_.:/-]{1,120}$/.test(call.name) ? call.name : null);
const argsOf = (call) => (call && call.arguments && typeof call.arguments === "object" ? call.arguments : {});

/* The gate. Returns what the trace needs; throws an IGLError that has already been journaled. */
async function admit(s, call, actorPath) {
  const name = toolName(call);
  const fail = (message, code, phase, actor = null, intent = null) => {
    const e = new IGLError(message, { phase, code });
    try { s.ios.recordFailure({ actor, intent, code, phase, message }); } catch { /* the refusal stands even if the record does not */ }
    return e;
  };
  if (!name) throw fail("refusing a tool call whose name cannot be read", "IGL_TOOL_REFUSED", "mcp");
  const args = argsOf(call);
  let ident;
  try { ident = s.identity.resolve(actorPath); }
  catch (e) { throw fail(e.message, e.code || "IGL_UNKNOWN_ACTOR", "identity", actorPath?.[0] ?? null); }
  const intent = String(s.intentOf(name, args) || DEFAULTS.intent);
  if (s.allow && !s.allow(name, args)) throw fail(`tool ${name} is not permitted for ${ident.id}`, "IGL_TOOL_REFUSED", "mcp", ident.actor, intent);
  let boundary;
  try {
    const declared = s.boundaryOf(name, args, call) || [];
    if (!Array.isArray(declared)) throw new IGLError("boundaryOf must return an array of {key, value}", { phase: "udm", code: "IGL_BOUNDARY_REJECTED" });
    boundary = s.udm.validateBoundary(declared);
  } catch (e) { throw fail(e.message, e.code || "IGL_BOUNDARY_REJECTED", "udm", ident.actor, intent); }
  return { name, args, ident, intent, boundary };
}

function writeTrace(s, admitted, { started, status, error = null }) {
  /** @type {any} */
  const trace = {
    id: s.traceId(),
    at: started,
    finished: s.now(),
    identity: { id: admitted.ident.id, actor: admitted.ident.actor, role: admitted.ident.role },
    boundary: admitted.boundary,
    intent: admitted.intent,
    params: { tool: admitted.name, argsDigest: sha256(canonical(admitted.args)) },
    channels: [...DEFAULTS.channels],
    assertions: [{ assertion: "tool_call", tool: admitted.name, status, attestation: "deterministic", confidence: 1 }],
    attestation: "deterministic",
    confidence: 1,
    depth: 0,
    reuseCount: 0,
    state: status === "committed" ? "committed" : "failed",
    outputs: [],
    ...(error ? { error: { code: error.code || null, message: String(error.message || error).slice(0, 500) } } : {}),
  };
  if (s.signer) trace.receipt = s.signer.receiptForTrace(trace);
  s.ios.write(trace);
  return trace;
}

async function governedCall(s, call, actorPath, forward) {
  const started = s.now();
  const admitted = await admit(s, call, actorPath);
  let result;
  try { result = await forward(); }
  catch (e) {
    const trace = writeTrace(s, admitted, { started, status: "failed", error: e });
    if (typeof s.ios.flush === "function") await s.ios.flush();
    if (e && typeof e === "object") { try { e.igl = { traceId: trace.id, receipt: trace.receipt || null }; } catch { /* frozen error */ } }
    throw e;
  }
  const trace = writeTrace(s, admitted, { started, status: "committed" });
  if (typeof s.ios.flush === "function") await s.ios.flush();
  const igl = { traceId: trace.id, receipt: trace.receipt || null };
  if (result && typeof result === "object" && !Array.isArray(result)) return { ...result, _meta: { ...(result._meta || {}), igl } };
  return { result, _meta: { igl } };
}

/**
 * Wrap an MCP client: every `callTool` is identified, bounded, intended and traced before it is forwarded.
 * Every other property of the client is reachable unchanged.
 * @param {any} client  anything with callTool({ name, arguments, ... })
 * @param {GovernOptions} [options]
 */
export function govern(client, options = {}) {
  if (!client || typeof client.callTool !== "function") throw new IGLError("govern() needs a client with a callTool method", { phase: "mcp", code: "IGL_TOOL_REFUSED" });
  const s = settings(options);
  const actorFor = (call) => (typeof s.actor === "function" ? s.actor(call) : s.actor);
  const callTool = (call, ...rest) => governedCall(s, call, actorFor(call), () => client.callTool(call, ...rest));
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "callTool") return callTool;
      if (prop === "igl") return { ios: s.ios, journal: s.ios.journal || null };
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

/**
 * Wrap a server-side tools/call handler `(request, extra) => result`. The actor comes from `options.actorOf(request, extra)`
 * (default: options.actor); the tool name and arguments from `request.params`.
 * @param {(request:any, extra?:any)=>any} handler
 * @param {GovernOptions & { actorOf?: (request:any, extra?:any)=>string[] }} [options]
 */
export function governHandler(handler, options = {}) {
  if (typeof handler !== "function") throw new IGLError("governHandler() needs a handler function", { phase: "mcp", code: "IGL_TOOL_REFUSED" });
  const s = settings(options);
  const actorOf = options.actorOf || (() => (typeof s.actor === "function" ? s.actor() : s.actor));
  const wrapped = (request, extra) => governedCall(s, request?.params, actorOf(request, extra), () => handler(request, extra));
  wrapped.igl = { ios: s.ios, journal: s.ios.journal || null };
  return wrapped;
}
