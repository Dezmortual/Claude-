// The ready-made indicators in the library. Adding one copies it into your indicators, where it can be changed.
export type IndicatorDef = { name: string; lines: string[]; display: "overlay" | "pane"; buyRule: string | null; sellRule: string | null; about?: string };

export const PRESETS: (IndicatorDef & { key: string; about: string })[] = [
  { key: "rsi", name: "RSI 14", lines: ["rsi(close, 14)"], display: "pane", buyRule: "crosses_above(rsi(close, 14), 30)", sellRule: "crosses_below(rsi(close, 14), 70)",
    about: "Momentum from 0 to 100. Buy when it climbs back above 30 (oversold), sell when it drops back below 70 (overbought)." },
  { key: "macd", name: "MACD 12/26/9", lines: ["macd(close, 12, 26)", "macd_signal(close, 12, 26, 9)"], display: "pane",
    buyRule: "crosses_above(macd(close, 12, 26), macd_signal(close, 12, 26, 9))", sellRule: "crosses_below(macd(close, 12, 26), macd_signal(close, 12, 26, 9))",
    about: "Trend momentum. Signals when the MACD line crosses its signal line." },
  { key: "bollinger", name: "Bollinger Bands 20/2", lines: ["bb_upper(close, 20, 2)", "sma(close, 20)", "bb_lower(close, 20, 2)"], display: "overlay",
    buyRule: "crosses_above(close, bb_lower(close, 20, 2))", sellRule: "crosses_below(close, bb_upper(close, 20, 2))",
    about: "A band two standard deviations around the 20-bar average. Signals when price comes back inside from an extreme." },
  { key: "golden-cross", name: "Golden and death cross", lines: ["sma(close, 50)", "sma(close, 200)"], display: "overlay",
    buyRule: "crosses_above(sma(close, 50), sma(close, 200))", sellRule: "crosses_below(sma(close, 50), sma(close, 200))",
    about: "The 50-bar average crossing the 200-bar one. Slow, rare signals that follow long trends." },
  { key: "ema-trend", name: "EMA 20 trend", lines: ["ema(close, 20)"], display: "overlay",
    buyRule: "crosses_above(close, ema(close, 20))", sellRule: "crosses_below(close, ema(close, 20))",
    about: "Price crossing its 20-bar exponential average. Fast, frequent signals." },
  { key: "stoch", name: "Stochastic 14", lines: ["stoch(14)", "sma(stoch(14), 3)"], display: "pane",
    buyRule: "crosses_above(stoch(14), 20)", sellRule: "crosses_below(stoch(14), 80)",
    about: "Where the close sits in the last 14 bars' range. Buy back above 20, sell back below 80." },
  { key: "donchian", name: "Donchian breakout 20", lines: ["highest(high, 20)", "lowest(low, 20)"], display: "overlay",
    buyRule: "close > prev(highest(high, 20), 1)", sellRule: "close < prev(lowest(low, 20), 1)",
    about: "A close above the previous 20-bar high is a breakout; below the 20-bar low, a breakdown." },
  { key: "atr", name: "ATR 14 (volatility)", lines: ["atr(14)"], display: "pane", buyRule: null, sellRule: null,
    about: "Average true range: how far price typically moves in a bar. No signals; useful for sizing stops." },
];
