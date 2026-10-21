import { qs, route } from "@/lib/api/handler";
import { outlook } from "@/lib/data";
export const GET = route((req, v) => {
  const h = qs(req).get("horizon") ?? "7d";
  return outlook(v, (["1d", "7d", "1m"].includes(h) ? h : "7d") as "1d" | "7d" | "1m");
}, 60);
