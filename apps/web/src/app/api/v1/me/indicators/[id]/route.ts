import { jsonBody, route } from "@/lib/api/handler";
import { IndicatorBody, Uuid } from "@/lib/api/schemas";
import { deleteIndicator, getIndicator, updateIndicator } from "@/lib/data";
export const GET = route<{ id: string }>((_r, v, p) => getIndicator(v, Uuid.parse(p.id)));
export const PUT = route<{ id: string }>(async (req, v, p) => updateIndicator(v, Uuid.parse(p.id), await jsonBody(req, IndicatorBody)));
export const DELETE = route<{ id: string }>(async (_r, v, p) => { await deleteIndicator(v, Uuid.parse(p.id)); });
