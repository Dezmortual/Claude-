// A stand-in for Alpaca's trading API (the endpoints the app calls), in memory, for the e2e suite.
// Market orders fill at once at PRICE; limit orders stay open. POST /__reset clears it; POST /__badkeys makes it refuse the keys;
// POST /__mark?price=110 moves the price positions are valued at (fills stay at PRICE), to show a gain or loss.
// Also FRED CSVs, World Bank and Polymarket stand-ins (/graph/fredgraph.csv, /v2/country/..., /markets).
// Also a stand-in for Claude's Messages API (POST /v1/messages): it looks up Bitcoin and the news, then answers from the results.
// Also news: GET /v1beta1/news (Alpaca's news API), POST /__news adds a story, and /rss/*.xml serve test feeds.
import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 3999), KEY = "e2e-key", SECRET = "e2e-secret", PRICE = 100;
const TRADABLE = { "BTC/USD": "crypto", "ETH/USD": "crypto", "SOL/USD": "crypto", AAPL: "us_equity", NVDA: "us_equity", GLD: "us_equity", SPY: "us_equity" };
let state, badKeys = false, mark = PRICE;
const STORY = (i, h, sym, mins) => ({ id: i, headline: h, summary: "", url: `https://news.example/${i}`, source: "benzinga", symbols: sym,
  created_at: new Date(Date.now() - mins * 60_000).toISOString() });
const news = [STORY(1, "Bitcoin surges to a record high as ETF inflows jump", ["BTCUSD"], 30),
  STORY(2, "Apple shares tumble after the company misses estimates", ["AAPL"], 90),
  STORY(3, "Markets wait for the jobs report", [], 120)];
