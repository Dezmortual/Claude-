// Strategy backtests: rules written in the formula language, traded bar by bar on past prices with costs.
// Shared by the server (runs, sweeps) and the browser (charts). Pure functions, no I/O.
//
// No look-ahead: a rule is read at a bar's close and acted on at the next bar's open. Stops and targets fill
// intrabar at their price, or at the open when the bar gaps through them; when one bar touches both, the stop
// counts (the cautious reading). One position at a time, the whole account in or out.
import { evaluate, type Bar, type Series } from "./formula";

export type Side = "long" | "short";
export type StrategySpec = {
  /** Rules may hold {name} placeholders, filled from `params`. */
  entry: string;
  /** null: hold while the entry rule holds, unless a stop, target or time limit closes it first. */
  exit: string | null;
  side: Side;
  params: Record<string, number>;
  stopPct: number | null;
  takePct: number | null;
  maxBars: number | null;
  /** Each way, in percent of the trade. */
  feePct: number;
  slippagePct: number;
};
export type ExitReason = "rule" | "stop" | "target" | "time" | "end";
export type Trade = { entryTs: number; entryPrice: number; exitTs: number; exitPrice: number; side: Side; bars: number; returnPct: number; reason: ExitReason };
export type Metrics = {
  bars: number; from: number; to: number; years: number;
  totalReturn: number; cagr: number | null; maxDrawdown: number; sharpe: number | null; sortino: number | null;
  trades: number; winRate: number | null; avgWin: number | null; avgLoss: number | null; profitFactor: number | null;
  expectancy: number | null; avgBars: number | null; exposure: number; costsPct: number;
  buyHold: number; buyHoldDrawdown: number;
  /** Per-bar returns' shape, for the deflated Sharpe. */
  perBar: { sharpe: number; skew: number; kurt: number; n: number };
};
export type Result = { equity: { ts: number; v: number }[]; trades: Trade[]; metrics: Metrics };

