import { route } from "@/lib/api/handler";
import { assetSummary } from "@/lib/data";
export const GET = route<{ slug: string }>((_r, v, p) => assetSummary(v, p.slug), 30);
