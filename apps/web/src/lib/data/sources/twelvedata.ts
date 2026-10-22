// Forex bars with real highs and lows from Twelve Data, with the owner's own free API key (800 credits a day, 8 a
// minute, one credit per pair per request). Each pair costs two series: 5-minute bars, from which 30-minute and
// 1-hour bars are built, and daily bars, from which weekly bars are built. Requests always ask for the whole
// window, because a request costs the same whatever its size and a full window never leaves a half-filled bucket.
import type { Bar, Timeframe } from "../types";
import { getJson } from "./http";

const STEP: Record<Timeframe, number> = { "5m": 300_000, "30m": 1_800_000, "1h": 3_600_000, "1d": 86_400_000, "1w": 604_800_000 };
const PER_MINUTE = 8;

export function twelveDataConfigured() {
  return !!process.env.TWELVE_DATA_API_KEY;
}

/** How long a stored series may age before asking again: about 312 credits a day for six pairs. */
export const TWELVE_DATA_REFRESH: Record<Timeframe, number> = {
  "5m": 25 * 60_000, "30m": 25 * 60_000, "1h": 25 * 60_000, "1d": 6 * 3_600_000, "1w": 6 * 3_600_000,
};

// Credits spent in the last minute by this server instance. Waits for room rather than getting refused.
const spent: number[] = [];
async function credit() {
  for (;;) {
    while (spent.length && Date.now() - spent[0] > 61_000) spent.shift();
    if (spent.length < PER_MINUTE) { spent.push(Date.now()); return; }
    await new Promise((r) => setTimeout(r, 61_000 - (Date.now() - spent[0])));
  }
}

type Row = { datetime: string; open: string; high: string; low: string; close: string };
type Reply = { status: "ok"; values: Row[] } | { status: "error"; code: number; message: string };

async function series(pair: string, interval: "5min" | "1day"): Promise<Bar[]> {
  await credit();
  const q = new URLSearchParams({
    symbol: pair, interval, outputsize: interval === "5min" ? "5000" : "1600", timezone: "UTC", order: "asc",
    apikey: process.env.TWELVE_DATA_API_KEY!,
  });
  const r = await getJson<Reply>(`https://api.twelvedata.com/time_series?${q}`);
  if (r.status !== "ok") throw new Error(`api.twelvedata.com ${r.code}: ${r.message.slice(0, 120)}`);
  const step = interval === "5min" ? STEP["5m"] : STEP["1d"];
  return r.values
    .map((v) => ({ ts: Date.parse(`${v.datetime.length === 10 ? `${v.datetime}T00:00:00` : v.datetime.replace(" ", "T")}Z`), o: +v.open, h: +v.high, l: +v.low, c: +v.close, v: 0 }))
    .filter((b) => Number.isFinite(b.ts) && b.c > 0 && b.ts + step <= Date.now()); // drop the bar still forming
}

// The three intraday timeframes share one request, the two daily ones another.
const memo = new Map<string, { at: number; p: Promise<Bar[]> }>();
function cached(pair: string, interval: "5min" | "1day") {
  const key = `${pair}:${interval}`, hit = memo.get(key);
  if (hit && Date.now() - hit.at < 120_000) return hit.p;
  const p = series(pair, interval);
  memo.set(key, { at: Date.now(), p });
  p.catch(() => memo.delete(key));
  return p;
}

/** Groups bars into `step`-long buckets (weeks start on Monday). Only complete buckets are returned. */
export function regroup(bars: Bar[], step: number, from: number): Bar[] {
  const start = (ts: number) => (step === STEP["1w"] ? ts - ((new Date(ts).getUTCDay() + 6) % 7) * STEP["1d"] : ts - (ts % step));
  const out: Bar[] = [];
  for (const b of bars) {
    const t = start(b.ts), last = out.at(-1);
    if (last && last.ts === t) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; }
    else out.push({ ts: t, o: b.o, h: b.h, l: b.l, c: b.c, v: 0 });
  }
  // The first bucket may be cut off by the start of the window, the last may still be forming.
  return out.filter((b) => b.ts >= from && b.ts + step <= Date.now());
}

export async function twelveDataBars(pair: string, tf: Timeframe): Promise<Bar[]> {
  if (tf === "5m" || tf === "1d") return cached(pair, tf === "5m" ? "5min" : "1day");
  const base = await cached(pair, tf === "1w" ? "1day" : "5min");
  if (!base.length) return [];
  // Skip the first bucket: the window may start partway through it.
  const step = STEP[tf];
  return regroup(base, step, base[0].ts + step);
}