export const PLACEHOLDER = /\{([a-z][a-z0-9_]{0,19})\}/g;
/** The {names} a rule uses, in order of first appearance. */
export function placeholders(...rules: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const r of rules) for (const m of (r ?? "").matchAll(PLACEHOLDER)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
export function fill(rule: string, params: Record<string, number>): string {
  return rule.replace(PLACEHOLDER, (_, k: string) => {
    if (!Object.hasOwn(params, k) || !Number.isFinite(params[k])) throw new Error(`Give {${k}} a value`);
    return String(params[k]);
  });
}

const truthy = (x: number | null | undefined) => x !== null && x !== undefined && x !== 0 && !Number.isNaN(x);
const YEAR_MS = 365.25 * 86_400_000;

/** Bars per year, from the bars themselves: daily stocks give about 252, daily crypto 365. */
export function barsPerYear(bars: Bar[]): number {
  if (bars.length < 2) return 252;
  return (bars.length - 1) / ((bars.at(-1)!.ts - bars[0].ts) / YEAR_MS);
}

/** Runs the strategy over bars[from..]; bars before `from` only warm the indicators up. */
export function runStrategy(bars: Bar[], spec: StrategySpec, from = 0, to = bars.length): Result {
  const all = bars.slice(0, to);
  const entry: Series = evaluate(fill(spec.entry, spec.params), all);
  const exit: Series | null = spec.exit ? evaluate(fill(spec.exit, spec.params), all) : null;
  const dir = spec.side === "long" ? 1 : -1;
  const slip = spec.slippagePct / 100, fee = spec.feePct / 100;
  const buyFill = (p: number) => p * (1 + slip), sellFill = (p: number) => p * (1 - slip);

  let cash = 1, costs = 0;
  let pos: { i: number; price: number; units: number; stake: number } | null = null;
  let wantIn = false, wantOut: ExitReason | null = null;
  const trades: Trade[] = [], equity: { ts: number; v: number }[] = [];
  let inBars = 0;

  const close = (i: number, raw: number, reason: ExitReason, ts: number) => {
    const p = pos!;
    const px = dir === 1 ? sellFill(raw) : buyFill(raw);
    const gross = p.units * p.price + dir * p.units * (px - p.price); // what went in after the entry fee, plus the move
    const f = Math.abs(p.units * px) * fee;
    costs += f + Math.abs(p.units) * Math.abs(px - raw);
    cash = gross - f;
    trades.push({ entryTs: all[p.i].ts, entryPrice: p.price, exitTs: ts, exitPrice: px, side: spec.side, bars: i - p.i, returnPct: (cash / p.stake - 1) * 100, reason });
    pos = null;
  };

  for (let i = from; i < all.length; i++) {
    const b = all[i];
    // At the open: act on what the last close said.
    if (pos && wantOut) close(i, b.o, wantOut, b.ts);
    else if (!pos && wantIn) {
      const px = dir === 1 ? buyFill(b.o) : sellFill(b.o);
      const f = cash * fee;
      costs += f + (cash - f) / px * Math.abs(px - b.o);
      pos = { i, price: px, units: (cash - f) / px, stake: cash };
      cash = 0;
    }
    wantIn = false; wantOut = null;
    // During the bar: stops and targets.
    if (pos) {
      const stop = spec.stopPct ? pos.price * (1 - dir * spec.stopPct / 100) : null;
      const take = spec.takePct ? pos.price * (1 + dir * spec.takePct / 100) : null;
      const hitStop = stop !== null && (dir === 1 ? b.l <= stop : b.h >= stop);
      const hitTake = take !== null && (dir === 1 ? b.h >= take : b.l <= take);
      if (hitStop) close(i, dir === 1 ? Math.min(stop!, b.o) : Math.max(stop!, b.o), "stop", b.ts);
      else if (hitTake) close(i, dir === 1 ? Math.max(take!, b.o) : Math.min(take!, b.o), "target", b.ts);
    }
    // At the close: mark to market, then read the rules for tomorrow's open.
    const value = pos ? pos.units * pos.price + dir * pos.units * (b.c - pos.price) : cash;
    equity.push({ ts: b.ts, v: value });
    if (pos) {
      inBars++;
      const ruleOut = exit ? truthy(exit[i]) : !truthy(entry[i]) && !(spec.stopPct || spec.takePct || spec.maxBars);
      const timeOut = !!spec.maxBars && i + 1 - pos.i >= spec.maxBars;
      wantOut = ruleOut ? "rule" : timeOut ? "time" : null;
    } else wantIn = truthy(entry[i]) && i + 1 < all.length;
  }
  // Still open at the end: valued at the last close, net of what selling would cost.
  if (pos) { close(all.length - 1, all.at(-1)!.c, "end", all.at(-1)!.ts); equity[equity.length - 1] = { ts: all.at(-1)!.ts, v: cash }; }

  return { equity, trades, metrics: metrics(all.slice(from), equity, trades, inBars, costs) };
}

function drawdown(values: number[]): number {
  let peak = -Infinity, worst = 0;
  for (const v of values) { peak = Math.max(peak, v); worst = Math.min(worst, v / peak - 1); }
  return worst * 100;
}

function moments(xs: number[]) {
  const n = xs.length, mean = xs.reduce((a, b) => a + b, 0) / (n || 1);
  const m2 = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n || 1);
  const sd = Math.sqrt(m2);
  const skew = sd ? xs.reduce((a, x) => a + ((x - mean) / sd) ** 3, 0) / n : 0;
  const kurt = sd ? xs.reduce((a, x) => a + ((x - mean) / sd) ** 4, 0) / n : 3;
  return { mean, sd, skew, kurt, n };
}

