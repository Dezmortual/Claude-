import { cookies, headers } from "next/headers";
import { clientIp, jsonBody, route } from "@/lib/api/handler";
import { SignIn } from "@/lib/api/schemas";
import { DataError } from "@/lib/data";
import { createSession, resendVerification, signIn } from "@/lib/server/auth";
import { SESSION_COOKIE, cookieOptions } from "@/lib/session";
export const POST = route(async (req) => {
  const b = await jsonBody(req, SignIn);
  const ip = await clientIp();
  let userId: string;
  try {
    userId = await signIn(b.email, b.password, ip);
  } catch (e) {
    if (e instanceof DataError && e.message.startsWith("Confirm your email")) await resendVerification(b.email, ip);
    throw e;
  }
  const token = await createSession(userId, (await headers()).get("user-agent"));
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions);
  return { token };
}, 0, { public: true });
