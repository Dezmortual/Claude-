import type { Asset, Market, MarketCode, Plan } from "./types";

export const MARKETS: Market[] = [
  { code: "crypto", name: "Crypto", sessionBased: false },
  { code: "forex", name: "Forex", sessionBased: true },
  { code: "stocks", name: "Stocks", sessionBased: true },
  { code: "commodities", name: "Commodities", sessionBased: true },
  { code: "indices", name: "Indices", sessionBased: true },
  { code: "etfs", name: "ETFs", sessionBased: true },
  { code: "bonds", name: "Bonds & yields", sessionBased: true },
];

// [slug, ticker, name, anchor price for the demo series, public]
type Row = [string, string, string, number, boolean?];

const crypto: Row[] = [
  ["bitcoin", "BTC", "Bitcoin", 84500, true], ["ethereum", "ETH", "Ethereum", 3200, true],
  ["xrp", "XRP", "XRP", 2.4, true], ["bnb", "BNB", "BNB", 610, true], ["solana", "SOL", "Solana", 165, true],
  ["dogecoin", "DOGE", "Dogecoin", 0.19, true], ["cardano", "ADA", "Cardano", 0.71, true],
  ["tron", "TRX", "TRON", 0.27, true], ["chainlink", "LINK", "Chainlink", 16.8, true],
  ["avalanche", "AVAX", "Avalanche", 24.5, true], ["stellar", "XLM", "Stellar", 0.33], ["sui", "SUI", "Sui", 3.1],
  ["shiba-inu", "SHIB", "Shiba Inu", 0.000012], ["hedera", "HBAR", "Hedera", 0.21], ["polkadot", "DOT", "Polkadot", 4.6],
  ["litecoin", "LTC", "Litecoin", 92], ["bitcoin-cash", "BCH", "Bitcoin Cash", 410], ["uniswap", "UNI", "Uniswap", 8.9],
  ["near", "NEAR", "NEAR Protocol", 2.9], ["aptos", "APT", "Aptos", 5.6], ["aave", "AAVE", "Aave", 240],
  ["internet-computer", "ICP", "Internet Computer", 5.9], ["ethereum-classic", "ETC", "Ethereum Classic", 19.4],
  ["filecoin", "FIL", "Filecoin", 3.2], ["cosmos", "ATOM", "Cosmos", 4.8], ["arbitrum", "ARB", "Arbitrum", 0.42],
  ["optimism", "OP", "Optimism", 0.78], ["injective", "INJ", "Injective", 12.6], ["render", "RENDER", "Render", 4.1],
  ["immutable", "IMX", "Immutable", 0.62], ["the-graph", "GRT", "The Graph", 0.11], ["algorand", "ALGO", "Algorand", 0.24],
  ["vechain", "VET", "VeChain", 0.028], ["sei", "SEI", "Sei", 0.27], ["pepe", "PEPE", "Pepe", 0.0000098],
  ["ethena", "ENA", "Ethena", 0.55],
];
const forex: Row[] = [
  ["eurusd", "EUR/USD", "Euro / US Dollar", 1.12], ["gbpusd", "GBP/USD", "British Pound / US Dollar", 1.33],
  ["usdjpy", "USD/JPY", "US Dollar / Japanese Yen", 148.5], ["audusd", "AUD/USD", "Australian Dollar / US Dollar", 0.66],
  ["usdchf", "USD/CHF", "US Dollar / Swiss Franc", 0.81], ["usdcad", "USD/CAD", "US Dollar / Canadian Dollar", 1.37],
];
const stocks: Row[] = [
  ["aapl", "AAPL", "Apple", 228], ["nvda", "NVDA", "NVIDIA", 182], ["msft", "MSFT", "Microsoft", 512],
  ["tsla", "TSLA", "Tesla", 330], ["amzn", "AMZN", "Amazon", 221], ["googl", "GOOGL", "Alphabet", 205],
];
const commodities: Row[] = [["gold", "XAU", "Gold", 3650], ["silver", "XAG", "Silver", 41.2], ["wti", "WTI", "Crude oil (WTI)", 63.8]];
const indices: Row[] = [["sp500", "SPX", "S&P 500", 6480], ["nasdaq100", "NDX", "Nasdaq 100", 23500], ["dax", "DAX", "DAX 40", 23700]];
const etfs: Row[] = [["spy", "SPY", "SPDR S&P 500 ETF", 645], ["qqq", "QQQ", "Invesco QQQ", 572], ["gld", "GLD", "SPDR Gold Shares", 336]];
const bonds: Row[] = [["us-10y", "US10Y", "US 10-year yield", 4.12], ["de-10y", "DE10Y", "Germany 10-year yield", 2.68], ["uk-10y", "GB10Y", "UK 10-year yield", 4.61]];

