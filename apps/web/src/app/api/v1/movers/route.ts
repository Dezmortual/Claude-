import { qs, route } from "@/lib/api/handler";
import { movers } from "@/lib/data";
export const GET = route((req, v) => {
  const h = qs(req).get("horizon") ?? "7d";
  return movers(v, (["1d", "7d", "1m", "1y"].includes(h) ? h : "7d") as "1d" | "7d" | "1m" | "1y");
}, 60);
