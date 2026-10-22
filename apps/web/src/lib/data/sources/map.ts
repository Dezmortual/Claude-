import type { Asset } from "../types";

export type SourceName = "binance" | "twelvedata" | "frankfurter" | "alpaca" | "yields" | "demo";

/** Which official, public API feeds each asset. Markets with no free official source stay on the labelled demo series. */
export function sourceFor(a: Asset): { source: SourceName; symbol: string | null } {
  if (a.meta.proxy) return { source: "alpaca", symbol: a.meta.proxy }; // a fund that tracks the market (catalogue PROXIES)
  switch (a.market) {
    case "crypto": return { source: "binance", symbol: `${a.ticker}USDT` };
    case "forex": return { source: "twelvedata", symbol: a.ticker }; // ECB daily rates (frankfurter) without a key
    case "stocks": case "etfs": return { source: "alpaca", symbol: a.ticker };
    case "bonds": return { source: "yields", symbol: a.ticker };
    default: return { source: "demo", symbol: null };
  }
}

export const SOURCE_LABEL: Record<SourceName, string> = {
  binance: "Binance spot (public market data)",
  twelvedata: "Twelve Data forex rates",
  frankfurter: "European Central Bank reference rates (daily)",
  alpaca: "Alpaca market data (IEX)",
  yields: "Official daily government bond yields",
  demo: "Demo series",
};