const DIVIDENDS: Record<string, number> = { aapl: 0.45, msft: 0.68, googl: 0.42, nvda: 0.03, spy: 1.15, qqq: 0.55 };
const MAX_SUPPLY: Record<string, number> = { bitcoin: 21_000_000, litecoin: 84_000_000, "bitcoin-cash": 21_000_000, cardano: 45_000_000_000 };
const UNITS: Record<MarketCode, string> = {
  crypto: "USD", forex: "quote currency", stocks: "USD per share", commodities: "USD", indices: "index points", etfs: "USD per share", bonds: "% yield",
};

export const ANCHORS: Record<string, number> = {};

function build(market: MarketCode, rows: Row[]): Asset[] {
  return rows.map(([slug, ticker, name, anchor, pub]) => {
    ANCHORS[slug] = anchor;
    return {
      slug, ticker, name, market, quoteUnit: UNITS[market], isPublic: !!pub,
      meta: { maxSupply: MAX_SUPPLY[slug], dividendYieldPct: DIVIDENDS[slug] ?? 0 },
    };
  });
}

export const ASSETS: Asset[] = [
  ...build("crypto", crypto), ...build("forex", forex), ...build("stocks", stocks), ...build("commodities", commodities),
  ...build("indices", indices), ...build("etfs", etfs), ...build("bonds", bonds),
];

export const ASSET_BY_SLUG = new Map(ASSETS.map((a) => [a.slug, a]));

// Annualised volatility used by the demo series generator, per market.
export const DEMO_VOL: Record<MarketCode, number> = {
  crypto: 0.7, forex: 0.08, stocks: 0.32, commodities: 0.22, indices: 0.17, etfs: 0.17, bonds: 0.18,
};

// Long-horizon scenario assumptions (annual growth), our own, shown on every asset page.
export const SCENARIO_CAGR: Record<MarketCode, [number, number, number]> = {
  crypto: [-0.15, 0.1, 0.35], stocks: [-0.05, 0.07, 0.15], indices: [-0.04, 0.06, 0.12], etfs: [-0.04, 0.06, 0.12],
  commodities: [-0.05, 0.03, 0.1], forex: [-0.03, 0, 0.03], bonds: [-0.08, 0, 0.08],
};

// Draft plans. Prices are placeholders until /replica-launch sets them.
export const PLANS: Plan[] = [
  { code: "free", name: "Free", blurb: "The top 10 crypto assets, daily signals.", priceMonthCents: 0, priceYearCents: 0, currency: "usd",
    markets: ["crypto"], publicOnly: true, dayTrading: false, watchlistAlerts: false, maxAlerts: 0 },
  { code: "crypto", name: "Crypto", blurb: "Every crypto asset, intraday signals, watchlist and alerts.", priceMonthCents: 1500, priceYearCents: 14400, currency: "usd",
    markets: ["crypto"], publicOnly: false, dayTrading: true, watchlistAlerts: true, maxAlerts: 10 },
  { code: "pro", name: "Pro", blurb: "Crypto and forex, more alerts.", priceMonthCents: 3900, priceYearCents: 37200, currency: "usd",
    markets: ["crypto", "forex"], publicOnly: false, dayTrading: true, watchlistAlerts: true, maxAlerts: 50, highlight: true },
  { code: "unlimited", name: "All markets", blurb: "All seven markets, unlimited alerts.", priceMonthCents: 7900, priceYearCents: 75600, currency: "usd",
    markets: ["crypto", "forex", "stocks", "commodities", "indices", "etfs", "bonds"], publicOnly: false, dayTrading: true, watchlistAlerts: true, maxAlerts: null },
];

export const PLAN_BY_CODE = new Map(PLANS.map((p) => [p.code, p]));
