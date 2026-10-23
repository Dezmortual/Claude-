import { route } from "@/lib/api/handler";
import { tradingOverview } from "@/lib/data";
// The owner's broker account: balance, positions, open and recent orders, the app's own order log.
export const GET = route((_r, v) => tradingOverview(v));