const rss = (items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>${items.map(([t, l, d]) =>
  `<item><title>${t}</title><link>${l}</link><description><![CDATA[<p>${d}</p>]]></description><pubDate>${new Date(Date.now() - 3_600_000).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;
const FEEDS = {
  "/rss/central.xml": rss([["Central bank holds rates; the Fed signals patience", "https://central.example/1", "Policy unchanged."],
    ["Ethereum upgrade approved by core developers", "https://central.example/2", "Ether gains."]]),
  "/rss/world.xml": rss([["Ceasefire talks resume as shipping lanes reopen", "https://world.example/1", "Diplomacy update."]]),
  "/rss/mine.xml": rss([["My blog: why gold could rally &amp; what to watch", "https://blog.example/1", "Gold notes."]]),
};
// Monthly series: an index rising 3% a year with a wobble, or a rate around 4%; daily ones for the last 3 years.
function fredCsv(id) {
  if (id === "NOPE") return null;
  const daily = ["DFF", "DGS2", "DGS10", "T10Y2Y", "T10YIE", "VIXCLS", "DCOILWTICO", "DTWEXBGS"].includes(id);
  const rate = !["CPIAUCSL", "CPILFESL", "PCEPI", "GDPC1", "INDPRO", "RSAFS", "M2SL", "CSUSHPINSA", "PAYEMS"].includes(id);
  const rows = [];
  const now = new Date(Date.UTC(2026, 8, 1));
  const n = daily ? 750 : 15 * 12;
  for (let i = n; i >= 0; i--) {
    const d = daily ? new Date(now.getTime() - i * 86_400_000) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const t = n - i;
    const v = rate ? 4 + Math.sin(t / 9) : 100 * Math.pow(1.03, t / (daily ? 365 : 12)) * (1 + 0.002 * Math.sin(t));
    rows.push(`${d.toISOString().slice(0, 10)},${i === 3 ? "." : v.toFixed(3)}`);
  }
  return `observation_date,${id}\n${rows.join("\n")}\n`;
}
const WB = ["US|United States", "GB|United Kingdom", "DE|Germany", "JP|Japan"];
const markets = [
  { id: "1", question: "Will the Fed cut rates in December?", slug: "fed-dec", outcomes: '["Yes", "No"]', outcomePrices: '["0.62", "0.38"]', volume24hr: 2500000, volumeNum: 40000000,
    endDate: "2026-12-10T00:00:00Z", oneDayPriceChange: 0.04, events: [{ slug: "fed-december", title: "Fed decision in December" }] },
  { id: "2", question: "Will Bitcoin reach $150,000 by December 31?", slug: "btc-150k", outcomes: '["Yes", "No"]', outcomePrices: '["0.18", "0.82"]', volume24hr: 900000, volumeNum: 12000000,
    endDate: "2026-12-31T00:00:00Z", oneDayPriceChange: -0.02, events: [{ slug: "bitcoin-150k", title: "Bitcoin price" }] },
  { id: "3", question: "Who will win the league?", slug: "league", outcomes: '["Team A", "Team B"]', outcomePrices: '["0.5", "0.5"]', volume24hr: 10000, volumeNum: 50000, events: [] },
];
let msgN = 0;
function claude(b, headers) {
  const reply = (content, stop, usage = {}) => ({ id: `msg_${++msgN}`, type: "message", role: "assistant", model: b.model, content, stop_reason: stop, stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...usage } });
  const sys = typeof b.system === "string" ? b.system : (b.system ?? []).map((x) => x.text).join("");
  if (sys.startsWith("You write short market desk notes")) {
    const first = (b.messages[0].content.match(/https?:\/\/\S+/) ?? ["https://news.example/1"])[0];
    return [200, reply([{ type: "text", text: `**Crypto** rallied on ETF demand ([story](${first})).\n\n**Stocks** were mixed.` }], "end_turn")];
  }
  // Replayed history must come back exactly as sent: every assistant turn still starts with its thinking block.
  for (const m of b.messages) if (m.role === "assistant" && !(Array.isArray(m.content) && m.content[0]?.type === "thinking" && m.content[0].signature === "sig"))
    return [400, { type: "error", error: { type: "invalid_request_error", message: "thinking block missing or changed" } }];
  if (!String(headers["anthropic-beta"] ?? "").includes("server-side-fallback-2026-07-01") || b.fallbacks !== "default") return [400, { type: "error", error: { type: "invalid_request_error", message: "expected fallbacks: default" } }];
  const last = b.messages.at(-1);
  const results = Array.isArray(last.content) ? last.content.filter((c) => c.type === "tool_result") : [];
  const think = { type: "thinking", thinking: "", signature: "sig" };
  if (results.length) {
    const data = results.map((r) => { try { return JSON.parse(r.content); } catch { return null; } });
    const snap = data.find((d) => d && d.slug === "bitcoin"), news = data.find((d) => Array.isArray(d)) ?? [];
    const story = news[0];
    return [200, reply([think, { type: "text", text: `[Bitcoin](/assets/bitcoin) is at $${snap?.price ?? "?"} with a ${snap?.signal ?? "?"} daily signal.\n\n- Latest story: ${story ? `[${story.title}](${story.url})` : "none"}\n- These are statistics, often wrong.` }], "end_turn")];
  }
  const text = (Array.isArray(last.content) ? last.content.find((c) => c.type === "text")?.text : last.content) ?? "";
  if (/refuse/i.test(text)) return [200, reply([], "refusal")];
  if (/expensive/i.test(text)) return [200, reply([think, { type: "text", text: "A very long answer." }], "end_turn", { output_tokens: 10_000_000 })];
  return [200, reply([think, { type: "tool_use", id: `toolu_${msgN}a`, name: "asset_snapshot", input: { slug: "bitcoin" } },
    { type: "tool_use", id: `toolu_${msgN}b`, name: "search_news", input: { query: "", slug: "bitcoin" } }], "tool_use")];
}
// Options around $100 for two expiries; SEC company facts for Apple with three fiscal years.
function optionsFor(sym) {
  const out = {};
  const exp = [new Date(Date.now() + 20 * 86_400_000), new Date(Date.now() + 48 * 86_400_000)].map((d) => d.toISOString().slice(2, 10).replace(/-/g, ""));
  for (const e of exp) for (const k of [90, 95, 100, 105, 110]) for (const t of ["C", "P"]) {
    const intrinsic = t === "C" ? Math.max(0, 100 - k) : Math.max(0, k - 100), p = intrinsic + 2.5;
    out[`${sym}${e}${t}${String(k * 1000).padStart(8, "0")}`] = { latestQuote: { bp: p - 0.1, ap: p + 0.1 }, latestTrade: { p }, impliedVolatility: 0.3,
      greeks: { delta: t === "C" ? 0.5 + (100 - k) / 40 : -0.5 + (100 - k) / 40, gamma: 0.04, theta: -0.05, vega: 0.12 } };
  }
  return out;
}
const yr = (y, val, extra = {}) => ({ start: `${y - 1}-09-28`, end: `${y}-09-27`, val, fy: y, fp: "FY", form: "10-K", filed: `${y}-11-01`, ...extra });
const bal = (y, val) => ({ end: `${y}-09-27`, val, fy: y, fp: "FY", form: "10-K", filed: `${y}-11-01` });
const SEC_AAPL = { entityName: "Apple Inc.", facts: {
  dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: "2026-07-17", val: 15000000000 }] } } },
  "us-gaap": {
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [yr(2023, 383e9), yr(2024, 391e9), yr(2025, 416e9)] } },
    NetIncomeLoss: { units: { USD: [yr(2023, 97e9), yr(2024, 94e9), yr(2025, 112e9)] } },
    EarningsPerShareDiluted: { units: { "USD/shares": [yr(2023, 6.13), yr(2024, 6.08), yr(2025, 7.46)] } },
    NetCashProvidedByUsedInOperatingActivities: { units: { USD: [yr(2023, 110e9), yr(2024, 118e9), yr(2025, 111e9)] } },
    PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [yr(2023, 11e9), yr(2024, 9e9), yr(2025, 12e9)] } },
    CashAndCashEquivalentsAtCarryingValue: { units: { USD: [bal(2025, 36e9)] } },
    LongTermDebt: { units: { USD: [bal(2025, 90e9)] } },
  } } };
const reset = () => { state = { cash: 100000, positions: new Map(), orders: [], fills: [] }; badKeys = false; mark = PRICE; };
reset();
const key = (s) => s.replace("/", "");

function send(res, code, body) { res.writeHead(code, { "content-type": "application/json" }); res.end(body === undefined ? "" : JSON.stringify(body)); }
function fill(o) {
  const qty = o.qty ? Number(o.qty) : Number(o.notional) / PRICE, k = key(o.symbol), p = state.positions.get(k) ?? { qty: 0, cost: 0, cls: TRADABLE[o.symbol] };
  if (o.side === "buy") { p.qty += qty; p.cost += qty * PRICE; state.cash -= qty * PRICE; }
  else { p.cost -= (p.cost / p.qty) * qty; p.qty -= qty; state.cash += qty * PRICE; }
  if (p.qty <= 1e-9) state.positions.delete(k); else state.positions.set(k, p);
  Object.assign(o, { status: "filled", filled_qty: String(qty), filled_avg_price: String(PRICE), filled_at: new Date().toISOString() });
  state.fills.unshift({ id: `${Date.now()}::${randomUUID()}`, activity_type: "FILL", transaction_time: o.filled_at, type: "fill", price: String(PRICE), qty: String(qty),
    side: o.side, symbol: key(o.symbol), order_id: o.id });
}

http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x"), path = decodeURIComponent(url.pathname), m = req.method;
    if (path === "/v1/messages" && m === "POST") {
      if (req.headers["x-api-key"] !== "e2e-anthropic") return send(res, 401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
      const [code, body] = claude(JSON.parse(raw || "{}"), req.headers);
      return send(res, code, body);
    }
    if (path === "/api/xbrl/companyfacts/CIK0000320193.json") return send(res, 200, SEC_AAPL);
    if (path.startsWith("/api/xbrl/companyfacts/")) return send(res, 404, { message: "not found" });
    if (path === "/graph/fredgraph.csv") { const csv = fredCsv(url.searchParams.get("id") ?? ""); res.writeHead(200, { "content-type": "text/csv" }); return res.end(csv ?? "<html>Not found</html>"); }
    if (path.startsWith("/v2/country/")) {
      const rows = WB.flatMap((c, k) => { const [id, value] = c.split("|"); return [2025, 2024, 2023].map((y) => ({ country: { id, value }, date: String(y), value: y === 2025 && k === 3 ? null : 1.5 + k + (2025 - y) * 0.2 })); });
      return send(res, 200, [{ page: 1, pages: 1 }, rows]);
    }
    if (path === "/markets") return send(res, 200, markets);
    if (FEEDS[path]) { res.writeHead(200, { "content-type": "application/rss+xml" }); return res.end(FEEDS[path]); }
    if (path === "/rss/notafeed.xml") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<html><body>Hello</body></html>"); }
    if (path === "/__news") { const b = JSON.parse(raw || "{}"); news.unshift(STORY(news.length + 1, b.headline, b.symbols ?? [], 0)); return send(res, 200, { ok: true }); }
    if (path === "/__reset") { reset(); return send(res, 200, { ok: true }); }
    if (path === "/__mark") { mark = Number(url.searchParams.get("price")); return send(res, 200, { ok: true }); }
    if (path === "/__badkeys") { badKeys = true; return send(res, 200, { ok: true }); }
    if (badKeys || req.headers["apca-api-key-id"] !== KEY || req.headers["apca-api-secret-key"] !== SECRET) return send(res, 401, { code: 40110000, message: "request is not authorized" });
    const equity = state.cash + [...state.positions.values()].reduce((t, p) => t + p.qty * mark, 0);
    if (path.startsWith("/v1beta1/options/snapshots/")) return send(res, 200, { snapshots: optionsFor(path.split("/").pop()), next_page_token: null });
    if (path === "/v1beta1/news") return send(res, 200, { news: news.slice(0, Number(url.searchParams.get("limit") ?? 50)), next_page_token: null });
    if (path === "/v2/account/activities/FILL") return send(res, 200, state.fills.slice(0, 100));
    if (path === "/v2/account") return send(res, 200, { status: "ACTIVE", currency: "USD", cash: String(state.cash), buying_power: String(state.cash), equity: String(equity), last_equity: "100000", trading_blocked: false, account_blocked: false });
    if (path === "/v2/clock") return send(res, 200, { is_open: true, next_open: new Date().toISOString(), next_close: new Date().toISOString() });
    if (path === "/v2/positions" && m === "GET") return send(res, 200, [...state.positions].map(([s, p]) => ({ symbol: s, qty: String(p.qty), avg_entry_price: String(p.cost / p.qty), market_value: String(p.qty * mark), current_price: String(mark), unrealized_pl: String(p.qty * mark - p.cost), unrealized_plpc: String((p.qty * mark) / p.cost - 1), side: "long", asset_class: p.cls })));
    if (path.startsWith("/v2/positions/") && m === "DELETE") {
      const s = path.slice(14), p = state.positions.get(key(s));
      if (!p) return send(res, 404, { code: 40410000, message: "position not found" });
      const o = { id: randomUUID(), client_order_id: randomUUID(), symbol: key(s), side: "sell", type: "market", order_class: "", qty: String(p.qty), notional: null, filled_qty: "0", filled_avg_price: null, limit_price: null, status: "accepted", submitted_at: new Date().toISOString(), filled_at: null };
      fill(o); state.orders.unshift(o); return send(res, 200, o);
    }
    if (path.startsWith("/v2/assets/")) {
      const s = path.slice(11);
      return TRADABLE[s] ? send(res, 200, { symbol: s, class: TRADABLE[s], tradable: true, fractionable: true }) : send(res, 404, { code: 40410000, message: "asset not found" });
    }
    if (path === "/v2/orders" && m === "GET") {
      const st = url.searchParams.get("status");
      return send(res, 200, state.orders.filter((o) => st !== "open" || ["new", "accepted", "pending_new"].includes(o.status)).slice(0, Number(url.searchParams.get("limit") ?? 50)));
    }
    if (path === "/v2/orders" && m === "POST") {
      const b = JSON.parse(raw || "{}");
      if (state.orders.some((o) => o.client_order_id === b.client_order_id)) return send(res, 422, { code: 40010001, message: "client_order_id must be unique" });
      if (!TRADABLE[b.symbol]) return send(res, 422, { code: 42210000, message: "asset not found" });
      if (b.side === "sell" && (state.positions.get(key(b.symbol))?.qty ?? 0) < Number(b.qty) - 1e-9) return send(res, 403, { code: 40310000, message: "insufficient qty available for order" });
      const o = { id: randomUUID(), client_order_id: b.client_order_id, symbol: b.symbol, side: b.side, type: b.type, order_class: b.order_class ?? "", qty: b.qty ?? null, notional: b.notional ?? null, filled_qty: "0", filled_avg_price: null, limit_price: b.limit_price ?? null, status: "accepted", submitted_at: new Date().toISOString(), filled_at: null, legs: null };
      if (b.type === "market") fill(o);
      state.orders.unshift(o); return send(res, 200, o);
    }
    if (path.startsWith("/v2/orders/") && m === "DELETE") {
      const o = state.orders.find((x) => x.id === path.slice(11));
      if (!o) return send(res, 404, { code: 40410000, message: "order not found" });
      o.status = "canceled"; return send(res, 204);
    }
    send(res, 404, { code: 40400000, message: `no route ${m} ${path}` });
  });
}).listen(PORT, () => console.log(`fake alpaca on ${PORT}`));
