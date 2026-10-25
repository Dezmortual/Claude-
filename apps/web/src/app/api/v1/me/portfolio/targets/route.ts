import { jsonBody, route } from "@/lib/api/handler";
import { TargetsBody } from "@/lib/api/schemas";
import { rebalancePlan, setTargets, targets } from "@/lib/data";
export const GET = route(async (_r, v) => ({ targets: await targets(v), plan: await rebalancePlan(v) }));
export const PUT = route(async (req, v) => { await setTargets(v, (await jsonBody(req, TargetsBody)).targets); return { plan: await rebalancePlan(v) }; });
