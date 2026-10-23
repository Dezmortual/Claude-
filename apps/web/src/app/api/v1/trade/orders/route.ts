import { jsonBody, route } from "@/lib/api/handler";
import { TradeBody } from "@/lib/api/schemas";
import { placeTrade } from "@/lib/data";
// Places one order after the owner confirmed it on screen. clientOrderId makes a repeated submit harmless.
export const POST = route(async (req, v) => placeTrade(v, await jsonBody(req, TradeBody)));
