// Indicator library matching Pine Script v6 `ta.*` semantics, including warm-up seeding
// (ema/rma seed with an SMA of the first `length` values). Inputs are plain arrays; NaN = na.

const nanArr = n => new Float64Array(n).fill(NaN);

export function source(bars, name) {
  const { o, h, l, c, v } = bars, n = c.length;
  switch (name) {
    case "open": return o;
    case "high": return h;
    case "low": return l;
    case "close": return c;
    case "volume": return v;
    case "hl2": return Float64Array.from({ length: n }, (_, i) => (h[i] + l[i]) / 2);
    case "hlc3": return Float64Array.from({ length: n }, (_, i) => (h[i] + l[i] + c[i]) / 3);
    case "ohlc4": return Float64Array.from({ length: n }, (_, i) => (o[i] + h[i] + l[i] + c[i]) / 4);
  }
  throw new Error("Unknown source " + name);
}

export function sma(x, n) {
  const out = nanArr(x.length);
  let s = 0, cnt = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (Number.isNaN(v)) { s = 0; cnt = 0; continue; }
    s += v; cnt++;
    if (cnt > n) { s -= x[i - n]; cnt = n; }
    if (cnt === n) out[i] = s / n;
  }
  return out;
}

function seededRecursive(x, n, alpha) {
  const out = nanArr(x.length);
  let prev = NaN, s = 0, cnt = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (Number.isNaN(v)) { out[i] = prev; continue; }
    if (Number.isNaN(prev)) {
      s += v; cnt++;
      if (cnt === n) { prev = s / n; out[i] = prev; }
      continue;
    }
    prev = alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}
export const ema = (x, n) => seededRecursive(x, n, 2 / (n + 1));
export const rma = (x, n) => seededRecursive(x, n, 1 / n);

export function wma(x, n) {
  const out = nanArr(x.length), denom = (n * (n + 1)) / 2;
  for (let i = n - 1; i < x.length; i++) {
    let s = 0, bad = false;
    for (let k = 0; k < n; k++) { const v = x[i - k]; if (Number.isNaN(v)) { bad = true; break; } s += v * (n - k); }
    if (!bad) out[i] = s / denom;
  }
  return out;
}

export function stdevPop(x, n) {
  const out = nanArr(x.length), m = sma(x, n);
  for (let i = n - 1; i < x.length; i++) {
    if (Number.isNaN(m[i])) continue;
    let s = 0;
    for (let k = 0; k < n; k++) s += (x[i - k] - m[i]) ** 2;
    out[i] = Math.sqrt(s / n);
  }
  return out;
}

export function highest(x, n) {
  const out = nanArr(x.length);
  for (let i = n - 1; i < x.length; i++) { let m = -Infinity; for (let k = 0; k < n; k++) m = Math.max(m, x[i - k]); out[i] = m; }
  return out;
}
export function lowest(x, n) {
  const out = nanArr(x.length);
  for (let i = n - 1; i < x.length; i++) { let m = Infinity; for (let k = 0; k < n; k++) m = Math.min(m, x[i - k]); out[i] = m; }
  return out;
}

export function change(x) {
  const out = nanArr(x.length);
  for (let i = 1; i < x.length; i++) out[i] = x[i] - x[i - 1];
  return out;
}

export function rsi(x, n) {
  const ch = change(x), up = nanArr(x.length), dn = nanArr(x.length);
  for (let i = 1; i < x.length; i++) { up[i] = Math.max(ch[i], 0); dn[i] = Math.max(-ch[i], 0); }
  const ru = rma(up, n), rd = rma(dn, n), out = nanArr(x.length);
  for (let i = 0; i < x.length; i++) {
    if (Number.isNaN(ru[i]) || Number.isNaN(rd[i])) continue;
    out[i] = rd[i] === 0 ? 100 : ru[i] === 0 ? 0 : 100 - 100 / (1 + ru[i] / rd[i]);
  }
  return out;
}

