import { jsonBody, route } from "@/lib/api/handler";
import type { PlanCode } from "@/lib/data";
// Demo: returns the in-app checkout page. /replica-backend swaps this for a Stripe Checkout session URL.
export const POST = route(async (req) => {
  const { plan, interval } = await jsonBody<{ plan: PlanCode; interval: "month" | "year" }>(req);
  return { url: `/checkout?plan=${encodeURIComponent(plan)}&interval=${interval === "month" ? "month" : "year"}` };
});
