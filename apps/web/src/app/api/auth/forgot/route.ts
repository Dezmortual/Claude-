import { clientIp, jsonBody, route } from "@/lib/api/handler";
import { Forgot } from "@/lib/api/schemas";
import { requestReset } from "@/lib/server/auth";
// Same answer whether or not the email has an account.
export const POST = route(async (req) => { await requestReset((await jsonBody(req, Forgot)).email, await clientIp()); return { ok: true }; }, 0, { public: true });
