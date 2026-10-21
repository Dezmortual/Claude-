import { route } from "@/lib/api/handler";
import { DataError } from "@/lib/data";
// Alerts are evaluated by the worker, which arrives with /replica-backend; no events exist yet.
export const GET = route((_r, v) => { if (!v.user) throw new DataError("unauthorized", "Sign in first"); return []; });
