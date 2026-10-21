// Baseline forecast model: empirical quantiles of past forward returns, conditioned on the current
// trend state (close above or below its 50-day average). Deliberately simple; the worker's model
// replaces it, and the public track record decides whether anything fancier earns its place.
import { ASSET_BY_SLUG, MARKETS, SCENARIO_CAGR } from "./catalogue";
import { macd, sma } from "./indicators";
import { cachedBars as bars, crosscheck, effectiveSource, loadError } from "./marketdata";
import { SOURCE_LABEL } from "./sources/map";
import type { Bar, ForecastPoint, Horizon, Metrics, PathRow, Quote, Scenarios, Signal } from "./types";

const DAY = 86_400_000;

export function isSessionBased(slug: string) {
  const a = ASSET_BY_SLUG.get(slug)!;
  return MARKETS.find((m) => m.code === a.market)!.sessionBased;
}

/** Steps per horizon on the daily series: calendar days for 24/7 markets, sessions otherwise. */
function steps(h: "1d" | "7d" | "1m", session: boolean) {
  return { "1d": 1, "7d": session ? 5 : 7, "1m": session ? 21 : 30 }[h];
}

function quantile(sorted: number[], q: number) {
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function signalFromP(p: number): Signal {
  return p >= 0.65 ? "strong_buy" : p >= 0.55 ? "buy" : p > 0.45 ? "neutral" : p > 0.35 ? "sell" : "strong_sell";
}

function trendState(c: number[], i: number) {
  const w = c.slice(Math.max(0, i - 49), i + 1);
  return c[i] >= w.reduce((a, b) => a + b, 0) / w.length;
}

export function quote(slug: string): Quote {
  // Latest closed bar: 5-minute where the source has intraday data, otherwise daily.
  const b5 = bars(slug, "5m");
  const series = b5.length ? b5 : bars(slug, "1d");
  const step = b5.length ? 300_000 : 86_400_000;
  const last = series.at(-1)!;
  const dayAgo = last.ts - 86_400_000;
  const prev = b5.length ? (b5.find((x) => x.ts >= dayAgo) ?? b5[0]) : (series.at(-2) ?? last);
  const observedAt = last.ts + step;
  const src = effectiveSource(slug);
  const cross = crosscheck(slug);
  const spread = cross ? (Math.abs(cross.price - last.c) / last.c) * 100 : 0;
  const staleAfter = b5.length ? 15 * 60_000 : 4 * 86_400_000; // a weekend plus a holiday for daily-only sources
  const status: Quote["status"] = loadError(slug) || Date.now() - observedAt > staleAfter ? "stale" : cross && spread > 0.5 ? "diverged" : "ok";
  return {
    price: last.c,
    change24hPct: ((last.c - prev.c) / prev.c) * 100,
    observedAt: new Date(observedAt).toISOString(),
    checkedAt: new Date(cross?.checkedAt ?? observedAt).toISOString(),
    crosscheckSpreadPct: spread,
    status,
    source: SOURCE_LABEL[src],
    crosscheckSource: cross?.source ?? "",
  };
}

interface ShortTerm { points: ForecastPoint[]; q: Record<"1d" | "7d" | "1m", { lo: number; mid: number; hi: number; pUp: number }> }

const stCache = new Map<string, ShortTerm>();

export function shortTerm(slug: string): ShortTerm {
  const d = bars(slug, "1d");
  const price = quote(slug).price;
  const key = `${slug}:${d.at(-1)!.ts}:${price}`;
  const hit = stCache.get(key);
  if (hit) return hit;
  const c = d.map((x) => x.c);
  const session = isSessionBased(slug);
  const now = Date.now();
  const nowUp = trendState(c, c.length - 1);
  const q = {} as ShortTerm["q"];
  const points: ForecastPoint[] = [];
  for (const h of ["1d", "7d", "1m"] as const) {
    const n = steps(h, session);
    let rets: number[] = [];
    // Two years of history, same trend state as today, forward returns fully in the past.
    const from = Math.max(50, c.length - 730);
    for (let i = from; i < c.length - n; i++) {
      if (trendState(c, i) === nowUp) rets.push(Math.log(c[i + n] / c[i]));
    }
    // Young assets: too few matching moments to condition on, so use every moment instead.
    if (rets.length < 60) {
      rets = [];
      for (let i = Math.max(0, c.length - 730); i < c.length - n; i++) rets.push(Math.log(c[i + n] / c[i]));
    }
    rets.sort((a, b) => a - b);
    const lo = quantile(rets, 0.1), mid = quantile(rets, 0.5), hi = quantile(rets, 0.9);
    const pUp = rets.filter((r) => r > 0).length / rets.length;
    q[h] = { lo, mid, hi, pUp };
    const m = price * Math.exp(mid);
    points.push({
      horizon: h, kind: "forecast", low: price * Math.exp(lo), mid: m, high: price * Math.exp(hi),
      changePct: (m / price - 1) * 100, pUp, signal: signalFromP(pUp),
      targetAt: new Date(now + n * DAY * (session ? 7 / 5 : 1)).toISOString(),
    });
  }
  const sc = scenarios(slug);
  for (const [h, years] of [["1y", 1], ["5y", 5], ["10y", 10]] as const) {
    const y = sc.years[years - 1];
    points.push({ horizon: h as Horizon, kind: "scenario", low: y.bear, mid: y.base, high: y.bull, changePct: y.baseRoiPct,
      pUp: null, signal: null, targetAt: new Date(now + years * 365 * DAY).toISOString() });
  }
  const out = { points, q };
  if (stCache.size > 500) stCache.clear();
  stCache.set(key, out);
  return out;
}

/** 14 daily (or session) rows, 4 weekly, 12 monthly: band widens with the square root of time. */
export function paths(slug: string): { day: PathRow[]; week: PathRow[]; month: PathRow[] } {
  const { q } = shortTerm(slug);
  const price = quote(slug).price;
  const session = isSessionBased(slug);
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const row = (k: number, base: { lo: number; mid: number; hi: number }, scale: number, date: Date, label: string): PathRow => {
    const mid = price * Math.exp(base.mid * k);
    const width = Math.sqrt(k) * scale;
    return { periodStart: date.toISOString(), label, mid, low: price * Math.exp(base.mid * k + base.lo * width),
      high: price * Math.exp(base.mid * k + base.hi * width), changePct: (mid / price - 1) * 100 };
  };
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const day: PathRow[] = [];
  const d = new Date(start);
  for (let k = 1; day.length < 14; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (session && (d.getUTCDay() === 0 || d.getUTCDay() === 6)) continue;
    day.push(row(k, q["1d"], 1, new Date(d), fmt(d)));
    k++;
  }
  const week = [1, 2, 3, 4].map((w) => {
    const dt = new Date(start.getTime() + w * 7 * DAY);
    return row(w, q["7d"], 1, dt, `Week ${w} · ${fmt(dt)}`);
  });
  const month = Array.from({ length: 12 }, (_, i) => {
    const dt = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i + 1, 1));
    return row(i + 1, q["1m"], 1, dt, dt.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }));
  });
  return { day, week, month };
}

