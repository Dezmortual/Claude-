import { jsonBody, route } from "@/lib/api/handler";
import { getPrefs, setPrefs, type TablePrefs } from "@/lib/data";
export const GET = route((_r, v) => getPrefs(v));
export const PUT = route(async (req, v) => { setPrefs(v, await jsonBody<TablePrefs>(req)); return getPrefs(v); });
