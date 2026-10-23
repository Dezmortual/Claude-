import { jsonBody, route } from "@/lib/api/handler";
import { MaxOrderBody } from "@/lib/api/schemas";
import { setMaxOrder } from "@/lib/data";
export const PATCH = route(async (req, v) => setMaxOrder(v, (await jsonBody(req, MaxOrderBody)).maxOrderUsd));