export function trueRange(bars) {
  const { h, l, c } = bars, out = new Float64Array(c.length);
  for (let i = 0; i < c.length; i++) out[i] = i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  return out;
}
export const atr = (bars, n) => rma(trueRange(bars), n);

export function roc(x, n) {
  const out = nanArr(x.length);
  for (let i = n; i < x.length; i++) out[i] = x[i - n] === 0 ? NaN : (100 * (x[i] - x[i - n])) / x[i - n];
  return out;
}

export function adx(bars, n) {
  const { h, l } = bars, len = h.length;
  const plusDM = nanArr(len), minusDM = nanArr(len);
  for (let i = 1; i < len; i++) {
    const up = h[i] - h[i - 1], down = l[i - 1] - l[i];
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }
  const tr = trueRange(bars); tr[0] = NaN;
  const trur = rma(tr, n), p = rma(plusDM, n), m = rma(minusDM, n), dx = nanArr(len);
  for (let i = 0; i < len; i++) {
    if (Number.isNaN(trur[i]) || Number.isNaN(p[i]) || Number.isNaN(m[i])) continue;
    const pl = (100 * p[i]) / trur[i], mi = (100 * m[i]) / trur[i], s = pl + mi;
    dx[i] = Math.abs(pl - mi) / (s === 0 ? 1 : s);
  }
  const a = rma(dx, n);
  return a.map(v => 100 * v);
}

// Volume-weighted average of `src` since the first bar of each UTC day (resets daily).
// Days are keyed by bar open time; a day with zero volume so far falls back to the source value.
export function vwapDaily(bars, src) {
  const out = nanArr(src.length);
  let day = null, pv = 0, vv = 0;
  for (let i = 0; i < src.length; i++) {
    const d = Math.floor(bars.t[i] / 86_400_000);
    if (d !== day) { day = d; pv = 0; vv = 0; }
    const v = bars.v[i] || 0;
    pv += src[i] * v; vv += v;
    out[i] = vv > 0 ? pv / vv : src[i];
  }
  return out;
}

// Compute one SDL indicator. `val(spec)` resolves numbers or parameter references.
export function computeIndicator(ind, bars, val, cache) {
  const len = val(ind.length), fast = val(ind.fast), slow = val(ind.slow), sig = val(ind.signal), mult = val(ind.mult);
  const key = [ind.type, ind.source, len, fast, slow, sig, mult].join("|");
  if (cache && cache.has(key)) return cache.get(key);
  const src = ind.source ? source(bars, ind.source) : null;
  const L = Math.max(1, Math.round(len || 0));
  let out;
  switch (ind.type) {
    case "ema": out = ema(src, L); break;
    case "sma": out = sma(src, L); break;
    case "rma": out = rma(src, L); break;
    case "wma": out = wma(src, L); break;
    case "rsi": out = rsi(src, L); break;
    case "atr": out = atr(bars, L); break;
    case "highest": out = highest(src, L); break;
    case "lowest": out = lowest(src, L); break;
    case "stdev": out = stdevPop(src, L); break;
    case "bb_upper": case "bb_lower": {
      const m = sma(src, L), sd = stdevPop(src, L), k = ind.type === "bb_upper" ? 1 : -1;
      out = m.map((x, i) => x + k * mult * sd[i]);
      break;
    }
    case "roc": out = roc(src, L); break;
    case "zscore": { const m = sma(src, L), sd = stdevPop(src, L); out = m.map((x, i) => (sd[i] === 0 ? NaN : (src[i] - x) / sd[i])); break; }
    case "macd": case "macd_signal": {
      const f = ema(src, Math.round(fast)), s = ema(src, Math.round(slow));
      const line = f.map((x, i) => x - s[i]);
      out = ind.type === "macd" ? line : ema(line, Math.round(sig));
      break;
    }
    case "adx": out = adx(bars, L); break;
    case "volume_sma": out = sma(bars.v, L); break;
    case "vwap_daily": out = vwapDaily(bars, src); break;
    default: throw new Error("Unsupported indicator " + ind.type);
  }
  if (cache) cache.set(key, out);
  return out;
}
