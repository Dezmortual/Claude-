// A stand-in for Alpaca's trading API (the endpoints the app calls), in memory, for the e2e suite.
// Market orders fill at once at PRICE; limit orders stay open. POST /__reset clears it; POST /__badkeys makes it refuse the keys;
// POST /__mark?price=110 moves the price positions are valued at (fills stay at PRICE), to show a gain or loss.
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
  "/rss/mine.xml": rss([["My blog: why gold could rally &amp; what to watch", "https://blog.example/1", "Gold notes."]]),
};
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
    if (FEEDS[path]) { res.writeHead(200, { "content-type": "application/rss+xml" }); return res.end(FEEDS[path]); }
    if (path === "/rss/notafeed.xml") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<html><body>Hello</body></html>"); }
    if (path === "/__news") { const b = JSON.parse(raw || "{}"); news.unshift(STORY(news.length + 1, b.headline, b.symbols ?? [], 0)); return send(res, 200, { ok: true }); }
    if (path === "/__reset") { reset(); return send(res, 200, { ok: true }); }
    if (path === "/__mark") { mark = Number(url.searchParams.get("price")); return send(res, 200, { ok: true }); }
    if (path === "/__badkeys") { badKeys = true; return send(res, 200, { ok: true }); }
    if (badKeys || req.headers["apca-api-key-id"] !== KEY || req.headers["apca-api-secret-key"] !== SECRET) return send(res, 401, { code: 40110000, message: "request is not authorized" });
    const equity = state.cash + [...state.positions.values()].reduce((t, p) => t + p.qty * mark, 0);
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
