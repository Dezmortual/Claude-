import { jsonBody, route } from "@/lib/api/handler";
import { createAlert, listAlerts, type AlertInput } from "@/lib/data";
export const GET = route((_r, v) => listAlerts(v));
export const POST = route(async (req, v) => createAlert(v, await jsonBody<AlertInput>(req)));
