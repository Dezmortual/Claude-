import { jsonBody, route } from "@/lib/api/handler";
import { MonitorPatch, Uuid } from "@/lib/api/schemas";
import { deleteMonitor, updateMonitor } from "@/lib/data";
export const PATCH = route<{ id: string }>(async (req, v, p) => { await updateMonitor(v, Uuid.parse(p.id), await jsonBody(req, MonitorPatch)); });
export const DELETE = route<{ id: string }>(async (_r, v, p) => { await deleteMonitor(v, Uuid.parse(p.id)); });
