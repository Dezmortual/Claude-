import { jsonBody, route } from "@/lib/api/handler";
import { BacktestBody } from "@/lib/api/schemas";
import { listRuns, runBacktest } from "@/lib/data";
// The backtest lab: run a strategy (or sweep its settings) on stored prices; list past runs.
export const maxDuration = 60;
export const GET = route((_r, v) => listRuns(v));
export const POST = route(async (req, v) => runBacktest(v, await jsonBody(req, BacktestBody)));
