import { jsonBody, route } from "@/lib/api/handler";
import { AlertCreate } from "@/lib/api/schemas";
import { createAlert, listAlerts } from "@/lib/data";
export const GET = route((_r, v) => listAlerts(v));
export const POST = route(async (req, v) => createAlert(v, await jsonBody(req, AlertCreate)));
