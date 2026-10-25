import { route } from "@/lib/api/handler";
import { importBrokerFills, removeImported } from "@/lib/data";
// Alpaca fills into the ledger (each once), or all of them out again.
export const POST = route((_r, v) => importBrokerFills(v));
export const DELETE = route((_r, v) => removeImported(v));
