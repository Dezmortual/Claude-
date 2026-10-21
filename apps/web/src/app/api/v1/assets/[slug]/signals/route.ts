import { route } from "@/lib/api/handler";
import { assetSignals } from "@/lib/data";
export const GET = route<{ slug: string }>((_r, v, p) => assetSignals(v, p.slug), 30);
