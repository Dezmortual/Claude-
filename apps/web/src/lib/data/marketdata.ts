import "server-only";
// Bar cache: Postgres (price_bars) is the store of record, refreshed from each asset's source when its tail is stale.
// `ensure()` is the only async step; afterwards the model reads `cachedBars()` synchronously from memory.
import { sql } from "@/lib/server/db";
import { ASSETS, ASSET_BY_SLUG } from "./catalogue";
import { alpacaBars, alpacaConfigured } from "./sources/alpaca";
import { binanceBars } from "./sources/binance";
import { paprikaPrices } from "./sources/coinpaprika";
import { frankfurterDaily } from "./sources/frankfurter";
import { TWELVE_DATA_REFRESH, twelveDataBars, twelveDataConfigured } from "./sources/twelvedata";
import { yieldDaily, type YieldSeries } from "./sources/yields";
import { sourceFor, type SourceName } from "./sources/map";
import { bars as demoBars } from "./series";
import type { Bar, Timeframe } from "./types";

export const TFS: Timeframe[] = ["5m", "30m", "1h", "1d", "1w"];
const STEP: Record<Timeframe, number> = { "5m": 300_000, "30m": 1_800_000, "1h": 3_600_000, "1d": 86_400_000, "1w": 604_800_000 };
// How many bars to keep per series, and how stale the tail may get before we ask the source again.
const KEEP: Record<Timeframe, number> = { "5m": 320, "30m": 400, "1h": 400, "1d": 1100, "1w": 300 };
const REFRESH: Record<Timeframe, number> = { "5m": 120_000, "30m": 300_000, "1h": 600_000, "1d": 1_800_000, "1w": 21_600_000 };
const MEMO_MS = 30_000;

type Entry = { bars: Bar[]; at: number; error?: string };
const g = globalThis as unknown as { __bars?: Map<string, Entry>; __ids?: Map<string, string>; __cross?: { at: number; map: Map<string, { price: number; source: string; checkedAt: number }> } };
const mem = (g.__bars ??= new Map());

export function effectiveSource(slug: string): SourceName {
  if (process.env.MARKET_DATA === "demo") return "demo"; // deterministic, offline: used by the e2e suite
  const s = sourceFor(ASSET_BY_SLUG.get(slug)!).source;
  if (s === "twelvedata" && !twelveDataConfigured()) return "frankfurter";
  return s === "alpaca" && !alpacaConfigured() ? "demo" : s;
}

async function assetIds(): Promise<Map<string, string>> {
  if (!g.__ids) {
    const rows = await sql()<{ id: string; slug: string }[]>`select id, slug from assets`;
    g.__ids = new Map(rows.map((r) => [r.slug, r.id]));
  }
  return g.__ids;
}

async function fetchFromSource(slug: string, tf: Timeframe, since: number | null): Promise<Bar[]> {
  const a = ASSET_BY_SLUG.get(slug)!;
  const { symbol } = sourceFor(a);
  switch (effectiveSource(slug)) {
    case "binance": return binanceBars(symbol!, tf, since, KEEP[tf]);
    case "alpaca": return alpacaBars(symbol!, tf, since, KEEP[tf]);
    case "twelvedata": return twelveDataBars(symbol!, tf);
    case "frankfurter": {
      if (tf !== "1d" && tf !== "1w") return []; // one rate per day: no intraday series exists
      const daily = await frankfurterDaily(symbol!, since, Math.ceil(KEEP["1d"] * 1.45));
      return tf === "1d" ? daily : toWeekly(daily);
    }
    case "yields": {
      if (tf !== "1d" && tf !== "1w") return []; // one official value per working day
      const daily = await yieldDaily(symbol as YieldSeries, since, Math.ceil(KEEP["1d"] * 1.45));
      return tf === "1d" ? daily : toWeekly(daily);
    }
    default: return [];
  }
}

function toWeekly(daily: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (const b of daily) {
    const d = new Date(b.ts);
    const monday = b.ts - ((d.getUTCDay() + 6) % 7) * 86_400_000;
    const last = out.at(-1);
    if (last && last.ts === monday) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; }
    else out.push({ ts: monday, o: b.o, h: b.h, l: b.l, c: b.c, v: 0 });
  }
  // The current week is still forming.
  return out.filter((w) => w.ts + STEP["1w"] <= Date.now());
}

/** Read one series from Postgres, refreshing its tail from the source first when stale. Never throws: a failed
 *  refresh serves what is stored and records the error so the page can say the price is stale. */