function metrics(bars: Bar[], equity: { ts: number; v: number }[], trades: Trade[], inBars: number, costs: number): Metrics {
  const n = bars.length, from = bars[0]?.ts ?? 0, to = bars.at(-1)?.ts ?? 0;
  const years = (to - from) / YEAR_MS, perYear = barsPerYear(bars);
  const vals = equity.map((e) => e.v), last = vals.at(-1) ?? 1;
  const rets = vals.slice(1).map((v, i) => v / vals[i] - 1);
  const m = moments(rets);
  const down = Math.sqrt(rets.reduce((a, r) => a + Math.min(r, 0) ** 2, 0) / (rets.length || 1));
  const wins = trades.filter((t) => t.returnPct > 0), losses = trades.filter((t) => t.returnPct <= 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const grossWin = wins.reduce((a, t) => a + t.returnPct, 0), grossLoss = -losses.reduce((a, t) => a + t.returnPct, 0);
  return {
    bars: n, from, to, years,
    totalReturn: (last - 1) * 100,
    cagr: years >= 0.5 && last > 0 ? (last ** (1 / years) - 1) * 100 : null,
    maxDrawdown: drawdown(vals),
    sharpe: m.sd > 0 && rets.length > 20 ? (m.mean / m.sd) * Math.sqrt(perYear) : null,
    sortino: down > 0 && rets.length > 20 ? (m.mean / down) * Math.sqrt(perYear) : null,
    trades: trades.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : null,
    avgWin: avg(wins.map((t) => t.returnPct)), avgLoss: avg(losses.map((t) => t.returnPct)),
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    expectancy: avg(trades.map((t) => t.returnPct)), avgBars: avg(trades.map((t) => t.bars)),
    exposure: n ? (inBars / n) * 100 : 0, costsPct: costs * 100,
    buyHold: n ? (bars.at(-1)!.c / bars[0].c - 1) * 100 : 0,
    buyHoldDrawdown: drawdown(bars.map((b) => b.c)),
    perBar: { sharpe: m.sd ? m.mean / m.sd : 0, skew: m.skew, kurt: m.kurt, n: m.n },
  };
}

// ---------------------------------------------------------------- the luck test

/** Standard normal CDF (Abramowitz and Stegun 7.1.26 via erf). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
/** Inverse normal CDF (Acklam's rational approximation). */
export function normInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  if (q < 0.02425) { const r = Math.sqrt(-2 * Math.log(q)); return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1); }
  if (q > 1 - 0.02425) return -normInv(1 - q);
  const r = q - 0.5, s = r * r;
  return (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}

/**
 * The chance the strategy's Sharpe is really above zero once every setting tried is counted (Bailey and López de
 * Prado's deflated Sharpe). `tries` is how many versions were tested; `spread` is the variance of the per-bar Sharpe
 * across them, when known. With one try it is the plain probabilistic Sharpe.
 */
export function deflatedSharpe(perBar: Metrics["perBar"], tries: number, spread?: number): number | null {
  const { sharpe: sr, skew, kurt, n } = perBar;
  if (n < 30) return null;
  const v = spread && spread > 0 ? spread : 1 / (n - 1);
  const g = 0.5772156649;
  const sr0 = tries > 1 ? Math.sqrt(v) * ((1 - g) * normInv(1 - 1 / tries) + g * normInv(1 - 1 / (tries * Math.E))) : 0;
  const denom = 1 - skew * sr + ((kurt - 1) / 4) * sr * sr;
  if (!(denom > 0)) return null;
  return normCdf(((sr - sr0) * Math.sqrt(n - 1)) / Math.sqrt(denom));
}

// ---------------------------------------------------------------- sweeps

export type Range = { name: string; from: number; to: number; step: number };
export type SweepRow = { params: Record<string, number>; metrics: Metrics };
export type Fold = { trainFrom: number; testFrom: number; testTo: number; params: Record<string, number>; trainSharpe: number | null; test: Metrics };
export type Sweep = {
  tried: number; objective: "sharpe";
  /** Every combination on the whole period, best first: in-sample, so the top row flatters. */
  rows: SweepRow[];
  /** Walk-forward: settings picked on the past only, then traded on the next stretch they never saw. */
  folds: Fold[];
  outOfSample: { equity: { ts: number; v: number }[]; metrics: Metrics } | null;
  /** Variance of the per-bar Sharpe across combinations, for the luck test. */
  spread: number;
};

