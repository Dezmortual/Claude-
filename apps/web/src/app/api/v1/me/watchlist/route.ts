import { jsonBody, route } from "@/lib/api/handler";
import { addToWatchlist, getWatchlist } from "@/lib/data";
export const GET = route((_r, v) => getWatchlist(v));
export const POST = route(async (req, v) => { addToWatchlist(v, (await jsonBody<{ asset: string }>(req)).asset); return { ok: true }; });
