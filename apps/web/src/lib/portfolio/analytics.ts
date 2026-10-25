// Portfolio analytics from a ledger and daily closes: value per day, time-weighted return (money in and out doesn't
// count as gain), drawdown, monthly and yearly returns, and risk measures of today's mix. Pure functions, no I/O.
//
// There is no cash account: buying adds money to the portfolio and selling takes it out. A day's return is
//   (value at close − money added that day + dividends paid out − fees) / value at the previous close − 1.

export type Entry = { slug: string; kind: "buy" | "sell" | "dividend" | "fee"; qty: number; price: number | null; amount: number | null;
  /** ms; null = held from before the record starts */ at: number | null };
export type Closes = Map<string, { ts: number; c: number }[]>;
export type DayPoint = { ts: number; value: number; flow: number; ret: number; index: number };

const DAY = 86_400_000;
export const dayOf = (ms: number) => Math.floor(ms / DAY) * DAY;

/** The last close on or before each day, for every slug: weekends and holidays carry Friday's price. */
function priceOn(closes: Closes, days: number[]): Map<string, (number | null)[]> {
  const out = new Map<string, (number | null)[]>();
  for (const [slug, bars] of closes) {
    const row: (number | null)[] = [];
    let k = 0, last: number | null = null;
    for (const d of days) {
      while (k < bars.length && dayOf(bars[k].ts) <= d) { last = bars[k].c; k++; }
      row.push(last);
    }
    out.set(slug, row);
  }
  return out;
}

/** Daily value and time-weighted return from the first entry (or `start` for undated holdings) to `end`. */
export function navSeries(entries: Entry[], closes: Closes, start: number, end: number): DayPoint[] {
  const dated = entries.filter((e) => e.at !== null).map((e) => dayOf(e.at!));
  const first = entries.some((e) => e.at === null) ? dayOf(start) : dated.length ? Math.min(...dated) : dayOf(end);
  const days: number[] = [];
  for (let d = first; d <= dayOf(end); d += DAY) days.push(d);
  if (!days.length) return [];
  const px = priceOn(closes, days);
  const held = new Map<string, number>();
  const byDay = new Map<number, Entry[]>();
  for (const e of entries) { const d = e.at === null ? first : dayOf(e.at); byDay.set(d, [...(byDay.get(d) ?? []), e]); }
  const out: DayPoint[] = [];
  let prev = 0, index = 1;
  days.forEach((d, i) => {
    let flow = 0, paidOut = 0;
    for (const e of byDay.get(d) ?? []) {
      const p = e.price ?? px.get(e.slug)?.[i] ?? 0;
      if (e.kind === "buy") { held.set(e.slug, (held.get(e.slug) ?? 0) + e.qty); flow += e.qty * p + (e.amount ?? 0); }
      else if (e.kind === "sell") { held.set(e.slug, Math.max(0, (held.get(e.slug) ?? 0) - e.qty)); flow -= e.qty * p - (e.amount ?? 0); }
      else if (e.kind === "dividend") paidOut += e.amount ?? 0;
      else if (e.kind === "fee") paidOut -= e.amount ?? 0;
    }
    let value = 0;
    for (const [slug, q] of held) value += q * (px.get(slug)?.[i] ?? 0);
    const base = prev > 0 ? prev : flow > 0 ? flow : 0;
    const ret = base > 0 ? (value - (prev > 0 ? flow : 0) + paidOut) / base - 1 : 0;
    index *= 1 + ret;
    out.push({ ts: d, value, flow, ret, index });
    prev = value;
  });
  return out;
}

export function drawdowns(points: { ts: number; index: number }[]) {
  let peak = -Infinity, peakTs = 0, worst = 0, worstFrom = 0, worstTo = 0;
  const series = points.map((p) => {
    if (p.index > peak) { peak = p.index; peakTs = p.ts; }
    const dd = p.index / peak - 1;
    if (dd < worst) { worst = dd; worstFrom = peakTs; worstTo = p.ts; }
    return { ts: p.ts, v: dd };
  });
  return { series, worst: worst * 100, from: worstFrom, to: worstTo };
}

/** Return per calendar month and year, chained from the daily index. */
export function periodReturns(points: { ts: number; index: number }[]) {
  const month = new Map<string, { first: number; last: number }>(), year = new Map<string, { first: number; last: number }>();
  let before = 1;
  for (const p of points) {
    const d = new Date(p.ts), m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, y = String(d.getUTCFullYear());
    if (!month.has(m)) month.set(m, { first: before, last: p.index });
    if (!year.has(y)) year.set(y, { first: before, last: p.index });
    month.get(m)!.last = p.index; year.get(y)!.last = p.index;
    before = p.index;
  }
  const pct = (x: { first: number; last: number }) => (x.last / x.first - 1) * 100;
  return { months: [...month].map(([k, x]) => ({ month: k, pct: pct(x) })), years: [...year].map(([k, x]) => ({ year: k, pct: pct(x) })) };
}

// ---------------------------------------------------------------- risk of today's mix

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const cov = (a: number[], b: number[]) => { const ma = mean(a), mb = mean(b); return a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / ((a.length - 1) || 1); };
const quantile = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };

