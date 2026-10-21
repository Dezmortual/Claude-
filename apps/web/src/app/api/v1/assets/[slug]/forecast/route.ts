import { route } from "@/lib/api/handler";
import { assetForecast } from "@/lib/data";
export const GET = route<{ slug: string }>((_r, v, p) => assetForecast(v, p.slug), 60);
