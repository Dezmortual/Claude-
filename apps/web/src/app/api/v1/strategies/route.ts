import { jsonBody, route } from "@/lib/api/handler";
import { StrategyBody } from "@/lib/api/schemas";
import { listStrategies, saveStrategy } from "@/lib/data";
// Saved strategies. Posting with an id saves a new version; earlier versions stay in its history.
export const GET = route((_r, v) => listStrategies(v));
export const POST = route(async (req, v) => saveStrategy(v, await jsonBody(req, StrategyBody)));
