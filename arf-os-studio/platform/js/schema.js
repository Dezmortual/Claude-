// Minimal JSON Schema validator for agent output contracts (spec §8.1: typed artefacts, not prose).
// Supports: type, properties, required, additionalProperties:false, items, enum, anyOf.

export function validate(schema, value, path = "$") {
  const errors = [];
  walk(schema, value, path, errors);
  return { ok: errors.length === 0, errors };
}

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function walk(s, v, p, errors) {
  if (!s) return;
  if (s.anyOf) {
    const ok = s.anyOf.some(sub => { const e = []; walk(sub, v, p, e); return e.length === 0; });
    if (!ok) errors.push(`${p}: does not match any allowed shape`);
    return;
  }
  if (s.type) {
    const t = typeOf(v), types = Array.isArray(s.type) ? s.type : [s.type];
    const match = types.some(x => x === t || (x === "number" && t === "integer"));
    if (!match) { errors.push(`${p}: expected ${types.join("|")}, got ${t}`); return; }
  }
  if (s.enum && !s.enum.includes(v)) errors.push(`${p}: must be one of ${s.enum.map(x => JSON.stringify(x)).join(", ")}`);
  if (s.type === "object" && v && typeof v === "object") {
    for (const r of s.required || []) if (!(r in v)) errors.push(`${p}.${r}: required`);
    for (const [k, sub] of Object.entries(s.properties || {})) if (k in v) walk(sub, v[k], `${p}.${k}`, errors);
    if (s.additionalProperties === false) for (const k of Object.keys(v)) if (!(k in (s.properties || {}))) errors.push(`${p}.${k}: unexpected field`);
  }
  if (s.type === "array" && Array.isArray(v) && s.items) v.forEach((x, i) => walk(s.items, x, `${p}[${i}]`, errors));
}

// Pull the first JSON object/array out of a model reply (tolerates code fences and leading prose).
export function extractJSON(text) {
  const t = String(text).trim();
  try { return JSON.parse(t); } catch (_) {}
  const fence = t.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (fence) try { return JSON.parse(fence[1]); } catch (_) {}
  const start = t.search(/[\[{]/);
  if (start < 0) throw new Error("No JSON found in reply");
  const open = t[start], close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return JSON.parse(t.slice(start, i + 1)); }
  }
  throw new Error("Unterminated JSON in reply");
}

// Shorthand builders that always emit API-compatible schemas (additionalProperties:false everywhere).
export const S = {
  str: (description) => ({ type: "string", ...(description ? { description } : {}) }),
  num: (description) => ({ type: "number", ...(description ? { description } : {}) }),
  int: (description) => ({ type: "integer", ...(description ? { description } : {}) }),
  bool: (description) => ({ type: "boolean", ...(description ? { description } : {}) }),
  enum: (values, description) => ({ type: "string", enum: values, ...(description ? { description } : {}) }),
  arr: (items, description) => ({ type: "array", items, ...(description ? { description } : {}) }),
  obj: (properties, optional = []) => ({ type: "object", properties, required: Object.keys(properties).filter(k => !optional.includes(k)), additionalProperties: false })
};
