// Shapes shared by the data layer, API routes and screens. Mirrors replica/schema.sql.

export type MarketCode = "crypto" | "forex" | "stocks" | "commodities" | "indices" | "etfs" | "bonds";
export type Timeframe = "5m" | "30m" | "1h" | "1d" | "1w";
export type Horizon = "1d" | "7d" | "1m" | "1y" | "5y" | "10y";
export type Signal = "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
export type Verdict = Signal | "unavailable";
export type PlanCode = "free" | "crypto" | "pro" | "unlimited";
export type Tab = "investing" | "day_trading";

export interface Market {
  code: MarketCode;
  name: string;
  sessionBased: boolean; // closes overnight/weekends: horizons are sessions, not days
  locked?: boolean;
}

export interface Asset {
  slug: string;
  ticker: string;
  name: string;
  market: MarketCode;
  quoteUnit: string;
  isPublic: boolean;
  meta: { maxSupply?: number; dividendYieldPct?: number; about?: string; proxy?: string };
}

export interface Bar { ts: number; o: number; h: number; l: number; c: number; v: number }

export interface Quote {
  price: number;
  change24hPct: number;
  observedAt: string;
  checkedAt: string;
  crosscheckSpreadPct: number;
  status: "ok" | "stale" | "diverged";
  source: string;
  crosscheckSource: string;
}

export interface ForecastPoint {
  horizon: Horizon;
  kind: "forecast" | "scenario";
  low: number;
  mid: number;
  high: number;
  changePct: number; // mid vs base price
  pUp: number | null;
  signal: Signal | null;
  targetAt: string;
}

export interface PathRow { periodStart: string; label: string; low: number; mid: number; high: number; changePct: number }

export interface ScenarioYear { year: number; bear: number; base: number; bull: number; baseRoiPct: number }

export interface Scenarios {
  years: ScenarioYear[];
  assumptions: { bearCagrPct: number; baseCagrPct: number; bullCagrPct: number; note: string };
}

export interface IndicatorRow { kind: "ma" | "oscillator"; name: string; value: number | null; signal: "buy" | "neutral" | "sell" }

export interface PulseCard {
  timeframe: Timeframe;
  verdict: Verdict;
  ma: { buy: number; neutral: number; sell: number };
  osc: { buy: number; neutral: number; sell: number };
  reason?: string; // set when unavailable
}

export interface Metrics {
  macd: "bullish" | "bearish" | "neutral";
  maCross: "golden" | "death" | "none";
  ma200Trend: "up" | "down" | "flat";
  pctFromMa200: number | null;
  volatilityPct: number;
  volatilityLabel: "low" | "medium" | "high";
  sharpe: number | null;
  dividendYieldPct: number;
  range: { d20: { hi: number; lo: number }; d90: { hi: number; lo: number } };
  ath: { price: number; date: string; pctFrom: number };
}

export interface ForecastRow {
  asset: Asset;
  locked: boolean;
  demo?: boolean; // prices come from the generated demo series, not a market-data source
  price?: number;
  change24hPct?: number;
  horizons?: Partial<Record<Horizon, { mid: number; changePct: number }>>;
  signal?: Signal;
  pUp?: number;
  intraday?: Partial<Record<"5m" | "30m" | "1h", Verdict>>;
  metrics?: Pick<Metrics, "macd" | "maCross" | "ma200Trend" | "pctFromMa200" | "volatilityPct" | "volatilityLabel" | "sharpe" | "dividendYieldPct">;
}

export interface ForecastQuery {
  market?: MarketCode | "all";
  tab?: Tab;
  signal?: Signal | "all";
  volatility?: "low" | "medium" | "high" | "all";
  q?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  perPage?: number;
}

export interface ForecastPage { rows: ForecastRow[]; page: number; pages: number; total: number; runAt: string; tabLocked: boolean }

export interface Mover { asset: Asset; changePct: number; price: number }

export interface Plan {
  code: PlanCode;
  name: string;
  blurb: string;
  priceMonthCents: number;
  priceYearCents: number; // per year, billed yearly
  currency: string;
  markets: MarketCode[];
  publicOnly: boolean;
  dayTrading: boolean;
  watchlistAlerts: boolean;
  maxAlerts: number | null;
  highlight?: boolean;
}

export interface User { id: string; name: string; email: string; createdAt: string; timezone: string }

export interface Subscription { plan: PlanCode; interval: "month" | "year"; status: "active" | "canceled"; currentPeriodEnd: string; cancelAtPeriodEnd: boolean }

export interface Viewer { user: User | null; plan: Plan; subscription: Subscription | null }

export type AlertCondition = "price_above" | "price_below" | "signal_becomes" | "forecast_move_above" | "indicator_signal";

export interface Alert {
  id: string;
  assetSlug: string;
  condition: AlertCondition;
  threshold: number | null;
  signal: Signal | null;
  timeframe: Timeframe | null;
  indicatorId: string | null;
  indicatorName: string | null;
  channels: ("email" | "push")[];
  isActive: boolean;
  cooldownMinutes: number;
  lastFiredAt: string | null;
  createdAt: string;
}

/** One of your indicators (src/lib/indicators): up to three plotted formulas, optional buy and sell rules. */
export interface UserIndicator {
  id: string;
  name: string;
  lines: string[];
  display: "overlay" | "pane";
  buyRule: string | null;
  sellRule: string | null;
  updatedAt: string;
}

export interface TablePrefs { visibleColumns: string[]; rowsPerPage: 10 | 20 | 50 | 100; defaultTab: Tab }

export class DataError extends Error {
  constructor(public code: "unauthorized" | "forbidden" | "not_found" | "invalid" | "limit" | "conflict" | "rate_limited", message: string) {
    super(message);
  }
}
