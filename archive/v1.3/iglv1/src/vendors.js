/* Multi-vendor model adapters for the IGL v1.0 runtime.

   The point of this file: prove IGL governs AI, not one model. Each adapter asks
   a different vendor's model to score the admissible governed actions, then maps
   that to the distribution FUSE consumes. IGL then constrains and receipts the
   result identically regardless of which vendor produced the scores.

   Honesty rules enforced here:
   - A vendor runs LIVE only if its API key is present in the environment.
   - With no key, that vendor is reported as skipped, never faked.
   - A separate mock adapter exists for demonstrating the harness offline, and it
     is always labelled MOCK by the caller. It never carries a vendor's name as
     if it were a real call.

   Model ids change often. Each vendor reads its model from an env override and
   falls back to a documented default; the harness prints which was used. Set the
   override to your current model. */

import { VOCAB } from "./iosplus.js";
import { sha256 } from "./sign.js";

/* The governed action set the model is asked to score. ABSTAIN is always
   offered (a forced choice from a constrained set otherwise invents confidence). */
export const ACTIONS = VOCAB;

export const VENDORS = [
  { id: "openai",   label: "OpenAI",         kind: "openai",    env: "OPENAI_API_KEY",   base: "https://api.openai.com/v1",        modelEnv: "OPENAI_MODEL",   model: "gpt-4.1-mini" },
  { id: "anthropic",label: "Anthropic",      kind: "anthropic", env: "ANTHROPIC_API_KEY",base: "https://api.anthropic.com/v1",     modelEnv: "ANTHROPIC_MODEL",model: "claude-3-7-sonnet-latest" },
  { id: "google",   label: "Google Gemini",  kind: "google",    env: "GEMINI_API_KEY",   base: "https://generativelanguage.googleapis.com/v1beta", modelEnv: "GEMINI_MODEL", model: "gemini-2.5-flash" },
  { id: "xai",      label: "xAI Grok",       kind: "openai",    env: "XAI_API_KEY",      base: "https://api.x.ai/v1",              modelEnv: "XAI_MODEL",      model: "grok-2-latest" },
  { id: "mistral",  label: "Mistral",        kind: "openai",    env: "MISTRAL_API_KEY",  base: "https://api.mistral.ai/v1",        modelEnv: "MISTRAL_MODEL",  model: "mistral-large-latest" },
  { id: "deepseek", label: "DeepSeek",       kind: "openai",    env: "DEEPSEEK_API_KEY", base: "https://api.deepseek.com/v1",       modelEnv: "DEEPSEEK_MODEL", model: "deepseek-chat" },
  { id: "llama",    label: "Meta Llama (Groq)", kind: "openai", env: "GROQ_API_KEY",     base: "https://api.groq.com/openai/v1",    modelEnv: "GROQ_MODEL",     model: "llama-3.3-70b-versatile" },
];

export function availableVendors(envObj = process.env) {
  return VENDORS.map(v => ({ ...v, hasKey: !!envObj[v.env], model: envObj[v.modelEnv] || v.model }));
}

const SYS = `You are selecting a governed action. You will be given a request and a fixed list of allowed actions. Score EACH action from 0.0 to 1.0 by how appropriate it is. Return ONLY a strict JSON object mapping every action to its score, no prose.`;

function buildUserPrompt(prompt) {
  return `Request:\n${prompt}\n\nAllowed actions: ${ACTIONS.join(", ")}\nReturn JSON like {"allow":0.1,"deny":0.0,...} covering every action.`;
}

function scoresToDist(scores) {
  const vals = ACTIONS.map(a => {
    const s = Number(scores?.[a]);
    return Number.isFinite(s) && s >= 0 ? s : 0;
  });
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum === 0) return ACTIONS.map(() => 1 / ACTIONS.length);
  return vals.map(v => v / sum);
}

function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

/* ---- vendor callers, each using that vendor's real API shape ---- */
async function callOpenAICompatible(v, prompt, key) {
  const res = await fetch(`${v.base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: v.model, temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYS }, { role: "user", content: buildUserPrompt(prompt) }],
    }),
  });
  if (!res.ok) throw new Error(`${v.label} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return extractJson(j.choices?.[0]?.message?.content);
}

async function callAnthropic(v, prompt, key) {
  const res = await fetch(`${v.base}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: v.model, max_tokens: 512, temperature: 0,
      system: SYS,
      messages: [{ role: "user", content: buildUserPrompt(prompt) }],
    }),
  });
  if (!res.ok) throw new Error(`${v.label} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const text = (j.content || []).map(c => c.text || "").join("");
  return extractJson(text);
}

async function callGoogle(v, prompt, key) {
  const url = `${v.base}/models/${v.model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYS }] },
      contents: [{ role: "user", parts: [{ text: buildUserPrompt(prompt) }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`${v.label} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const text = j.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
  return extractJson(text);
}

/* Build a live adapter for a vendor. Returns async (call) -> { dist, raw, mode }. */
export function liveAdapter(v, envObj = process.env) {
  const key = envObj[v.env];
  if (!key) throw new Error(`${v.label}: no ${v.env} in environment`);
  return async (call) => {
    let scores;
    if (v.kind === "anthropic") scores = await callAnthropic(v, call.prompt, key);
    else if (v.kind === "google") scores = await callGoogle(v, call.prompt, key);
    else scores = await callOpenAICompatible(v, call.prompt, key);
    return { dist: scoresToDist(scores), raw: scores, mode: "LIVE" };
  };
}

/* Deterministic mock adapter for offline demonstration. Distinct per vendor id so
   the harness shows different models proposing different actions, all governed
   identically. The caller labels these MOCK; this never claims to be a real call. */
export function mockAdapter(v) {
  return async (call) => {
    const scores = {};
    for (const a of ACTIONS) {
      const h = parseInt(sha256(`${v.id}|${a}|${call.prompt}`).slice(0, 8), 16);
      scores[a] = (h % 1000) / 1000;
    }
    return { dist: scoresToDist(scores), raw: scores, mode: "MOCK" };
  };
}

/* Resolve every distinct AI_INFER prompt in a program to a distribution using an
   async adapter, so the synchronous interpreter can run with a cached lookup. */
export async function resolveDistributions(program, adapter) {
  const prompts = new Set();
  const walk = (stmts) => { for (const s of stmts || []) collect(s); };
  const collect = (n) => {
    if (!n || typeof n !== "object") return;
    if (n.kind === "AiInfer" && n.prompt?.kind === "Str") prompts.add(n.prompt.value);
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === "object") collect(v);
    }
  };
  walk(program.body);
  const cache = new Map();
  let mode = "LIVE", raws = {};
  for (const p of prompts) { const out = await adapter({ prompt: p }); cache.set(p, out.dist); mode = out.mode; raws[p] = out.raw; }
  return { cache, mode, raws };
}

export function cachedInvoke(cache) {
  return (call) => ({ dist: cache.get(call.prompt) || VOCAB.map(() => 1 / VOCAB.length) });
}
