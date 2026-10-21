import { route } from "@/lib/api/handler";
import { removeFromWatchlist } from "@/lib/data";
export const DELETE = route<{ slug: string }>((_r, v, p) => { removeFromWatchlist(v, p.slug); });
