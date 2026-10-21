import { clientIp, jsonBody, route } from "@/lib/api/handler";
import { Reset } from "@/lib/api/schemas";
import { rateLimit, resetPassword } from "@/lib/server/auth";
export const POST = route(async (req) => {
  await rateLimit(`resetconfirm:ip:${await clientIp()}`, 10, 900);
  const b = await jsonBody(req, Reset);
  await resetPassword(b.token, b.password);
  return { ok: true };
}, 0, { public: true });
