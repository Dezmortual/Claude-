import { jsonBody, route } from "@/lib/api/handler";
import { PinBody, Uuid } from "@/lib/api/schemas";
import { deleteRun, getRun, pinRun } from "@/lib/data";
export const GET = route<{ id: string }>((_r, v, p) => getRun(v, Uuid.parse(p.id)));
export const PATCH = route<{ id: string }>(async (req, v, p) => { await pinRun(v, Uuid.parse(p.id), (await jsonBody(req, PinBody)).pinned); });
export const DELETE = route<{ id: string }>(async (_r, v, p) => { await deleteRun(v, Uuid.parse(p.id)); });