/** Daily returns per slug on a shared calendar (carried prices on closed days), over the last `days`. */
export function alignedReturns(closes: Closes, end: number, days = 365) {
  const grid: number[] = [];
  for (let d = dayOf(end) - days * DAY; d <= dayOf(end); d += DAY) grid.push(d);
  const px = priceOn(closes, grid);
  const rets = new Map<string, number[]>();
  for (const [slug, row] of px) {
    const r: number[] = [];
    for (let i = 1; i < row.length; i++) r.push(row[i] && row[i - 1] ? row[i]! / row[i - 1]! - 1 : 0);
    rets.set(slug, r);
  }
  return { grid: grid.slice(1), rets };
}

export type Risk = {
  days: number; vol: number; beta: number | null; var95: number; cvar95: number; worstDay: { ts: number; pct: number };
  contributions: { slug: string; weight: number; share: number }[];
  correlation: { slugs: string[]; m: number[][] };
  worstStretch: { days: number; pct: number; from: number; to: number }[];
};

/** Risk of holding today's weights through the last year: what it would have swung by, not a forecast. */
export function riskOf(weights: Map<string, number>, closes: Closes, benchmark: { ts: number; c: number }[] | null, end: number, days = 365): Risk {
  const { grid, rets } = alignedReturns(new Map([...closes].filter(([s]) => weights.has(s))), end, days);
  const slugs = [...weights.keys()].filter((s) => rets.has(s));
  const port = grid.map((_, i) => slugs.reduce((a, s) => a + weights.get(s)! * rets.get(s)![i], 0));
  const v = cov(port, port);
  let beta: number | null = null;
  if (benchmark?.length) {
    const b = alignedReturns(new Map([["_b", benchmark]]), end, days).rets.get("_b")!;
    const vb = cov(b, b);
    beta = vb > 0 ? cov(port, b) / vb : null;
  }
  const tail = port.filter((r) => r <= quantile(port, 0.05));
  const wi = port.reduce((w, r, i) => (r < port[w] ? i : w), 0);
  const windows = [7, 30].map((n) => {
    let worst = Infinity, at = 0;
    for (let i = n; i <= port.length; i++) {
      const g = port.slice(i - n, i).reduce((a, r) => a * (1 + r), 1) - 1;
      if (g < worst) { worst = g; at = i; }
    }
    return { days: n, pct: Number.isFinite(worst) ? worst * 100 : 0, from: grid[Math.max(0, at - n)] ?? 0, to: grid[Math.max(0, at - 1)] ?? 0 };
  });
  const top = [...slugs].sort((a, b) => weights.get(b)! - weights.get(a)!).slice(0, 8);
  const corr = top.map((a) => top.map((b) => { const ra = rets.get(a)!, rb = rets.get(b)!; const d = Math.sqrt(cov(ra, ra) * cov(rb, rb)); return d > 0 ? cov(ra, rb) / d : a === b ? 1 : 0; }));
  return {
    days: port.length, vol: Math.sqrt(v * 365) * 100, beta,
    var95: -quantile(port, 0.05) * 100, cvar95: -mean(tail) * 100, worstDay: { ts: grid[wi] ?? 0, pct: (port[wi] ?? 0) * 100 },
    contributions: slugs.map((s) => ({ slug: s, weight: weights.get(s)!, share: v > 0 ? (weights.get(s)! * cov(rets.get(s)!, port)) / v : 0 })).sort((a, b) => b.share - a.share),
    correlation: { slugs: top, m: corr },
    worstStretch: windows,
  };
}

/** Seeded so a page shows the same fan on every load. */
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Where today's mix could be after each horizon, replaying the last year's daily returns in random 5-day blocks
 * (which keeps some of the clustering of bad days). Percentiles of value, as multiples of today's.
 */
export function monteCarlo(dailyReturns: number[], horizons = [30, 90, 365], runs = 2000, seed = 7) {
  if (dailyReturns.length < 30) return null;
  const r = rng(seed), B = 5, max = Math.max(...horizons);
  const ends: number[][] = horizons.map(() => []);
  for (let k = 0; k < runs; k++) {
    let v = 1, d = 0;
    while (d < max) {
      const s = Math.floor(r() * (dailyReturns.length - B));
      for (let j = 0; j < B && d < max; j++, d++) {
        v *= 1 + dailyReturns[s + j];
        const h = horizons.indexOf(d + 1);
        if (h !== -1) ends[h].push(v);
      }
    }
  }
  return horizons.map((h, i) => ({ days: h, p5: quantile(ends[i], 0.05), p25: quantile(ends[i], 0.25), p50: quantile(ends[i], 0.5), p75: quantile(ends[i], 0.75), p95: quantile(ends[i], 0.95),
    lossChance: ends[i].filter((x) => x < 1).length / ends[i].length }));
}

/** Trades to move from current values to target weights (percent of the total). */
export function rebalance(current: Map<string, { value: number; price: number }>, targets: Map<string, number>, total: number) {
  const slugs = [...new Set([...current.keys(), ...targets.keys()])];
  const trades = slugs.map((s) => {
    const now = current.get(s)?.value ?? 0, want = ((targets.get(s) ?? 0) / 100) * total, price = current.get(s)?.price ?? 0;
    return { slug: s, now, want, trade: want - now, qty: price > 0 ? (want - now) / price : null };
  }).filter((t) => Math.abs(t.trade) >= 0.005 * total || t.want > 0 || t.now > 0);
  const turnover = trades.reduce((a, t) => a + Math.abs(t.trade), 0) / 2;
  return { trades: trades.sort((a, b) => Math.abs(b.trade) - Math.abs(a.trade)), turnover, turnoverPct: total ? (turnover / total) * 100 : 0 };
}
