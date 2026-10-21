import { cookies } from "next/headers";
import { route } from "@/lib/api/handler";
import { signOut } from "@/lib/data";
import { SESSION_COOKIE } from "@/lib/session";
export const POST = route(async () => {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) signOut(t);
  jar.delete(SESSION_COOKIE);
});
