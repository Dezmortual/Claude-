import { route } from "@/lib/api/handler";
import { Uuid } from "@/lib/api/schemas";
import { deleteStrategy, getStrategy } from "@/lib/data";
export const GET = route<{ id: string }>((_r, v, p) => getStrategy(v, Uuid.parse(p.id)));
export const DELETE = route<{ id: string }>(async (_r, v, p) => { await deleteStrategy(v, Uuid.parse(p.id)); });
