import { route } from "@/lib/api/handler";
import { removeFromWatchlist } from "@/lib/data";
export const DELETE = route<{ slug: string }>(async (_r, v, p) => { await removeFromWatchlist(v, p.slug); });
