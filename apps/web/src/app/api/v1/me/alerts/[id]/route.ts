import { jsonBody, route } from "@/lib/api/handler";
import { deleteAlert, updateAlert } from "@/lib/data";
export const PATCH = route<{ id: string }>(async (req, v, p) => updateAlert(v, p.id, await jsonBody<{ isActive?: boolean }>(req)));
export const DELETE = route<{ id: string }>((_r, v, p) => { deleteAlert(v, p.id); });
