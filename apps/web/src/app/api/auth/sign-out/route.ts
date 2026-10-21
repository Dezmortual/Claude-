import { cookies } from "next/headers";
import { route } from "@/lib/api/handler";
import { endSession } from "@/lib/server/auth";
import { SESSION_COOKIE } from "@/lib/session";
export const POST = route(async () => {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) await endSession(t);
  jar.delete(SESSION_COOKIE);
}, 0, { public: true });
