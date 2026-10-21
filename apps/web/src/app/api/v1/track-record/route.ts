import { route } from "@/lib/api/handler";
// Scoring starts when the worker publishes real forecasts; until then there is nothing honest to report.
export const GET = route(() => ({ n: 0, hitRate: null, coverage: null, mape: null, note: "No scored forecasts yet: scoring begins with live data." }));
