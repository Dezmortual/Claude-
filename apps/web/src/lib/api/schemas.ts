import { z } from "zod";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);
const password = z.string().min(8, "Use at least 8 characters").max(200);

export const SignUp = z.object({ name: z.string().trim().min(1, "Enter your name").max(80), email, password, acceptTerms: z.literal(true, { error: "Accept the terms to continue" }) });
export const SignIn = z.object({ email, password: z.string().min(1, "Enter your password").max(200) });
export const Forgot = z.object({ email });
export const Reset = z.object({ token: z.string().min(20).max(100), password });
export const WatchAdd = z.object({ asset: z.string().regex(/^[a-z0-9-]{1,40}$/) });

const signal = z.enum(["strong_buy", "buy", "neutral", "sell", "strong_sell"]);
const tf = z.enum(["5m", "30m", "1h", "1d", "1w"]);
export const AlertCreate = z.object({
  assetSlug: z.string().regex(/^[a-z0-9-]{1,40}$/),
  condition: z.enum(["price_above", "price_below", "signal_becomes", "forecast_move_above", "indicator_signal"]),
  threshold: z.number().positive("Enter a number above 0").finite().max(1e12).nullish(),
  signal: signal.nullish(),
  timeframe: tf.nullish(),
  channels: z.array(z.enum(["email", "push"])).max(2).optional(),
  cooldownMinutes: z.number().int().min(5).max(10080).optional(),
  indicatorId: z.string().uuid().nullish(),
});
const formula = z.string().trim().max(300, "Keep each formula under 300 characters");
export const IndicatorBody = z.object({
  name: z.string().trim().min(1, "Give it a name").max(60, "Keep the name under 60 characters"),
  lines: z.array(formula.min(1, "A line can't be empty")).min(1, "Add at least one line to plot").max(3, "Up to three lines"),
  display: z.enum(["overlay", "pane"]),
  buyRule: formula.nullish(),
  sellRule: formula.nullish(),
});
export const AlertPatch = z.object({ isActive: z.boolean() });
export const Prefs = z.object({
  visibleColumns: z.array(z.string().max(20)).min(1).max(20),
  rowsPerPage: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]),
  defaultTab: z.enum(["investing", "day_trading"]),
});
export const Uuid = z.string().uuid();

/** A browser PushSubscription as sent by the client (subscription.toJSON()). */
export const PushSubscriptionBody = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Push endpoints are https"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});
export const PushUnsubscribeBody = z.object({ endpoint: z.string().url().max(1000) });

export const DeliveryBody = z.object({
  muteFor: z.enum(["off", "1h", "8h", "24h", "indefinitely"]).optional(),
  quiet: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(23) }).nullable().optional(),
  emailMode: z.enum(["instant", "digest"]).optional(),
  digestHour: z.number().int().min(0).max(23).optional(),
  topSignalPush: z.boolean().optional(),
});

export const HoldingBody = z.object({
  assetSlug: z.string().regex(/^[a-z0-9-]{1,40}$/),
  quantity: z.number({ error: "Enter how many you hold" }).positive("Enter a quantity above 0").finite().max(1e15),
  costPrice: z.number().positive("Enter a price above 0").finite().max(1e12).nullish(),
  boughtOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-01-31").nullish(),
  note: z.string().max(120, "Keep the note under 120 characters").nullish(),
});

const price = z.number().positive("Prices must be above 0").finite().max(1e9);
export const TradeBody = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,40}$/),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["market", "limit", "trailing", "oco"]),
  trailPct: z.number().min(0.1, "Set the trail between 0.1% and 50%").max(50, "Set the trail between 0.1% and 50%").nullish(),
  amountUsd: z.number().positive().finite().max(1e8).nullish(),
  qty: z.number().positive().finite().max(1e12).nullish(),
  limitPrice: price.nullish(), stopLoss: price.nullish(), takeProfit: price.nullish(),
  clientOrderId: z.string().uuid(),
});
export const MaxOrderBody = z.object({ maxOrderUsd: z.number().min(1, "At least $1").max(10_000_000).finite() });

