import { jsonBody, route } from "@/lib/api/handler";
import { LimitBody } from "@/lib/api/schemas";
import { addLimit, limitStatus } from "@/lib/data";
export const GET = route((_r, v) => limitStatus(v));
export const POST = route(async (req, v) => { await addLimit(v, await jsonBody(req, LimitBody)); return limitStatus(v); });
