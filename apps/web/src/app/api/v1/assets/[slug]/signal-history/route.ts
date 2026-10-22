import { route } from "@/lib/api/handler";
import { assetSignalHistory } from "@/lib/data";
// F2: each past change of the asset's indicator reading, with the moves after it and the worst move against it.
export const GET = route<{ slug: string }>((_r, v, p) => assetSignalHistory(v, p.slug), 60);
