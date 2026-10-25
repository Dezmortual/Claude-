// Ready-made strategies for the backtest lab, written in the formula language with {placeholders} to tune.
export type Param = { name: string; label: string; value: number; from: number; to: number; step: number };
export type Template = { key: string; name: string; family: "Trend" | "Breakout" | "Mean reversion" | "Momentum"; about: string;
  entry: string; exit: string | null; params: Param[] };

export const TEMPLATES: Template[] = [
  { key: "ma-cross", name: "Moving-average cross", family: "Trend",
    about: "In when the fast average crosses above the slow one, out when it crosses back below.",
    entry: "crosses_above(sma(close, {fast}), sma(close, {slow}))", exit: "crosses_below(sma(close, {fast}), sma(close, {slow}))",
    params: [{ name: "fast", label: "Fast average (bars)", value: 20, from: 10, to: 50, step: 10 }, { name: "slow", label: "Slow average (bars)", value: 100, from: 60, to: 200, step: 20 }] },
  { key: "above-average", name: "Above the long average", family: "Trend",
    about: "Holds while the close is above its long average; the classic slow trend filter.",
    entry: "close > sma(close, {n})", exit: "close < sma(close, {n})",
    params: [{ name: "n", label: "Average (bars)", value: 200, from: 50, to: 250, step: 25 }] },
  { key: "breakout", name: "Channel breakout", family: "Breakout",
    about: "In on a close above the highest high of the last n bars, out on a close below the lowest low of the last m.",
    entry: "close > prev(highest(high, {n}), 1)", exit: "close < prev(lowest(low, {m}), 1)",
    params: [{ name: "n", label: "Breakout window (bars)", value: 20, from: 10, to: 60, step: 10 }, { name: "m", label: "Exit window (bars)", value: 10, from: 5, to: 30, step: 5 }] },
  { key: "rsi-dip", name: "RSI dip buy", family: "Mean reversion",
    about: "Buys when RSI climbs back above an oversold level, sells once it is back above a recovery level.",
    entry: "crosses_above(rsi(close, {n}), {low})", exit: "rsi(close, {n}) > {high}",
    params: [{ name: "n", label: "RSI length", value: 14, from: 7, to: 21, step: 7 }, { name: "low", label: "Oversold level", value: 30, from: 20, to: 40, step: 5 },
      { name: "high", label: "Exit level", value: 60, from: 50, to: 70, step: 10 }] },
  { key: "band-revert", name: "Band snap-back", family: "Mean reversion",
    about: "Buys a close back inside the lower Bollinger band, sells at the middle line.",
    entry: "crosses_above(close, bb_lower(close, {n}, {k}))", exit: "close > sma(close, {n})",
    params: [{ name: "n", label: "Band length", value: 20, from: 10, to: 40, step: 10 }, { name: "k", label: "Band width (st. devs)", value: 2, from: 1.5, to: 3, step: 0.5 }] },
  { key: "macd", name: "MACD momentum", family: "Momentum",
    about: "In when the MACD line crosses above its signal line, out when it crosses below.",
    entry: "crosses_above(macd(close, {fast}, {slow}), macd_signal(close, {fast}, {slow}, 9))",
    exit: "crosses_below(macd(close, {fast}, {slow}), macd_signal(close, {fast}, {slow}, 9))",
    params: [{ name: "fast", label: "Fast", value: 12, from: 8, to: 16, step: 4 }, { name: "slow", label: "Slow", value: 26, from: 20, to: 40, step: 10 }] },
];
export const templateNamed = (k: string) => TEMPLATES.find((t) => t.key === k);

/** Trading costs per side, in percent. Rough retail figures; change them to your broker's. */
export const COSTS = {
  crypto: { label: "Crypto exchange", feePct: 0.1, slippagePct: 0.05 },
  stocks: { label: "US stocks and funds", feePct: 0, slippagePct: 0.05 },
  forex: { label: "Forex", feePct: 0, slippagePct: 0.01 },
  none: { label: "No costs (unrealistic)", feePct: 0, slippagePct: 0 },
} as const;
export type CostKey = keyof typeof COSTS;
