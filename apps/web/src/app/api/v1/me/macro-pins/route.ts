import { jsonBody, route } from "@/lib/api/handler";
import { MacroPinBody } from "@/lib/api/schemas";
import { setMacroPin } from "@/lib/data";
// Economic series pinned to the home screen.
export const PUT = route(async (req, v) => { const b = await jsonBody(req, MacroPinBody); return { pins: await setMacroPin(v, b.id, b.on) }; });
