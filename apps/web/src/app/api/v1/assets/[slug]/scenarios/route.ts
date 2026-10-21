import { route } from "@/lib/api/handler";
import { assetScenarios } from "@/lib/data";
export const GET = route<{ slug: string }>((_r, _v, p) => assetScenarios(p.slug), 300);
