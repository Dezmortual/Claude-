import "server-only";
// Option chains from Alpaca's options data (https://docs.alpaca.markets/reference/optionchain) with the owner's keys.
// The free "indicative" feed: quotes are modified and trades delayed, so prices are a guide, not tradeable quotes.
const clean = (v?: string) => v?.trim().replace(/^["']|["']$/g, "").trim() ?? "";

export type Contract = { symbol: string; expiry: string; type: "call" | "put"; strike: number; bid: number | null; ask: number | null; last: number | null;
  iv: number | null; delta: number | null; gamma: number | null; theta: number | null; vega: number | null };

/** OCC symbols: root, YYMMDD, C or P, strike × 1000 in eight digits (AAPL261218C00150000). */
export function parseOcc(sym: string): { root: string; expiry: string; type: "call" | "put"; strike: number } | null {
  const m = sym.match(/^([A-Z.]{1,6}\d?)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  return m ? { root: m[1], expiry: `20${m[2]}-${m[3]}-${m[4]}`, type: m[5] === "C" ? "call" : "put", strike: Number(m[6]) / 1000 } : null;
}

type Snap = { latestQuote?: { bp?: number; ap?: number }; latestTrade?: { p?: number }; impliedVolatility?: number;
  greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number } };

export async function optionSnapshots(underlying: string, q: { from: string; to: string; strikeLo: number; strikeHi: number }): Promise<Contract[]> {
  const key = clean(process.env.ALPACA_KEY_ID), secret = clean(process.env.ALPACA_SECRET_KEY);
  if (!key || !secret) throw new Error("Alpaca keys aren't set");
  const base = clean(process.env.ALPACA_NEWS_URL) || "https://data.alpaca.markets";
  const out: Contract[] = [];
  let token = "";
  for (let page = 0; page < 5; page++) {
    const p = new URLSearchParams({ feed: "indicative", limit: "1000", expiration_date_gte: q.from, expiration_date_lte: q.to,
      strike_price_gte: String(q.strikeLo), strike_price_lte: String(q.strikeHi), ...(token ? { page_token: token } : {}) });
    const r = await fetch(`${base}/v1beta1/options/snapshots/${encodeURIComponent(underlying)}?${p}`, { cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret } });
    if (r.status === 401 || r.status === 403) throw new Error("Alpaca refused the keys for options data");
    if (!r.ok) throw new Error(`Alpaca options answered ${r.status}`);
    const j = (await r.json()) as { snapshots?: Record<string, Snap>; next_page_token?: string | null };
    for (const [sym, s] of Object.entries(j.snapshots ?? {})) {
      const o = parseOcc(sym);
      if (!o) continue;
      const n = (x?: number) => (typeof x === "number" && Number.isFinite(x) ? x : null);
      out.push({ symbol: sym, expiry: o.expiry, type: o.type, strike: o.strike, bid: n(s.latestQuote?.bp), ask: n(s.latestQuote?.ap), last: n(s.latestTrade?.p),
        iv: n(s.impliedVolatility), delta: n(s.greeks?.delta), gamma: n(s.greeks?.gamma), theta: n(s.greeks?.theta), vega: n(s.greeks?.vega) });
    }
    if (!j.next_page_token) break;
    token = j.next_page_token;
  }
  return out;
}
