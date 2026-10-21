import { clientIp, jsonBody, route } from "@/lib/api/handler";
import { SignUp } from "@/lib/api/schemas";
import { signUp } from "@/lib/server/auth";
// No session yet: the account works once the emailed link is opened.
export const POST = route(async (req) => {
  const b = await jsonBody(req, SignUp);
  await signUp(b, await clientIp());
  return { ok: true, verify: true };
}, 0, { public: true });
