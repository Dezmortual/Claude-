import { route } from "@/lib/api/handler";
import { Uuid } from "@/lib/api/schemas";
import { deleteFeed } from "@/lib/data";
export const DELETE = route<{ id: string }>(async (_r, v, p) => { await deleteFeed(v, Uuid.parse(p.id)); });
