import { jsonBody, route } from "@/lib/api/handler";
import { AlertPatch, Uuid } from "@/lib/api/schemas";
import { deleteAlert, updateAlert } from "@/lib/data";
export const PATCH = route<{ id: string }>(async (req, v, p) => { await updateAlert(v, Uuid.parse(p.id), await jsonBody(req, AlertPatch)); return { ok: true }; });
export const DELETE = route<{ id: string }>(async (_r, v, p) => { await deleteAlert(v, Uuid.parse(p.id)); });
