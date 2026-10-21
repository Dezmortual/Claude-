import { jsonBody, route } from "@/lib/api/handler";
import { WatchAdd } from "@/lib/api/schemas";
import { addToWatchlist, getWatchlist } from "@/lib/data";
export const GET = route((_r, v) => getWatchlist(v));
export const POST = route(async (req, v) => { await addToWatchlist(v, (await jsonBody(req, WatchAdd)).asset); return { ok: true }; });
