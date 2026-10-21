import { qs, route } from "@/lib/api/handler";
import { assetBars } from "@/lib/data";
export const GET = route<{ slug: string }>((req, v, p) => assetBars(v, p.slug, qs(req).get("range") ?? "3m"), 30);
