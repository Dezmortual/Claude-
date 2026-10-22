import { qs, route } from "@/lib/api/handler";
import { assetBars } from "@/lib/data";
// ?warmup=n adds up to n bars from before the range (max 500), for indicators drawn on the chart.
export const GET = route<{ slug: string }>((req, v, p) => {
  const q = qs(req), warm = Number(q.get("warmup") ?? 0);
  return assetBars(v, p.slug, q.get("range") ?? "3m", Number.isInteger(warm) && warm > 0 ? warm : 0);
}, 30);
