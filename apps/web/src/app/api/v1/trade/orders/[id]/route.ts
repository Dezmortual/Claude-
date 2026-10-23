import { route } from "@/lib/api/handler";
import { Uuid } from "@/lib/api/schemas";
import { cancelTrade } from "@/lib/data";
export const DELETE = route<{ id: string }>(async (_r, v, p) => { await cancelTrade(v, Uuid.parse(p.id)); });
