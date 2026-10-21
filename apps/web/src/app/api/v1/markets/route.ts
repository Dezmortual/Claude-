import { route } from "@/lib/api/handler";
import { listMarkets } from "@/lib/data";
export const GET = route((_r, v) => listMarkets(v), 60);
