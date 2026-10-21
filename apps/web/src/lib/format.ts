// Number and date formatting. Prices keep enough significant digits for sub-cent assets.
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
