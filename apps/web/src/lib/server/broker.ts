import "server-only";
// Orders through the owner's Alpaca account (https://docs.alpaca.markets/reference): practice ("paper") unless
// ALPACA_TRADING=live is set on purpose. Uses the same ALPACA_KEY_ID / ALPACA_SECRET_KEY as the market data.

export type Mode = "paper" | "live";
const BASE: Record<Mode, string> = { paper: "https://paper-api.alpaca.markets", live: "https://api.alpaca.markets" };

export const brokerMode = (): Mode => (process.env.ALPACA_TRADING?.trim() === "live" ? "live" : "paper");
const clean = (v?: string) => v?.trim().replace(/^["']|["']$/g, "").trim() ?? "";
export const brokerConfigured = () => !!(clean(process.env.ALPACA_KEY_ID) && clean(process.env.ALPACA_SECRET_KEY));
/** ALPACA_TRADE_URL points the tests at a stand-in broker; otherwise the mode decides. */
const base = () => clean(process.env.ALPACA_TRADE_URL) || BASE[brokerMode()];

export class BrokerError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(base() + path, {
    method, cache: "no-store", signal: AbortSignal.timeout(15_000),
    headers: { "APCA-API-KEY-ID": clean(process.env.ALPACA_KEY_ID), "APCA-API-SECRET-KEY": clean(process.env.ALPACA_SECRET_KEY),
      ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const json = text ? JSON.parse(text) : null;
  if (!r.ok) {
    // Alpaca answers errors as {code, message}; a 401/403 on the practice address usually means live-account keys.
    const msg = json?.message ?? `${r.status}`;
    throw new BrokerError(r.status === 401 || r.status === 403
      ? `Alpaca refused the keys (${msg}). Practice trading needs your paper account's keys.` : `Alpaca: ${msg}`, r.status);
  }
  return json as T;
}

export type BrokerAccount = { status: string; currency: string; cash: string; buying_power: string; equity: string; last_equity: string;
  trading_blocked: boolean; account_blocked: boolean };
export type BrokerPosition = { symbol: string; qty: string; avg_entry_price: string; market_value: string; current_price: string;
  unrealized_pl: string; unrealized_plpc: string; side: string; asset_class: string };
export type BrokerOrder = { id: string; client_order_id: string; symbol: string; side: "buy" | "sell"; type: string; order_class: string;
  qty: string | null; notional: string | null; filled_qty: string; filled_avg_price: string | null; limit_price: string | null;
  status: string; submitted_at: string; filled_at: string | null; legs?: BrokerOrder[] | null };
export type BrokerAsset = { symbol: string; class: string; tradable: boolean; fractionable: boolean; min_order_size?: string };
export type OrderRequest = {
  symbol: string; side: "buy" | "sell"; type: "market" | "limit"; time_in_force: "day" | "gtc";
  qty?: string; notional?: string; limit_price?: string; client_order_id: string;
  order_class?: "bracket"; take_profit?: { limit_price: string }; stop_loss?: { stop_price: string };
};

export const broker = {
  account: () => call<BrokerAccount>("GET", "/v2/account"),
  clock: () => call<{ is_open: boolean; next_open: string; next_close: string }>("GET", "/v2/clock"),
  positions: () => call<BrokerPosition[]>("GET", "/v2/positions"),
  orders: (status: "open" | "all", limit = 20) => call<BrokerOrder[]>("GET", `/v2/orders?status=${status}&limit=${limit}&direction=desc&nested=true`),
  asset: (symbol: string) => call<BrokerAsset>("GET", `/v2/assets/${encodeURIComponent(symbol)}`),
  place: (o: OrderRequest) => call<BrokerOrder>("POST", "/v2/orders", o),
  cancel: (id: string) => call<null>("DELETE", `/v2/orders/${encodeURIComponent(id)}`),
  close: (symbol: string) => call<BrokerOrder>("DELETE", `/v2/positions/${encodeURIComponent(symbol)}`),
};
