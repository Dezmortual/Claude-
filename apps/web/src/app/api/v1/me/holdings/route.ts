import { jsonBody, route } from "@/lib/api/handler";
import { HoldingBody } from "@/lib/api/schemas";
import { addHolding, portfolio } from "@/lib/data";
// The owner's portfolio: positions valued at live prices, and one purchase (lot) added per POST.
export const GET = route((_r, v) => portfolio(v));
export const POST = route(async (req, v) => addHolding(v, await jsonBody(req, HoldingBody)));
