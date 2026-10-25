import { route } from "@/lib/api/handler";
import { Uuid } from "@/lib/api/schemas";
import { deleteEntry } from "@/lib/data";
export const DELETE = route<{ id: string }>(async (_r, v, p) => { await deleteEntry(v, Uuid.parse(p.id)); });
