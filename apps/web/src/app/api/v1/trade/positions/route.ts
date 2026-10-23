import { qs, route } from "@/lib/api/handler";
import { closeTradePosition } from "@/lib/data";
// DELETE ?symbol=AAPL closes the whole position at market.
export const DELETE = route((req, v) => closeTradePosition(v, qs(req).get("symbol") ?? ""));
