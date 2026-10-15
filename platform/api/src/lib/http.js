/* Problem+json responses, body parsing, pagination cursors, validation helpers. */

import { sha256 } from "./crypto.js";

export class ApiError extends Error {
  constructor(status, title, detail, { code = null, violations = null, headers = {} } = {}) {
    super(detail || title);
    Object.assign(this, { status, title, detail, code, violations, headers });
  }
}

export const E = {
  badRequest: (d, o) => new ApiError(400, "Bad request", d, o),
  unauthorized: (d = "Present a valid bearer token or API key.") => new ApiError(401, "Unauthorized", d, { headers: { "www-authenticate": 'Bearer realm="igl"' } }),
  forbidden: (d, o) => new ApiError(403, "Forbidden", d, o),
  notFound: (d = "No such resource in this tenant.") => new ApiError(404, "Not found", d),
  conflict: (d, o) => new ApiError(409, "Conflict", d, o),
  unprocessable: (d, o) => new ApiError(422, "Unprocessable", d, o),
  tooMany: (retry) => new ApiError(429, "Too many requests", "Rate limit exceeded.", { headers: { "retry-after": String(retry) } }),
};

export function problem(err, traceId, instance) {
  const status = err.status || 500;
  const body = {
    type: err.code ? `https://id-me.ai/problems/${err.code}` : "about:blank",
    title: status >= 500 ? "Internal error" : err.title || "Error",
    status,
    detail: status >= 500 ? "The request could not be completed." : (err.detail || err.message || ""),
    instance,
    traceId,
  };
  if (err.violations) body.violations = err.violations;
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/problem+json", "cache-control": "no-store", "x-request-id": traceId, ...(err.headers || {}) },
  });
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
}

export async function readJson(request, { required = true } = {}) {
  const ct = request.headers.get("content-type") || "";
  const text = await request.text();
  if (!text.trim()) { if (required) throw E.badRequest("A JSON body is required."); return {}; }
  if (text.length > 1_000_000) throw new ApiError(413, "Payload too large", "Body exceeds 1 MB.");
  if (!/application\/json/i.test(ct)) throw E.badRequest("Content-Type must be application/json.");
  try { return JSON.parse(text); } catch { throw E.badRequest("Body is not valid JSON."); }
}

export const nowIso = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ---- validation, small and explicit; the contract's schemas are the source ---- */
export function validate(obj, spec, where = "body") {
  const violations = [];
  const req = spec.required || [];
  for (const k of req) if (obj[k] === undefined || obj[k] === null || obj[k] === "") violations.push({ field: k, code: "required", message: `${k} is required` });
  for (const [k, rule] of Object.entries(spec.fields || {})) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    if (rule.type === "string" && typeof v !== "string") violations.push({ field: k, code: "type", message: `${k} must be a string` });
    if (rule.type === "number" && typeof v !== "number") violations.push({ field: k, code: "type", message: `${k} must be a number` });
    if (rule.type === "integer" && !Number.isInteger(v)) violations.push({ field: k, code: "type", message: `${k} must be an integer` });
    if (rule.type === "boolean" && typeof v !== "boolean") violations.push({ field: k, code: "type", message: `${k} must be a boolean` });
    if (rule.type === "array" && !Array.isArray(v)) violations.push({ field: k, code: "type", message: `${k} must be an array` });
    if (rule.type === "object" && (typeof v !== "object" || Array.isArray(v))) violations.push({ field: k, code: "type", message: `${k} must be an object` });
    if (rule.enum && !rule.enum.includes(v)) violations.push({ field: k, code: "enum", message: `${k} must be one of ${rule.enum.join(", ")}` });
    if (rule.uuid && !UUID_RE.test(String(v))) violations.push({ field: k, code: "format", message: `${k} must be a UUID` });
    if (rule.max !== undefined && typeof v === "number" && v > rule.max) violations.push({ field: k, code: "maximum", message: `${k} must be at most ${rule.max}` });
    if (rule.min !== undefined && typeof v === "number" && v < rule.min) violations.push({ field: k, code: "minimum", message: `${k} must be at least ${rule.min}` });
    if (rule.maxLength && typeof v === "string" && v.length > rule.maxLength) violations.push({ field: k, code: "maxLength", message: `${k} is longer than ${rule.maxLength}` });
    if (rule.datetime && typeof v === "string" && Number.isNaN(Date.parse(v))) violations.push({ field: k, code: "format", message: `${k} must be an RFC 3339 date-time` });
  }
  if (violations.length) throw E.unprocessable(`The ${where} did not validate.`, { code: "validation", violations });
  return obj;
}

/* ---- pagination: opaque cursor over (created_at, id), newest first ---- */
export function pageParams(url) {
  let limit = Number(url.searchParams.get("limit") || 50);
  if (!Number.isInteger(limit) || limit < 1) throw E.badRequest("limit must be a positive integer.");
  if (limit > 200) limit = 200;
  const raw = url.searchParams.get("cursor");
  let cursor = null;
  if (raw) {
    try { cursor = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")); } catch { throw E.badRequest("cursor is not valid."); }
    if (!cursor || typeof cursor.t !== "string" || typeof cursor.i !== "string") throw E.badRequest("cursor is not valid.");
  }
  return { limit, cursor };
}
export function cursorWhere(cursor, tCol = "created_at", iCol = "id") {
  if (!cursor) return { clause: "", params: [] };
  return { clause: ` AND (${tCol} < ? OR (${tCol} = ? AND ${iCol} < ?))`, params: [cursor.t, cursor.t, cursor.i] };
}
export function pageOut(rows, limit, map, tKey = "created_at", iKey = "id") {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ t: last[tKey], i: last[iKey] })).toString("base64url") : null;
  return { items: items.map(map), page: { nextCursor, hasMore } };
}

export const parseJson = (s, fallback) => { if (s === null || s === undefined) return fallback; try { return JSON.parse(s); } catch { return fallback; } };
export const requestHash = (method, path, body) => sha256(method + " " + path + "\n" + (typeof body === "string" ? body : JSON.stringify(body ?? null)));
