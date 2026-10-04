// Refreshes the built-in price library in ../data (run by .github/workflows/prices.yml).
// The Claude app version of the platform cannot reach outside websites, so it loads prices from
// these files, which are published alongside the page. Crypto comes from Binance's public data API;
// gold, silver, forex, indices and oil come from Yahoo Finance charts (futures for metals and oil).
// Run: node tools/fetch-prices.mjs   (needs Node 20+ and internet access)
import fs from "node:fs";

const OUT = new URL("../data/", import.meta.url);
const H = 3_600_000, D = 86_400_000;
const MARKETS = [
  // symbol, label, group, source, remote id
  ["XAUUSD", "Gold", "Metals", "yahoo", "GC=F"],
  ["XAGUSD", "Silver", "Metals", "yahoo", "SI=F"],
  ["EURUSD", "EUR/USD", "Forex", "yahoo", "EURUSD=X"],
  ["GBPUSD", "GBP/USD", "Forex", "yahoo", "GBPUSD=X"],
  ["USDJPY", "USD/JPY", "Forex", "yahoo", "USDJPY=X"],
  ["AUDUSD", "AUD/USD", "Forex", "yahoo", "AUDUSD=X"],
  ["GBPJPY", "GBP/JPY", "Forex", "yahoo", "GBPJPY=X"],
  ["NAS100", "Nasdaq 100", "Indices", "yahoo", "^NDX"],
  ["SPX500", "S&P 500", "Indices", "yahoo", "^GSPC"],
  ["US30", "Dow Jones", "Indices", "yahoo", "^DJI"],
  ["USOIL", "Oil (WTI)", "Energy", "yahoo", "CL=F"],
  ["BTCUSDT", "Bitcoin", "Crypto", "binance", "BTCUSDT"],
  ["ETHUSDT", "Ethereum", "Crypto", "binance", "ETHUSDT"],
  ["SOLUSDT", "Solana", "Crypto", "binance", "SOLUSDT"],
  ["XRPUSDT", "XRP", "Crypto", "binance", "XRPUSDT"],
  ["BNBUSDT", "BNB", "Crypto", "binance", "BNBUSDT"],
  ["DOGEUSDT", "Dogecoin", "Crypto", "binance", "DOGEUSDT"],
  ["PAXGUSDT", "PAX Gold (24/7 token)", "Crypto", "binance", "PAXGUSDT"]
];
const NOTES = { yahoo: "Yahoo Finance", binance: "Binance spot" };

async function getJSON(url) {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (arf-os price refresh)" } });
    if (res.ok) return res.json();
    if (i >= 3) throw new Error(`${res.status} ${res.statusText} from ${url}`);
    await new Promise(r => setTimeout(r, 2000 * 2 ** i));
  }
}

async function binance(sym, interval, tfMs, days) {
  const rows = [], now = Date.now();
  for (let start = now - days * D; start < now; ) {
    const k = await getJSON(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${interval}&startTime=${start}&limit=1000`);
    if (!k.length) break;
    for (const r of k) if (r[6] < now) rows.push([r[0], +r[1], +r[2], +r[3], +r[4], +r[5]]);
    start = k[k.length - 1][0] + tfMs;
    if (k.length < 1000) break;
  }
  return rows;
}

async function yahoo(id, interval, range, tfMs) {
  const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(id)}?interval=${interval}&range=${range}&includePrePost=false`);
  const r = j.chart?.result?.[0];
  if (!r?.timestamp) throw new Error("no data for " + id);
  const q = r.indicators.quote[0], rows = [], now = Date.now();
  r.timestamp.forEach((s, i) => {
    let t = s * 1000;
    if (tfMs >= D) t = Math.floor(t / D) * D; // daily bars stamped at 00:00 UTC
    const row = [t, q.open[i], q.high[i], q.low[i], q.close[i], q.volume[i] || 0];
    if (row.slice(1, 5).some(v => v == null || !(v > 0))) return;
    if (t + tfMs > now) return; // drop the bar still forming
    row[2] = Math.max(row[2], row[1], row[4]); row[3] = Math.min(row[3], row[1], row[4]);
    if (rows.length && rows[rows.length - 1][0] === t) rows[rows.length - 1] = row; else rows.push(row);
  });
  return rows;
}

// Combine bars into larger UTC-aligned buckets (1h → 4h).
function aggregate(rows, tfMs) {
  const out = [];
  for (const [t, o, h, l, c, v] of rows) {
    const b = Math.floor(t / tfMs) * tfMs, last = out[out.length - 1];
    if (last && last[0] === b) { last[2] = Math.max(last[2], h); last[3] = Math.min(last[3], l); last[4] = c; last[5] += v; }
    else out.push([b, o, h, l, c, v]);
  }
  if (out.length && out[out.length - 1][0] + tfMs > Date.now()) out.pop();
  return out;
}

const decimals = rows => { const p = rows.length ? rows[rows.length - 1][4] : 1; return p >= 1000 ? 2 : p >= 10 ? 3 : p >= 1 ? 5 : 7; };
const tickOf = d => +(10 ** -d).toFixed(d);
function write(sym, tf, source, market, rows) {
  const d = decimals(rows), f = x => +x.toFixed(d);
  const head = `#ARF-DATA v1 source=${source} symbol=${sym} timeframe=${tf} tick=${tickOf(d)} market=${market}`;
  const body = rows.map(([t, o, h, l, c, v]) => `${t / 1000},${f(o)},${f(h)},${f(l)},${f(c)},${+v.toFixed(2)}`).join("\n");
  const file = `${sym}_${tf}.csv`;
  fs.writeFileSync(new URL(file, OUT), `${head}\ntime,open,high,low,close,volume\n${body}\n`);
  return { file, bars: rows.length, from: rows[0][0], to: rows[rows.length - 1][0] };
}

fs.mkdirSync(OUT, { recursive: true });
const prev = (() => { try { return JSON.parse(fs.readFileSync(new URL("index.json", OUT), "utf8")).sets; } catch (_) { return []; } })();
const sets = [], failures = [];
for (const [sym, label, group, src, id] of MARKETS) {
  const market = src === "binance" ? "24x7" : "sessions";
  const base = { symbol: sym, label, group, source: NOTES[src] + (src === "yahoo" ? ` (${id})` : ""), market };
  try {
    let series;
    if (src === "binance") series = { "60": await binance(id, "1h", H, 730), "240": await binance(id, "4h", 4 * H, 1095), "1D": await binance(id, "1d", D, 1825) };
    else { const h1 = await yahoo(id, "1h", "730d", H); series = { "60": h1, "240": aggregate(h1, 4 * H), "1D": await yahoo(id, "1d", "10y", D) }; }
    for (const [tf, rows] of Object.entries(series)) {
      if (rows.length < 500) throw new Error(`${sym} ${tf}: only ${rows.length} bars`);
      sets.push({ ...base, timeframe: tf, ...write(sym, tf, src + ":" + id, market, rows) });
    }
    console.log("ok", sym);
  } catch (e) {
    failures.push(sym + ": " + e.message); console.error("FAILED", sym, e.message);
    sets.push(...prev.filter(s => s.symbol === sym)); // keep yesterday's files rather than losing the market
  }
}
fs.writeFileSync(new URL("index.json", OUT), JSON.stringify({ updatedAt: new Date().toISOString(), sets, failures }, null, 1) + "\n");
console.log(`${sets.length} files, ${failures.length} failures`);
if (!sets.length) process.exit(1);