export function scenarios(slug: string): Scenarios {
  const a = ASSET_BY_SLUG.get(slug)!;
  const [bear, base, bull] = SCENARIO_CAGR[a.market];
  const price = quote(slug).price;
  const y0 = new Date().getUTCFullYear();
  return {
    years: Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      return { year: y0 + n, bear: price * (1 + bear) ** n, base: price * (1 + base) ** n, bull: price * (1 + bull) ** n,
        baseRoiPct: ((1 + base) ** n - 1) * 100 };
    }),
    assumptions: {
      bearCagrPct: bear * 100, baseCagrPct: base * 100, bullCagrPct: bull * 100,
      note: "Fixed annual growth rates applied to today's price. They are planning assumptions, not predictions, and are the same for every asset in this market.",
    },
  };
}

export function metrics(slug: string): Metrics {
  const d = bars(slug, "1d");
  const c = d.map((x) => x.c);
  const last = c.at(-1)!;
  const m = macd(c) ?? { hist: 0 };
  const s50 = sma(c, 50) ?? last, s200 = sma(c, Math.min(200, c.length)) ?? last;
  const prev200 = sma(c.slice(0, -20), Math.min(200, Math.max(1, c.length - 20))) ?? s200;
  const session = isSessionBased(slug);
  const periods = session ? 252 : 365;
  const rets = c.slice(-31).map((x, i, a) => (i ? Math.log(x / a[i - 1]) : 0)).slice(1);
  const sd = (xs: number[]) => {
    const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1));
  };
  const vol = sd(rets) * Math.sqrt(periods) * 100;
  const yr = c.slice(-periods - 1).map((x, i, a) => (i ? Math.log(x / a[i - 1]) : 0)).slice(1);
  const mu = yr.reduce((a, b) => a + b, 0) / yr.length;
  const a = ASSET_BY_SLUG.get(slug)!;
  const [lowCut, highCut] = a.market === "crypto" ? [45, 75] : [15, 30];
  const win = (n: number) => ({ hi: Math.max(...d.slice(-n).map((x) => x.h)), lo: Math.min(...d.slice(-n).map((x) => x.l)) });
  let ath = d[0];
  for (const b of d) if (b.h > ath.h) ath = b;
  return {
    macd: Math.abs(m.hist) < last * 1e-5 ? "neutral" : m.hist > 0 ? "bullish" : "bearish",
    maCross: s50 > s200 ? "golden" : s50 < s200 ? "death" : "none",
    ma200Trend: s200 > prev200 * 1.002 ? "up" : s200 < prev200 * 0.998 ? "down" : "flat",
    pctFromMa200: (last / s200 - 1) * 100,
    volatilityPct: vol,
    volatilityLabel: vol < lowCut ? "low" : vol < highCut ? "medium" : "high",
    sharpe: (mu * periods) / (sd(yr) * Math.sqrt(periods)),
    dividendYieldPct: a.meta.dividendYieldPct ?? 0,
    range: { d20: win(20), d90: win(90) },
    ath: { price: ath.h, date: new Date(ath.ts).toISOString(), pctFrom: (last / ath.h - 1) * 100 },
  };
}

export function closedBars(slug: string, tf: "5m" | "30m" | "1h" | "1d" | "1w"): Bar[] {
  const b = bars(slug, tf);
  // Demo series for markets that close keep short intraday history, so the "not enough data" state is real.
  return effectiveSource(slug) === "demo" && isSessionBased(slug) && tf === "5m" ? b.slice(-150) : b;
}

export function isDemo(slug: string) {
  return effectiveSource(slug) === "demo";
}
