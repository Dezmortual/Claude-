import { route } from "@/lib/api/handler";
import { tradeTicket } from "@/lib/data";
export const GET = route<{ slug: string }>((_r, v, p) => tradeTicket(v, p.slug));
