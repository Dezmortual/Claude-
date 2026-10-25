import { jsonBody, route } from "@/lib/api/handler";
import { MonitorBody } from "@/lib/api/schemas";
import { createMonitor, listMonitors } from "@/lib/data";
// Keyword monitors: new stories that match are listed and pushed.
export const GET = route((_r, v) => listMonitors(v));
export const POST = route(async (req, v) => createMonitor(v, await jsonBody(req, MonitorBody)));
