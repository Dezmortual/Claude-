import { jsonBody, route } from "@/lib/api/handler";
import { Prefs } from "@/lib/api/schemas";
import { getPrefs, setPrefs } from "@/lib/data";
export const GET = route((_r, v) => getPrefs(v));
export const PUT = route(async (req, v) => { await setPrefs(v, await jsonBody(req, Prefs)); return getPrefs(v); });