async function load(slug: string, tf: Timeframe): Promise<Entry> {
  if (effectiveSource(slug) === "demo") return { bars: demoBars(slug, tf), at: Date.now() };
  const db = sql();
  const id = (await assetIds()).get(slug);
  if (!id) return { bars: [], at: Date.now(), error: "asset not seeded" };
  const [f] = await db<{ fetched_at: Date; last: Date | null }[]>`
    select bf.fetched_at, (select max(ts) from price_bars where asset_id = ${id} and timeframe = ${tf}) as last
    from bar_fetches bf where bf.asset_id = ${id} and bf.timeframe = ${tf}`;
  let error: string | undefined;
  const refresh = effectiveSource(slug) === "twelvedata" ? TWELVE_DATA_REFRESH[tf] : REFRESH[tf]; // free-plan credits
  if (!f || Date.now() - f.fetched_at.getTime() > refresh) {
    try {
      const since = f?.last ? f.last.getTime() + STEP[tf] : null;
      const fresh = (await fetchFromSource(slug, tf, since)).filter((b) => b.h >= b.l && b.o > 0 && b.c > 0);
      if (fresh.length) {
        const rows = fresh.map((b) => ({ asset_id: id, timeframe: tf, ts: new Date(b.ts), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
        for (let i = 0; i < rows.length; i += 1000) {
          await db`insert into price_bars ${db(rows.slice(i, i + 1000))}
            on conflict (asset_id, timeframe, ts) do update set open = excluded.open, high = excluded.high,
              low = excluded.low, close = excluded.close, volume = excluded.volume`;
        }
      }
      await db`insert into bar_fetches (asset_id, timeframe, fetched_at) values (${id}, ${tf}, now())
        on conflict (asset_id, timeframe) do update set fetched_at = now()`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      console.error(`bars ${slug} ${tf}: ${error}`);
    }
  }
  const rows = await db<{ ts: Date; open: number; high: number; low: number; close: number; volume: number | null }[]>`
    select ts, open, high, low, close, volume from (
      select * from price_bars where asset_id = ${id} and timeframe = ${tf} and not quarantined order by ts desc limit ${KEEP[tf]}
    ) t order by ts`;
  return { bars: rows.map((r) => ({ ts: r.ts.getTime(), o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume ?? 0 })), at: Date.now(), error };
}

const inflight = new Map<string, Promise<Entry>>();

/** Make sure the given series are in memory and no older than the memo window. */
export async function ensure(slugs: string[], tfs: Timeframe[] = TFS) {
  const jobs: Promise<unknown>[] = [];
  for (const slug of new Set(slugs)) {
    if (!ASSET_BY_SLUG.has(slug)) continue;
    for (const tf of tfs) {
      const key = `${slug}:${tf}`;
      const hit = mem.get(key);
      if (hit && Date.now() - hit.at < MEMO_MS) continue;
      let p = inflight.get(key);
      if (!p) {
        p = load(slug, tf).then((e) => { mem.set(key, e); return e; }).finally(() => inflight.delete(key));
        inflight.set(key, p);
      }
      jobs.push(p);
    }
  }
  await Promise.all(jobs);
}

export function cachedBars(slug: string, tf: Timeframe): Bar[] {
  const e = mem.get(`${slug}:${tf}`);
  if (!e) throw new Error(`bars not loaded: ${slug} ${tf} (call ensure first)`);
  return e.bars;
}

export function loadError(slug: string): string | undefined {
  for (const tf of TFS) { const e = mem.get(`${slug}:${tf}`)?.error; if (e) return e; }
}

// ---------------------------------------------------------------- cross-check

/** Second-source prices for crypto, refreshed at most every 2 minutes and stored in `crosschecks`. */
export async function ensureCrosscheck() {
  if (g.__cross && Date.now() - g.__cross.at < 120_000) return;
  const map = new Map<string, { price: number; source: string; checkedAt: number }>();
  try {
    const prices = await paprikaPrices();
    const ids = await assetIds();
    const rows: { asset_id: string; price: number; source: string; checked_at: Date }[] = [];
    for (const a of ASSETS) {
      if (a.market !== "crypto") continue;
      const p = prices.get(a.ticker);
      if (p && ids.get(a.slug)) {
        map.set(a.slug, { price: p, source: "CoinPaprika", checkedAt: Date.now() });
        rows.push({ asset_id: ids.get(a.slug)!, price: p, source: "CoinPaprika", checked_at: new Date() });
      }
    }
    if (rows.length) {
      const db = sql();
      await db`insert into crosschecks ${db(rows)} on conflict (asset_id) do update set price = excluded.price, source = excluded.source, checked_at = excluded.checked_at`;
    }
  } catch (e) {
    console.error("crosscheck:", e instanceof Error ? e.message : e);
  }
  g.__cross = { at: Date.now(), map };
}

export function crosscheck(slug: string) {
  return g.__cross?.map.get(slug);
}

/** For scripts and the ingest job: warm every live series. */
export async function warmAll(tfs: Timeframe[] = TFS) {
  await ensure(ASSETS.filter((a) => effectiveSource(a.slug) !== "demo").map((a) => a.slug), tfs);
}