// The backtest lab.
const pct = (max: number, msg: string) => z.number().positive(msg).max(max, msg).nullable();
const rule = z.string().trim().max(400, "Keep each rule under 400 characters");
const ParamName = z.string().regex(/^[a-z][a-z0-9_]{0,19}$/, "Placeholder names are lower-case letters, digits and _");
export const StrategySpecBody = z.object({
  slug: z.string().max(40), timeframe: z.enum(["1d", "1w"]), period: z.enum(["1y", "2y", "3y", "all"]),
  template: z.string().max(30).nullable(),
  entry: rule.min(1, "Write an entry rule"), exit: rule.nullable().transform((x) => x || null), side: z.enum(["long", "short"]),
  params: z.record(ParamName, z.number().finite()).refine((p) => Object.keys(p).length <= 8, "Up to eight placeholders"),
  stopPct: pct(90, "A stop-loss is a percent between 0 and 90"), takePct: pct(1000, "A target is a percent above 0"),
  maxBars: z.number().int("Bars are whole numbers").positive("Bars must be above 0").max(1000).nullable(),
  feePct: z.number().min(0, "Costs can't be negative").max(5, "A fee over 5% is surely a typo"),
  slippagePct: z.number().min(0, "Costs can't be negative").max(5, "Slippage over 5% is surely a typo"),
});
export const BacktestBody = StrategySpecBody.extend({
  strategyId: Uuid.nullable(),
  ranges: z.array(z.object({ name: ParamName, from: z.number().finite(), to: z.number().finite(), step: z.number().positive("Steps must be above 0") }))
    .max(4, "Sweep up to four placeholders at once").nullable(),
});
export const StrategyBody = z.object({
  id: Uuid.nullish(), name: z.string().trim().min(1, "Give it a name").max(60, "Keep the name under 60 characters"),
  notes: z.string().max(2000).default(""), spec: StrategySpecBody,
});
export const PinBody = z.object({ pinned: z.boolean() });

// News.
const keyword = z.string().trim().min(1).max(40, "Keep each keyword under 40 characters");
export const MonitorBody = z.object({ label: z.string().trim().min(1, "Give it a name").max(60), keywords: z.array(keyword).min(1, "Add at least one keyword").max(10, "Up to ten keywords") });
export const MonitorPatch = z.object({ enabled: z.boolean().optional(), label: z.string().trim().min(1).max(60).optional(), keywords: z.array(keyword).min(1).max(10).optional() });
export const FeedBody = z.object({ name: z.string().trim().min(1, "Give it a name").max(60), url: z.string().trim().min(1, "Paste the feed's address").max(500) });
export const NewsQuery = z.object({ q: z.string().max(80).optional(), slug: z.string().max(40).optional(), mood: z.enum(["positive", "neutral", "negative"]).optional(),
  source: z.string().max(60).optional() });

// Portfolio ledger, targets, limits.
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-01-31");
const usdAmount = z.number().positive("Enter an amount above 0").finite().max(1e12);
export const EntryBody = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,40}$/), kind: z.enum(["sell", "dividend", "fee"]), on: day,
  quantity: z.number().positive("Enter a quantity above 0").finite().max(1e15).nullish(), price: z.number().positive("Enter a price above 0").finite().max(1e12).nullish(),
  amount: usdAmount.nullish(), note: z.string().max(120, "Keep the note under 120 characters").nullish(),
});
export const TargetsBody = z.object({ targets: z.array(z.object({ slug: z.string().regex(/^[a-z0-9-]{1,40}$/), weight: z.number().positive("Weights are above 0").max(100) })).max(40) });
export const LimitBody = z.object({ kind: z.enum(["max_holding", "max_market"]), target: z.string().max(40), pct: z.number().positive("Enter a percent above 0").max(100, "A percent is at most 100") });
export const BenchmarkBody = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,40}$/) });
export const MacroPinBody = z.object({ id: z.string().regex(/^[A-Za-z0-9_.]{1,30}$/), on: z.boolean() });
export const AskBody = z.object({ conversationId: Uuid.nullable(), text: z.string().trim().min(1, "Ask something").max(4000, "Keep a question under 4,000 characters") });
export const NoteBody = z.object({ body: z.string().max(10000, "Notes can be up to 10,000 characters") });
