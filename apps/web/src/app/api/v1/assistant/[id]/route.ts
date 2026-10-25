import { route } from "@/lib/api/handler";
import { Uuid } from "@/lib/api/schemas";
import { deleteConversation, getConversation } from "@/lib/data";
export const GET = route<{ id: string }>((_r, v, p) => getConversation(v, Uuid.parse(p.id)));
export const DELETE = route<{ id: string }>(async (_r, v, p) => { await deleteConversation(v, Uuid.parse(p.id)); });
