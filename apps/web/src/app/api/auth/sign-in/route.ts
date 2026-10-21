import { cookies } from "next/headers";
import { jsonBody, route } from "@/lib/api/handler";
import { signIn } from "@/lib/data";
import { SESSION_COOKIE, cookieOptions } from "@/lib/session";
export const POST = route(async (req) => {
  const b = await jsonBody<{ email: string; password: string }>(req);
  const token = signIn(b.email ?? "", b.password ?? "");
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions);
  return { token };
});
