// US stock and ETF bars from Alpaca's market-data API with the owner's own (free) keys. IEX feed, split-adjusted.
import type { Bar, Timeframe } from "../types";
import { getJson } from "./http";

const TF: Record<Timeframe, string> = { "5m": "5Min", "30m": "30Min", "1h": "1Hour", "1d": "1Day", "1w": "1Week" };
const STEP: Record<Timeframe, number> = { "5m": 300_000, "30m": 1_800_000, "1h": 3_600_000, "1d": 86_400_000, "1w": 604_800_000 };

export function alpacaConfigured() {
  return !!(process.env.ALPACA_KEY_ID && process.env.ALPACA_SECRET_KEY);
}

export async function alpacaBars(symbol: string, tf: Timeframe, since: number | null, count: number): Promise<Bar[]> {
  const headers = { "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID!, "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY! };
  // Markets that close need a wider calendar window to collect `count` bars.
  const start = new Date(since ?? Date.now() - count * STEP[tf] * (tf === "1d" || tf === "1w" ? 1.5 : 4)).toISOString();
  const out: Bar[] = [];
  let token = "";
  for (let page = 0; page < 20; page++) {
    const r = await getJson<{ bars: { t: string; o: number; h: number; l: number; c: number; v: number }[] | null; next_page_token: string | null }>(
      `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=${TF[tf]}&start=${start}&limit=10000&feed=iex&adjustment=all${token ? `&page_token=${token}` : ""}`, headers);
    for (const b of r.bars ?? []) {
      const ts = Date.parse(b.t);
      if (ts + STEP[tf] > Date.now()) continue; // still forming
      out.push({ ts, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
    }
    if (!r.next_page_token) break;
    token = r.next_page_token;
  }
  return out;
}
