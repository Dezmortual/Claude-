import type { Asset } from "../types";

export type SourceName = "binance" | "frankfurter" | "alpaca" | "demo";

/** Which official, public API feeds each asset. Markets with no free official source stay on the labelled demo series. */
export function sourceFor(a: Asset): { source: SourceName; symbol: string | null } {
  if (a.meta.proxy) return { source: "alpaca", symbol: a.meta.proxy }; // a fund that tracks the market (catalogue PROXIES)
  switch (a.market) {
    case "crypto": return { source: "binance", symbol: `${a.ticker}USDT` };
    case "forex": return { source: "frankfurter", symbol: a.ticker };
    case "stocks": case "etfs": return { source: "alpaca", symbol: a.ticker };
    default: return { source: "demo", symbol: null };
  }
}

export const SOURCE_LABEL: Record<SourceName, string> = {
  binance: "Binance spot (public market data)",
  frankfurter: "European Central Bank reference rates (daily)",
  alpaca: "Alpaca market data (IEX)",
  demo: "Demo series",
};
