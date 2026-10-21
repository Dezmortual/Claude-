import { route } from "@/lib/api/handler";
import { DataError } from "@/lib/data";
export const GET = route((_r, v) => {
  if (!v.user) throw new DataError("unauthorized", "Sign in first");
  return { plan: v.plan.code, markets: v.plan.markets, periodEnd: v.subscription?.currentPeriodEnd ?? null, cancelAtPeriodEnd: v.subscription?.cancelAtPeriodEnd ?? false };
});
