import { jsonBody, route } from "@/lib/api/handler";
import { IndicatorBody } from "@/lib/api/schemas";
import { createIndicator, listIndicators } from "@/lib/data";
// Your indicators: formulas to plot and buy/sell rules (src/lib/indicators).
export const GET = route((_r, v) => listIndicators(v));
export const POST = route(async (req, v) => createIndicator(v, await jsonBody(req, IndicatorBody)));
