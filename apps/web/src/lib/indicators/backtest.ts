// How an indicator's past signals did, on the bars it was given. In-sample and before costs: it describes the past,
// it doesn't promise anything. Shared by the editor preview and the Indicators page.
import { evaluate, signalBars, type Bar } from "./formula";

export const HORIZONS = [1, 5, 20] as const; // bars after the signal; on daily bars: a day, a week, a month

export type SideStats = {
  signals: number;
  /** Per horizon: how many signals had that much history after them, share that moved the right way, average move %. */
  after: { bars: number; n: number; right: number; avg: number }[];
  /** Median of the worst move against each signal within 5 bars, in % (negative is against). */
  worstAgainst: number | null;
};
export type Backtest = { bars: number; from: number; to: number; buy: SideStats | null; sell: SideStats | null;
  /** The same horizons from every bar: what "no indicator at all" gives. */
  base: { bars: number; up: number; avg: number }[] };

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function side(bars: Bar[], at: number[], dir: 1 | -1): SideStats {
  const after = HORIZONS.map((h) => {
    const moves = at.filter((i) => i + h < bars.length).map((i) => (bars[i + h].c / bars[i].c - 1) * 100 * dir);
    return { bars: h, n: moves.length, right: moves.length ? moves.filter((m) => m > 0).length / moves.length : 0, avg: moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : 0 };
  });
  const worst = at.filter((i) => i + 5 < bars.length).map((i) => {
    const w = bars.slice(i + 1, i + 6), entry = bars[i].c;
    return dir === 1 ? (Math.min(...w.map((b) => b.l)) / entry - 1) * 100 : -(Math.max(...w.map((b) => b.h)) / entry - 1) * 100;
  });
  return { signals: at.length, after, worstAgainst: median(worst) };
}

export function backtest(bars: Bar[], rules: { buy?: string | null; sell?: string | null }, from = 0): Backtest {
  const inRange = (i: number) => i >= from;
  const buy = rules.buy ? side(bars, signalBars(evaluate(rules.buy, bars)).filter(inRange), 1) : null;
  const sell = rules.sell ? side(bars, signalBars(evaluate(rules.sell, bars)).filter(inRange), -1) : null;
  const base = HORIZONS.map((h) => {
    const moves: number[] = [];
    for (let i = from; i + h < bars.length; i++) moves.push((bars[i + h].c / bars[i].c - 1) * 100);
    return { bars: h, up: moves.length ? moves.filter((m) => m > 0).length / moves.length : 0, avg: moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : 0 };
  });
  return { bars: bars.length - from, from: bars[from]?.ts ?? 0, to: bars.at(-1)?.ts ?? 0, buy, sell, base };
}
