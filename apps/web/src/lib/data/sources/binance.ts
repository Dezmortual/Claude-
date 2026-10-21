// Spot klines from Binance's public market-data host (no key, no account). Only closed bars are returned.
import type { Bar, Timeframe } from "../types";
import { getJson } from "./http";

const HOST = "https://data-api.binance.vision/api/v3";
const STEP: Record<Timeframe, number> = { "5m": 300_000, "30m": 1_800_000, "1h": 3_600_000, "1d": 86_400_000, "1w": 604_800_000 };

type Kline = [number, string, string, string, string, string, number, ...unknown[]];

export async function binanceBars(symbol: string, tf: Timeframe, since: number | null, count: number): Promise<Bar[]> {
  const now = Date.now();
  let start = since ?? now - count * STEP[tf];
  const out: Bar[] = [];
  for (let page = 0; page < 10; page++) {
    const rows = await getJson<Kline[]>(`${HOST}/klines?symbol=${symbol}&interval=${tf}&startTime=${start}&limit=1000`);
    for (const k of rows) {
      if (k[6] >= now) continue; // still forming
      out.push({ ts: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] });
    }
    if (rows.length < 1000) break;
    start = rows[rows.length - 1][0] + STEP[tf];
  }
  return out;
}

/** One request for every symbol's last price: the cheapest way to sanity-check a quote. */
export async function binanceLastPrices(): Promise<Map<string, number>> {
  const rows = await getJson<{ symbol: string; price: string }[]>(`${HOST}/ticker/price`);
  return new Map(rows.map((r) => [r.symbol, +r.price]));
}
