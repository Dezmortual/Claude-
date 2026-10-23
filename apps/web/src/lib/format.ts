// Number and date formatting. Prices keep enough significant digits for sub-cent assets.
import type { Alert } from "./data/types";
export function price(n: number | null | undefined, unit = "USD"): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  // Currency pairs move in pips: 4-5 decimals for ~1.0 quotes, 3 for yen-style quotes above 50.
  const digits = unit === "quote currency" ? (abs >= 50 ? 3 : 5) : abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 8;
  const s = n.toLocaleString("en-US", { minimumFractionDigits: unit === "quote currency" ? digits : Math.min(digits, 2), maximumFractionDigits: digits });
  if (unit === "USD" || unit === "USD per share") return "$" + s;
  if (unit === "% yield") return n.toFixed(3) + "%";
  return s;
}

export function pct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const s = Math.abs(n).toFixed(digits);
  return (n > 0 ? "+" : n < 0 ? "−" : "") + s + "%";
}

export function compact(n: number): string {
  return n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });
}

export function dateTime(iso: string, tz = "UTC"): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) + (tz === "UTC" ? " UTC" : "");
}

export function money(cents: number, currency = "usd"): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: cents % 100 ? 2 : 0 });
}

export const SIGNAL_LABEL = { strong_buy: "Strong buy", buy: "Buy", neutral: "Neutral", sell: "Sell", strong_sell: "Strong sell", unavailable: "Unavailable" } as const;

export const TF_NAME = { "5m": "5 min", "30m": "30 min", "1h": "1 hour", "1d": "1 day", "1w": "1 week" } as const;

/** One line naming an alert, e.g. "Bitcoin: 1 day signal turns strong buy". Used on the Alerts page and stop page. */
export function describeAlert(a: Alert, name: string) {
  const tf = TF_NAME[a.timeframe as keyof typeof TF_NAME];
  if (a.condition === "signal_becomes") return `${name}: ${tf} signal turns ${SIGNAL_LABEL[a.signal!].toLowerCase()}`;
  if (a.condition === "indicator_signal") return `${name}: ${a.indicatorName ?? "indicator"} gives a ${a.signal} signal on the ${tf} chart`;
  if (a.condition === "forecast_move_above") return `${name}: 7-day forecast moves more than ${a.threshold}%`;
  return `${name}: price ${a.condition === "price_above" ? "above" : "below"} ${a.threshold!.toLocaleString("en-US", { maximumFractionDigits: 8 })}`;
}

/** "Up $12.30 (+4.92%)": the words carry the direction too, not just the colour. */
export const pnlWords = (pnl: number, pct: number) =>
  `${pnl >= 0 ? "Up" : "Down"} ${price(Math.abs(pnl), "USD")} (${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%)`;

/** Open positions added up: profit or loss, as a share of what they cost, and what they're worth now. */
export function tradeTotals(ps: { pnl: number; value: number }[]) {
  const pnl = ps.reduce((s, x) => s + x.pnl, 0);
  const cost = ps.reduce((s, x) => s + (x.value - x.pnl), 0);
  return { pnl, pct: cost ? (pnl / cost) * 100 : 0, value: ps.reduce((s, x) => s + x.value, 0) };
}