export const MAX_COMBOS = 120;

export function grid(ranges: Range[]): Record<string, number>[] {
  let out: Record<string, number>[] = [{}];
  for (const r of ranges) {
    const vals: number[] = [];
    for (let x = r.from; x <= r.to + 1e-9 && vals.length <= MAX_COMBOS; x += r.step) vals.push(+x.toFixed(6));
    out = out.flatMap((o) => vals.map((x) => ({ ...o, [r.name]: x })));
    if (out.length > MAX_COMBOS) throw new Error(`That's ${out.length}+ combinations; keep it to ${MAX_COMBOS} or fewer (widen the steps)`);
  }
  return out;
}

const score = (m: Metrics) => (m.trades >= 3 && m.sharpe !== null ? m.sharpe : -Infinity);

/**
 * Tries every combination on [from, end) and, separately, walks forward: the first 40% of the period trains, the
 * rest is cut into `folds` test stretches; before each, the best settings on everything before it are chosen.
 */
export function sweep(bars: Bar[], spec: StrategySpec, ranges: Range[], from = 0, folds = 3): Sweep {
  const combos = grid(ranges);
  const at = (p: Record<string, number>) => ({ ...spec, params: { ...spec.params, ...p } });
  const rows = combos.map((p) => ({ params: p, metrics: runStrategy(bars, at(p), from).metrics }))
    .sort((a, b) => score(b.metrics) - score(a.metrics));
  const srs = rows.map((r) => r.metrics.perBar.sharpe), mean = srs.reduce((a, b) => a + b, 0) / (srs.length || 1);
  const spread = srs.reduce((a, s) => a + (s - mean) ** 2, 0) / (srs.length || 1);

  const span = bars.length - from, first = from + Math.floor(span * 0.4), len = Math.floor((bars.length - first) / folds);
  const out: Fold[] = [];
  let stitched: { ts: number; v: number }[] = [], level = 1;
  if (len >= 20) {
    for (let k = 0; k < folds; k++) {
      const testFrom = first + k * len, testTo = k === folds - 1 ? bars.length : testFrom + len;
      let best: Record<string, number> = combos[0], bestScore = -Infinity;
      for (const p of combos) {
        const s = score(runStrategy(bars, at(p), from, testFrom).metrics);
        if (s > bestScore) { bestScore = s; best = p; }
      }
      const test = runStrategy(bars, at(best), testFrom, testTo);
      out.push({ trainFrom: bars[from].ts, testFrom: bars[testFrom].ts, testTo: bars[testTo - 1].ts, params: best,
        trainSharpe: Number.isFinite(bestScore) ? bestScore : null, test: test.metrics });
      stitched = stitched.concat(test.equity.map((e) => ({ ts: e.ts, v: e.v * level })));
      level = stitched.at(-1)!.v;
    }
  }
  const oos = stitched.length ? { equity: stitched, metrics: equityMetrics(bars.slice(first), stitched, out) } : null;
  return { tried: combos.length * (1 + out.length), objective: "sharpe", rows, folds: out, outOfSample: oos, spread };
}

/** Metrics for a stitched curve: trade counts come from the folds. */
function equityMetrics(bars: Bar[], equity: { ts: number; v: number }[], folds: Fold[]): Metrics {
  const m = metrics(bars, equity, [], 0, 0);
  const t = folds.reduce((a, f) => a + f.test.trades, 0);
  const w = folds.reduce((a, f) => a + (f.test.winRate ?? 0) * f.test.trades / 100, 0);
  return { ...m, trades: t, winRate: t ? (w / t) * 100 : null, exposure: folds.reduce((a, f) => a + f.test.exposure * f.test.bars, 0) / (m.bars || 1),
    costsPct: folds.reduce((a, f) => a + f.test.costsPct, 0) };
}

/** At most `n` points, keeping the first and last: enough to draw, small enough to store. */
export function thin<T>(xs: T[], n = 400): T[] {
  if (xs.length <= n) return xs;
  const step = (xs.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => xs[Math.round(i * step)]);
}
