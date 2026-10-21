// Technical indicators on closed bars. Pure functions, no I/O; the worker will port these to Python.
import type { Bar, IndicatorRow, PulseCard, Timeframe, Verdict } from "./types";

export const sma = (xs: number[], n: number): number | null =>
  xs.length < n ? null : xs.slice(-n).reduce((a, b) => a + b, 0) / n;

export function emaSeries(xs: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  xs.forEach((x, i) => out.push(i === 0 ? x : x * k + out[i - 1] * (1 - k)));
  return out;
}

export const ema = (xs: number[], n: number): number | null => (xs.length < n ? null : emaSeries(xs, n).at(-1)!);

export function rsi(xs: number[], n = 14): number | null {
  if (xs.length <= n) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = xs[i] - xs[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= n; loss /= n;
  for (let i = n + 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

export function macd(xs: number[]): { line: number; signal: number; hist: number } | null {
  if (xs.length < 35) return null;
  const fast = emaSeries(xs, 12), slow = emaSeries(xs, 26);
  const line = fast.map((f, i) => f - slow[i]);
  const sig = emaSeries(line.slice(25), 9);
  const l = line.at(-1)!, s = sig.at(-1)!;
  return { line: l, signal: s, hist: l - s };
}

function stochK(b: Bar[], n = 14): number | null {
  if (b.length < n) return null;
  const w = b.slice(-n);
  const hi = Math.max(...w.map((x) => x.h)), lo = Math.min(...w.map((x) => x.l));
  return hi === lo ? 50 : ((b.at(-1)!.c - lo) / (hi - lo)) * 100;
}

function cci(b: Bar[], n = 20): number | null {
  if (b.length < n) return null;
  const tp = b.slice(-n).map((x) => (x.h + x.l + x.c) / 3);
  const m = tp.reduce((a, c) => a + c, 0) / n;
  const md = tp.reduce((a, c) => a + Math.abs(c - m), 0) / n;
  return md === 0 ? 0 : (tp.at(-1)! - m) / (0.015 * md);
}

function ultimate(b: Bar[]): number | null {
  if (b.length < 29) return null;
  const bp: number[] = [], tr: number[] = [];
  for (let i = 1; i < b.length; i++) {
    const lo = Math.min(b[i].l, b[i - 1].c), hi = Math.max(b[i].h, b[i - 1].c);
    bp.push(b[i].c - lo); tr.push(hi - lo);
  }
  const avg = (n: number) => bp.slice(-n).reduce((a, c) => a + c, 0) / (tr.slice(-n).reduce((a, c) => a + c, 0) || 1);
  return (100 * (4 * avg(7) + 2 * avg(14) + avg(28))) / 7;
}

const tri = (v: number | null, buy: (v: number) => boolean, sell: (v: number) => boolean): IndicatorRow["signal"] =>
  v === null ? "neutral" : buy(v) ? "buy" : sell(v) ? "sell" : "neutral";

const MA_DEF: [string, "sma" | "ema", number][] = [
  ["SMA 10", "sma", 10], ["SMA 20", "sma", 20], ["SMA 30", "sma", 30], ["SMA 50", "sma", 50], ["SMA 100", "sma", 100],
  ["SMA 200", "sma", 200], ["EMA 10", "ema", 10], ["EMA 20", "ema", 20], ["EMA 50", "ema", 50], ["EMA 200", "ema", 200],
];

export const MIN_BARS = 210;

export function indicatorTable(b: Bar[]): IndicatorRow[] {
  const c = b.map((x) => x.c);
  const last = c.at(-1)!;
  const rows: IndicatorRow[] = MA_DEF.map(([name, kind, n]) => {
    const v = kind === "sma" ? sma(c, n) : ema(c, n);
    return { kind: "ma", name, value: v, signal: tri(v, (m) => last > m * 1.001, (m) => last < m * 0.999) };
  });
  const r = rsi(c), k = stochK(b), cc = cci(b), m = macd(c), uo = ultimate(b);
  const hi14 = Math.max(...b.slice(-14).map((x) => x.h)), lo14 = Math.min(...b.slice(-14).map((x) => x.l));
  const wr = hi14 === lo14 ? -50 : ((hi14 - last) / (hi14 - lo14)) * -100;
  const mom = c.length > 10 ? last - c.at(-11)! : null;
  const roc = c.length > 12 ? ((last - c.at(-13)!) / c.at(-13)!) * 100 : null;
  const med = b.map((x) => (x.h + x.l) / 2);
  const ao = med.length >= 34 ? sma(med, 5)! - sma(med, 34)! : null;
  const e13 = ema(c, 13);
  const bbp = e13 === null ? null : b.at(-1)!.h - e13 + (b.at(-1)!.l - e13);
  rows.push(
    { kind: "oscillator", name: "RSI 14", value: r, signal: tri(r, (v) => v < 30, (v) => v > 70) },
    { kind: "oscillator", name: "Stochastic %K 14", value: k, signal: tri(k, (v) => v < 20, (v) => v > 80) },
    { kind: "oscillator", name: "CCI 20", value: cc, signal: tri(cc, (v) => v < -100, (v) => v > 100) },
    { kind: "oscillator", name: "Williams %R 14", value: wr, signal: tri(wr, (v) => v < -80, (v) => v > -20) },
    { kind: "oscillator", name: "Momentum 10", value: mom, signal: tri(mom, (v) => v > 0, (v) => v < 0) },
    { kind: "oscillator", name: "MACD 12/26/9", value: m?.hist ?? null, signal: tri(m?.hist ?? null, (v) => v > 0, (v) => v < 0) },
    { kind: "oscillator", name: "Rate of change 12", value: roc, signal: tri(roc, (v) => v > 0, (v) => v < 0) },
    { kind: "oscillator", name: "Awesome oscillator", value: ao, signal: tri(ao, (v) => v > 0, (v) => v < 0) },
    { kind: "oscillator", name: "Ultimate oscillator", value: uo, signal: tri(uo, (v) => v < 30, (v) => v > 70) },
    { kind: "oscillator", name: "Bull/bear power 13", value: bbp, signal: tri(bbp, (v) => v > 0, (v) => v < 0) },
  );
  return rows;
}

export function pulse(tf: Timeframe, b: Bar[]): PulseCard & { indicators: IndicatorRow[] } {
  const count = (rows: IndicatorRow[]) => ({
    buy: rows.filter((r) => r.signal === "buy").length,
    neutral: rows.filter((r) => r.signal === "neutral").length,
    sell: rows.filter((r) => r.signal === "sell").length,
  });
  if (b.length < MIN_BARS) {
    return { timeframe: tf, verdict: "unavailable", ma: { buy: 0, neutral: 0, sell: 0 }, osc: { buy: 0, neutral: 0, sell: 0 },
      reason: `Needs ${MIN_BARS} closed bars, has ${b.length}`, indicators: [] };
  }
  const rows = indicatorTable(b);
  const ma = count(rows.filter((r) => r.kind === "ma")), osc = count(rows.filter((r) => r.kind === "oscillator"));
  const score = (ma.buy + osc.buy - ma.sell - osc.sell) / 20;
  const verdict: Verdict = score > 0.5 ? "strong_buy" : score > 0.1 ? "buy" : score < -0.5 ? "strong_sell" : score < -0.1 ? "sell" : "neutral";
  return { timeframe: tf, verdict, ma, osc, indicators: rows };
}
