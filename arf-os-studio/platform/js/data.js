// Market data: public OHLCV fetchers, CSV import, integrity checks and dataset checksums
// (spec §7.10). Only confirmed (closed) bars are kept.

import { timeframeMs, sha256, isoMinute } from "./util.js";

export const SOURCES = {
  binance: { name: "Binance spot (public data API)", tf: { "1": "1m", "3": "3m", "5": "5m", "15": "15m", "30": "30m", "60": "1h", "120": "2h", "240": "4h", "360": "6h", "480": "8h", "720": "12h", "1D": "1d", "1W": "1w" }, example: "BTCUSDT" },
  coinbase: { name: "Coinbase Exchange (public)", tf: { "1": 60, "5": 300, "15": 900, "60": 3600, "360": 21600, "1D": 86400 }, example: "BTC-USD" }
};

export function emptyBars() { return { t: [], o: [], h: [], l: [], c: [], v: [] }; }

async function getJSON(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
  return res.json();
}

export async function fetchBars({ source, symbol, timeframe, from, to = Date.now(), signal, onProgress = () => {} }) {
  const tfMs = timeframeMs(timeframe);
  const rows = [];
  if (String(source).startsWith("builtin")) {
    // Crypto from Binance: on the website, take live bars (up to the latest close); the Claude app can't
    // reach Binance, so it uses the built-in file.
    const [, under, remote] = String(source).split(":");
    const canFetch = typeof window !== "undefined" && !(window.claude && typeof window.claude.use === "function") && !/claudeusercontent|claude\.ai/.test(location.hostname);
    if (under === "binance" && canFetch && SOURCES.binance.tf[timeframe]) {
      try { const live = await fetchBars({ source: "binance", symbol: remote || symbol, timeframe, from, to, signal, onProgress }); if (live.t.length) { live.live = true; return live; } } catch (_) { /* fall back to the built-in file */ }
    }
    // Built-in library (refreshed daily): the newest file for this market and timeframe.
    const set = (await builtinPrices())?.sets.find(s => s.symbol === symbol && s.timeframe === timeframe);
    if (!set) throw new Error(`No built-in ${symbol} ${timeframe} prices`);
    const { bars } = await loadBuiltin(set.file);
    const out = emptyBars();
    for (let i = 0; i < bars.t.length; i++) if (bars.t[i] >= from && bars.t[i] <= to) for (const k of ["t", "o", "h", "l", "c", "v"]) out[k].push(bars[k][i]);
    onProgress(out.t.length);
    return out;
  }
  if (source === "binance") {
    const interval = SOURCES.binance.tf[timeframe];
    if (!interval) throw new Error(`Binance does not support timeframe ${timeframe}`);
    let start = from;
    while (start < to) {
      const url = `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(symbol.toUpperCase())}&interval=${interval}&startTime=${start}&endTime=${to}&limit=1000`;
      const data = await getJSON(url, signal);
      if (!Array.isArray(data) || !data.length) break;
      for (const k of data) if (k[6] < Date.now()) rows.push([k[0], +k[1], +k[2], +k[3], +k[4], +k[5]]);
      onProgress(rows.length);
      const last = data[data.length - 1][0];
      if (data.length < 1000 || last + tfMs <= start) break;
      start = last + tfMs;
    }
  } else if (source === "coinbase") {
    const g = SOURCES.coinbase.tf[timeframe];
    if (!g) throw new Error(`Coinbase does not support timeframe ${timeframe}`);
    const span = g * 1000 * 300;
    for (let s = from; s < to; s += span) {
      const e = Math.min(to, s + span);
      const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol.toUpperCase())}/candles?granularity=${g}&start=${new Date(s).toISOString()}&end=${new Date(e).toISOString()}`;
      const data = await getJSON(url, signal);
      for (const k of data) { const t = k[0] * 1000; if (t + g * 1000 <= Date.now() && t >= from) rows.push([t, k[3], k[2], k[1], k[4], k[5]]); }
      onProgress(rows.length);
      await new Promise(r => setTimeout(r, 120)); // stay well under the public rate limit
    }
  } else throw new Error("Unknown source " + source);
  // Paged requests overlap at their boundaries; keep one row per timestamp (CSV uploads are not deduped).
  const seen = new Set();
  return rowsToBars(rows.filter(r => !seen.has(r[0]) && seen.add(r[0])));
}

export function rowsToBars(rows) {
  rows.sort((a, b) => a[0] - b[0]);
  const b = emptyBars();
  for (const r of rows) { b.t.push(r[0]); b.o.push(r[1]); b.h.push(r[2]); b.l.push(r[3]); b.c.push(r[4]); b.v.push(r[5] ?? 0); }
  return b;
}

// CSV with a header containing time/open/high/low/close[/volume]. Time may be ISO, unix s or ms.
export function parseOhlcCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(/[,;\t]/).map(s => s.trim().toLowerCase().replace(/"/g, ""));
  const col = names => head.findIndex(h => names.some(n => h === n || h.startsWith(n)));
  const ti = col(["time", "date", "timestamp", "open time"]), oi = col(["open"]), hi = col(["high"]), li = col(["low"]), ci = col(["close"]), vi = col(["volume", "vol"]);
  if ([ti, oi, hi, li, ci].some(i => i < 0)) throw new Error("CSV needs time, open, high, low and close columns");
  const rows = [];
  for (let k = 1; k < lines.length; k++) {
    const f = lines[k].split(/[,;\t]/).map(s => s.trim().replace(/"/g, ""));
    if (f.length < head.length - 1) continue;
    rows.push([parseTime(f[ti]), +f[oi], +f[hi], +f[li], +f[ci], vi >= 0 ? +f[vi] : 0]);
  }
  return rowsToBars(rows.filter(r => Number.isFinite(r[0])));
}
// Text form of a dataset for moving it between the website and the Claude artifact by copy/paste.
export const QUICK_DATA = [["BTCUSDT", "240"], ["ETHUSDT", "240"], ["SOLUSDT", "240"], ["PAXGUSDT", "240"], ["BTCUSDT", "60"], ["BTCUSDT", "1D"]];
// Binance pairs offered in the symbol box. PAXG is a token backed 1:1 by physical gold and tracks spot gold.
export const BINANCE_SYMBOLS = [["BTCUSDT", "Bitcoin"], ["ETHUSDT", "Ethereum"], ["SOLUSDT", "Solana"], ["PAXGUSDT", "Gold (PAXG, gold-backed token)"], ["BNBUSDT", "BNB"], ["XRPUSDT", "XRP"], ["DOGEUSDT", "Dogecoin"], ["ADAUSDT", "Cardano"], ["AVAXUSDT", "Avalanche"], ["LINKUSDT", "Chainlink"], ["LTCUSDT", "Litecoin"], ["DOTUSDT", "Polkadot"], ["TRXUSDT", "TRON"], ["SUIUSDT", "Sui"], ["TONUSDT", "Toncoin"]];
export const symbolLabel = s => (s === "PAXGUSDT" ? "Gold" : s.replace(/USDT$/, ""));
// Map common non-crypto names in a strategy (gold) to the closest free Binance pair.
export function suggestSymbol(name) {
  const n = String(name || "").toUpperCase();
  if (/XAU|GOLD|PAXG/.test(n)) return "PAXGUSDT";
  const m = n.match(/([A-Z]{2,10})USDT?/); return m ? m[1] + "USDT" : null;
}
// Built-in price library (data/index.json, refreshed daily by .github/workflows/prices.yml).
let builtinCache = null;
export async function builtinPrices() {
  if (!builtinCache) builtinCache = fetch("data/index.json", { cache: "no-cache" }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const m = await builtinCache; if (!m) builtinCache = null;
  return m;
}
export async function loadBuiltin(file) {
  const res = await fetch("data/" + file);
  if (!res.ok) throw new Error(`${res.status} loading ${file}`);
  return parseDataText(await res.text());
}
// Which built-in market matches a strategy's symbol (XAUUSD, OANDA:XAUUSD, GOLD, BTCUSDT.P …).
export function matchBuiltin(name, sets) {
  const n = String(name || "").toUpperCase().replace(/^[A-Z]+:/, "").replace(/\.P$|PERP$/, "");
  if (!n || !sets) return null;
  const alias = /XAU|GOLD/.test(n) ? "XAUUSD" : /XAG|SILVER/.test(n) ? "XAGUSD" : /NAS|NDX|US100|NQ/.test(n) ? "NAS100" : /SPX|US500|SP500|ES1/.test(n) ? "SPX500" : /US30|DJI|DOW/.test(n) ? "US30" : /WTI|USOIL|CL1/.test(n) ? "USOIL" : n;
  return sets.find(s => s.symbol === alias) || sets.find(s => s.symbol === alias + "T") || sets.find(s => s.symbol === n.replace(/USDT?$/, "") + "USDT") || null;
}
// Realistic trading costs per market. Slippage is about half the typical broker spread (you pay
// roughly half the spread on the way in and half on the way out), expressed in the dataset's ticks.
const HALF_SPREAD = { XAUUSD: 0.10, XAGUSD: 0.015, EURUSD: 0.00006, GBPUSD: 0.00008, AUDUSD: 0.00006, USDJPY: 0.007, GBPJPY: 0.015, NAS100: 0.75, SPX500: 0.25, US30: 1.5, USOIL: 0.015 };
export function realisticCosts(symbol, tickSize, price, current = {}) {
  const sym = String(symbol || "").toUpperCase().replace(/^[A-Z]+:/, "");
  const tick = tickSize > 0 ? tickSize : 0.01;
  const half = HALF_SPREAD[sym] ?? (price > 0 ? price * 0.0001 : tick); // crypto and others: 0.01% of price
  const slippageTicks = Math.max(1, Math.ceil(half / tick - 1e-9));
  const commissionValue = current.commissionValue > 0 ? current.commissionValue : 0.01;
  const label = HALF_SPREAD[sym] !== undefined ? `about half a typical ${sym} spread` : "about 0.01% of the price";
  return { slippageTicks, commissionValue, tickSize: tick, note: `${slippageTicks} ticks of slippage (${label})${current.commissionValue > 0 ? "" : " and 0.01% commission"}` };
}
export const costsLookUnrealistic = sdl => !(sdl?.costs?.slippageTicks > 0) || !(sdl?.costs?.commissionValue > 0);

export function encodeDataset(ds, bars) {
  const head = `#ARF-DATA v1 source=${ds.source} symbol=${ds.symbol} timeframe=${ds.timeframe} tick=${ds.tickSize}`;
  const rows = [];
  for (let i = 0; i < bars.t.length; i++) rows.push(`${bars.t[i]},${bars.o[i]},${bars.h[i]},${bars.l[i]},${bars.c[i]},${bars.v[i]}`);
  return `${head}\ntime,open,high,low,close,volume\n${rows.join("\n")}`;
}
export function parseDataText(text) {
  text = String(text || "").trim();
  const meta = {};
  const m = text.match(/^#ARF-DATA v1([^\n]*)\n/);
  if (m) { for (const kv of m[1].trim().split(/\s+/)) { const [k, v] = kv.split("="); if (k) meta[k] = v; } text = text.slice(m[0].length); }
  if (!/^[^\n]*(time|date)/i.test(text)) throw new Error("This doesn't look like price data. Paste the text copied with \"Copy for Claude\", or CSV text with a header row (time, open, high, low, close, volume).");
  return { meta, bars: parseOhlcCsv(text) };
}

export function parseTime(s) {
  if (/^\d{12,}$/.test(s)) return +s;
  if (/^\d{9,11}$/.test(s)) return +s * 1000;
  const d = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");
  return d;
}

// A gap counts as "market closed" (not missing data) on session markets (forex, metals, indices)
// when it spans a weekend, or is a short daily break / holiday of at most a day.
const closedGap = (a, b) => b - a <= 86_400_000 * 1.5 || [...Array(Math.ceil((b - a) / 86_400_000) + 1).keys()].some(k => [0, 6].includes(new Date(a + k * 86_400_000).getUTCDay()));
export function integrityReport(bars, timeframe, { market = "24x7" } = {}) {
  const errors = [], warnings = [], n = bars.t.length;
  const tfMs = timeframeMs(timeframe);
  let dup = 0, outOfOrder = 0, gaps = 0, missing = 0, biggest = 0, bad = 0, zeroVol = 0, firstGap = null;
  for (let i = 0; i < n; i++) {
    const { o, h, l, c, v } = { o: bars.o[i], h: bars.h[i], l: bars.l[i], c: bars.c[i], v: bars.v[i] };
    if (!(o > 0 && h > 0 && l > 0 && c > 0) || h < Math.max(o, c) - 1e-12 || l > Math.min(o, c) + 1e-12 || h < l) bad++;
    if (!(v > 0)) zeroVol++;
    if (i === 0) continue;
    const d = bars.t[i] - bars.t[i - 1];
    if (d === 0) dup++;
    else if (d < 0) outOfOrder++;
    else if (d > tfMs * 1.5 && tfMs < 86_400_000 * 7 && !(market === "sessions" && closedGap(bars.t[i - 1], bars.t[i]))) {
      // Daily+ bars on 24/7 crypto have no weekend gaps; intraday gaps are counted as missing bars.
      gaps++; const m = Math.round(d / tfMs) - 1; missing += m; if (m > biggest) { biggest = m; firstGap = bars.t[i - 1]; }
    }
  }
  if (n < 500) errors.push(`Insufficient history: ${n} bars (need ≥ 500)`);
  else if (n < 2000) warnings.push(`Short history: ${n} bars`);
  if (dup) errors.push(`${dup} duplicate bars`);
  if (outOfOrder) errors.push(`${outOfOrder} out-of-order bars`);
  if (bad) errors.push(`${bad} bars with impossible OHLC values`);
  const missPct = n ? (missing / (n + missing)) * 100 : 0;
  if (missPct > 5) errors.push(`${missing} missing bars (${missPct.toFixed(1)}%) — above the 5% policy threshold`);
  else if (missing) warnings.push(`${missing} missing bars in ${gaps} gaps (${missPct.toFixed(2)}%); largest ${biggest} bars after ${isoMinute(firstGap)}`);
  if (zeroVol / Math.max(1, n) > 0.05 && !(market === "sessions" && zeroVol === n)) warnings.push(`${zeroVol} zero-volume bars (${((zeroVol / n) * 100).toFixed(1)}%)`);
  return {
    bars: n, from: bars.t[0], to: bars.t[n - 1], duplicates: dup, outOfOrder, gaps, missing, missingPct: missPct, largestGapBars: biggest, badOhlc: bad, zeroVolume: zeroVol,
    errors, warnings, status: errors.length ? "QUARANTINED" : warnings.length ? "WARN" : "OK"
  };
}

export async function datasetChecksum(bars) {
  const parts = [];
  for (let i = 0; i < bars.t.length; i++) parts.push(`${bars.t[i]},${bars.o[i]},${bars.h[i]},${bars.l[i]},${bars.c[i]},${bars.v[i]}`);
  return sha256(parts.join("\n"));
}

// Infer a sensible tick size from price magnitudes when the venue's filter is unknown.
export function inferTickSize(bars) {
  let maxDec = 0;
  for (let i = 0; i < Math.min(bars.c.length, 500); i++) {
    const s = String(bars.c[i]);
    const d = s.includes(".") ? s.split(".")[1].replace(/0+$/, "").length : 0;
    maxDec = Math.max(maxDec, d);
  }
  return +Math.pow(10, -Math.min(maxDec, 8)).toFixed(Math.min(maxDec, 8));
}
