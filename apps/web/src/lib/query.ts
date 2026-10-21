import type { ForecastQuery, MarketCode, Signal, Tab } from "@/lib/data";

export type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const MARKETS = ["all", "crypto", "forex", "stocks", "commodities", "indices", "etfs", "bonds"];
const SIGNALS = ["all", "strong_buy", "buy", "neutral", "sell", "strong_sell"];

export function parseForecastQuery(sp: SP, defaults: Partial<ForecastQuery> = {}): Required<Omit<ForecastQuery, "sort" | "dir">> & Pick<ForecastQuery, "sort" | "dir"> {
  const m = one(sp.market) ?? defaults.market ?? "all";
  const s = one(sp.signal) ?? "all";
  const vol = one(sp.volatility) ?? "all";
  const per = Number(one(sp.per_page) ?? defaults.perPage ?? 20);
  const dir = one(sp.dir);
  return {
    market: (MARKETS.includes(m) ? m : "all") as MarketCode | "all",
    tab: (one(sp.tab) === "day_trading" ? "day_trading" : defaults.tab ?? "investing") as Tab,
    signal: (SIGNALS.includes(s) ? s : "all") as Signal | "all",
    volatility: (["all", "low", "medium", "high"].includes(vol) ? vol : "all") as "all",
    q: (one(sp.q) ?? "").slice(0, 60),
    sort: one(sp.sort) ?? defaults.sort,
    dir: dir === "asc" || dir === "desc" ? dir : undefined,
    page: Math.max(1, Number(one(sp.page) ?? 1) || 1),
    perPage: [10, 20, 50, 100].includes(per) ? per : 20,
  };
}

/** Build a hub URL keeping current params, overriding some, dropping defaults. */
export function hubHref(base: string, current: Record<string, unknown>, patch: Record<string, unknown>) {
  const merged = { ...current, ...patch };
  const p = new URLSearchParams();
  const defaults: Record<string, unknown> = { market: "all", tab: "investing", signal: "all", volatility: "all", q: "", page: 1, perPage: 20 };
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null || v === defaults[k]) continue;
    p.set(k === "perPage" ? "per_page" : k, String(v));
  }
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}
