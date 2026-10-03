// Model access. Two transports:
//  1. Inside the Claude artifact viewer: window.claude.use("sample") (no key needed).
//  2. Anywhere else: the user's Anthropic API key, calling the Messages API directly from the browser
//     with streaming, structured JSON outputs (output_config.format) and server-side refusal fallbacks.

import { setting } from "./db.js";

export const MODELS = {
  "claude-opus-5-5": { name: "Claude Opus 5.5", input: 4, output: 20, fallbacks: true, effort: true, tier: "complex" },
  "claude-sonnet-5-5": { name: "Claude Sonnet 5.5", input: 2, output: 10, fallbacks: true, effort: true, tier: "default" },
  "claude-haiku-4-5": { name: "Claude Haiku 4.5", input: 1, output: 5, fallbacks: false, effort: false, tier: "quick" }
};
export const DEFAULT_MODEL = "claude-opus-5-5";

let sample = null;
let mode = "connecting";
export async function connect() {
  if (typeof window !== "undefined" && window.claude && typeof window.claude.use === "function") {
    try { sample = await window.claude.use("sample"); } catch (_) { sample = null; }
  }
  mode = sample ? "claude" : "apikey";
  return mode;
}
export const transport = () => mode;
export async function hasKey() { return mode === "claude" || !!(await setting("apikey")); }

export class ModelError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function costOf(model, usage) {
  const m = MODELS[model] || MODELS[DEFAULT_MODEL];
  return ((usage.input_tokens || 0) * m.input + (usage.output_tokens || 0) * m.output) / 1e6;
}

async function readSSE(res, onText) {
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", text = "", usage = { input_tokens: 0, output_tokens: 0 }, stop = null, stopDetails = null, model = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const data = chunk.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("");
      if (!data) continue;
      let ev; try { ev = JSON.parse(data); } catch (_) { continue; }
      if (ev.type === "message_start") { usage.input_tokens += ev.message.usage?.input_tokens || 0; model = ev.message.model; }
      else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") { text += ev.delta.text; onText && onText(text); }
      else if (ev.type === "message_delta") { if (ev.usage?.output_tokens) usage.output_tokens = ev.usage.output_tokens; if (ev.delta?.stop_reason) stop = ev.delta.stop_reason; if (ev.delta?.stop_details) stopDetails = ev.delta.stop_details; }
      else if (ev.type === "error") throw new ModelError(ev.error?.type || "upstream_error", ev.error?.message || "Stream error");
    }
  }
  return { text, usage, stop, stopDetails, model };
}

/**
 * Call the model. Returns { text, usage, cost, model, structured }.
 * `schema` (optional) requests JSON that matches it; if the API rejects the schema, the call is
 * retried once without it and the caller validates the JSON client-side.
 */
export async function callModel({ system, messages, model = DEFAULT_MODEL, effort, schema, maxTokens = 16000, signal, onText }) {
  if (mode === "connecting") await connect();
  if (mode === "claude" && sample) {
    const tier = (MODELS[model] || MODELS[DEFAULT_MODEL]).tier;
    const input = [{ role: "user", content: "Standing instructions for this whole conversation:\n\n" + system + (schema ? "\n\nReply with only a JSON value matching this JSON Schema:\n" + JSON.stringify(schema) : "") }, ...messages];
    try {
      const r = await sample(input, { signal, onText: onText ? ({ text }) => onText(text) : undefined, modelTier: tier, cache: false });
      const usage = { input_tokens: Math.round((system.length + JSON.stringify(messages).length) / 4), output_tokens: Math.round(r.text.length / 4), estimated: true };
      return { text: r.text, usage, cost: costOf(model, usage), model: "claude (" + tier + ")", structured: false };
    } catch (e) { throw new ModelError(e.code || "upstream_error", e.message || String(e)); }
  }
  const key = await setting("apikey");
  if (!key) throw new ModelError("no_key", "Add an Anthropic API key in Settings to run agents.");
  const spec = MODELS[model] || MODELS[DEFAULT_MODEL];
  let useFallbacks = spec.fallbacks;
  const attempt = async useSchema => {
    const body = { model, max_tokens: maxTokens, system, messages, stream: true };
    const oc = {};
    if (spec.effort && effort) oc.effort = effort;
    if (useSchema && schema) oc.format = { type: "json_schema", schema };
    if (Object.keys(oc).length) body.output_config = oc;
    const headers = { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" };
    if (useFallbacks) { body.fallbacks = "default"; headers["anthropic-beta"] = "server-side-fallback-2026-07-01"; }
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal, headers, body: JSON.stringify(body) });
    if (!res.ok) {
      let msg = res.status + " " + res.statusText, type = "http";
      try { const j = await res.json(); msg = j.error?.message || msg; type = j.error?.type || type; } catch (_) {}
      const err = new ModelError(res.status === 429 ? "rate_limited" : res.status === 401 ? "bad_key" : res.status >= 500 || res.status === 529 ? "upstream_error" : type, msg);
      err.status = res.status;
      throw err;
    }
    return readSSE(res, onText);
  };
  let r, structured = !!schema;
  for (let i = 0; ; i++) {
    try { r = await attempt(structured); break; }
    catch (e) {
      if (i >= 2 || e.status !== 400) throw e;
      if (useFallbacks && /fallback|anthropic-beta|beta/i.test(e.message)) useFallbacks = false;
      else if (structured && /schema|output_config|format/i.test(e.message)) structured = false;
      else throw e;
    }
  }
  if (r.stop === "refusal") throw new ModelError("refused", "The model declined this request" + (r.stopDetails?.category ? ` (${r.stopDetails.category})` : "") + ".");
  if (r.stop === "max_tokens") throw new ModelError("max_tokens", "Reply was cut off at the token limit.");
  return { text: r.text, usage: r.usage, cost: costOf(model, r.usage), model: r.model || model, structured };
}

// Retry wrapper for transient failures (429/5xx/network), with backoff.
export async function callWithRetry(args, { retries = 2 } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try { return await callModel(args); }
    catch (e) {
      last = e;
      if (e.name === "AbortError" || !["rate_limited", "upstream_error", "overloaded_error", "api_error"].includes(e.code) && !(e instanceof TypeError)) throw e;
      await new Promise(r => setTimeout(r, 1500 * 2 ** i));
    }
  }
  throw last;
}
