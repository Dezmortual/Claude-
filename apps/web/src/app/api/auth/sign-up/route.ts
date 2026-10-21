import { cookies } from "next/headers";
import { jsonBody, route } from "@/lib/api/handler";
import { DataError, signUp } from "@/lib/data";
import { SESSION_COOKIE, cookieOptions } from "@/lib/session";
export const POST = route(async (req) => {
  const b = await jsonBody<{ name: string; email: string; password: string; acceptTerms: boolean }>(req);
  if (!b.acceptTerms) throw new DataError("invalid", "Accept the terms to create an account");
  const token = signUp(b.name ?? "", b.email ?? "", b.password ?? "");
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions);
  return { token };
});
