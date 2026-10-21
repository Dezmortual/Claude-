import { cookies } from "next/headers";
import { route } from "@/lib/api/handler";
import { deleteAccount } from "@/lib/data";
import { SESSION_COOKIE } from "@/lib/session";
export const DELETE = route(async (_r, v) => { await deleteAccount(v); (await cookies()).delete(SESSION_COOKIE); });
