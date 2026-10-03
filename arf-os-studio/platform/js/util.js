// Shared helpers with no DOM dependency (usable from the page, a worker, and Node tests).

export function uuidv7() {
  const ms = BigInt(Date.now());
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  for (let i = 0; i < 6; i++) b[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Canonical JSON: sorted keys, so equal objects hash equally.
export function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return "{" + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}

export async function sha256(input) {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
}
export const hashObject = o => sha256(canonical(o));

// Deterministic PRNG (mulberry32) so Monte Carlo and sampling are reproducible from a seed.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const nowIso = () => new Date().toISOString();
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const sum = a => a.reduce((s, x) => s + x, 0);
export const mean = a => (a.length ? sum(a) / a.length : NaN);
export function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function quantile(a, q) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return s[lo] + (s[hi] - s[lo]) * (p - lo);
}
export function stdev(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(sum(a.map(x => (x - m) ** 2)) / (a.length - 1));
}

// Timeframe strings follow TradingView: "1".."720" minutes, "1D", "1W".
export function timeframeMs(tf) {
  const s = String(tf).toUpperCase();
  if (/^\d+$/.test(s)) return +s * 60_000;
  const m = s.match(/^(\d*)([DW])$/);
  if (m) return (+(m[1] || 1)) * (m[2] === "D" ? 86_400_000 : 7 * 86_400_000);
  throw new Error("Unknown timeframe " + tf);
}

export function fmt(x, d = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  if (!Number.isFinite(x)) return x > 0 ? "∞" : "−∞";
  return x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
export const pct = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? "—" : fmt(x, d) + "%");
export const isoDate = t => new Date(t).toISOString().slice(0, 10);
export const isoMinute = t => new Date(t).toISOString().slice(0, 16).replace("T", " ");
