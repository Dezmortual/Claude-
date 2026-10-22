import { z } from "zod";
import { qs, route } from "@/lib/api/handler";
import { forecastLedger } from "@/lib/data";
// F1: every published forecast, newest first. ?asset=&horizon=1d|7d|1m&status=all|scored|pending|hits|misses&page=
const Q = z.object({
  asset: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(), horizon: z.enum(["1d", "7d", "1m"]).optional(),
  status: z.enum(["all", "scored", "pending", "hits", "misses"]).optional(), page: z.coerce.number().int().min(1).max(10_000).optional(),
});
export const GET = route((req, v) => forecastLedger(v, Q.parse(Object.fromEntries(qs(req)))), 60);
