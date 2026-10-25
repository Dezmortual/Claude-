import { jsonBody, route } from "@/lib/api/handler";
import { EntryBody } from "@/lib/api/schemas";
import { addEntry, ledger } from "@/lib/data";
// The ledger: purchases (from holdings) plus sales, dividends, fees and broker imports.
export const GET = route((_r, v) => ledger(v));
export const POST = route(async (req, v) => addEntry(v, await jsonBody(req, EntryBody)));
