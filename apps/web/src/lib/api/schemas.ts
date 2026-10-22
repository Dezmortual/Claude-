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
  condition: z.enum(["price_above", "price_below", "signal_becomes", "forecast_move_above"]),
  threshold: z.number().positive("Enter a number above 0").finite().max(1e12).nullish(),
  signal: signal.nullish(),
  timeframe: tf.nullish(),
  channels: z.array(z.enum(["email", "push"])).max(2).optional(),
  cooldownMinutes: z.number().int().min(5).max(10080).optional(),
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
