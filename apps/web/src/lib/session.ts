import { cookies } from "next/headers";
import { getViewer } from "./data";

export const SESSION_COOKIE = "sid";

export async function viewer() {
  return getViewer((await cookies()).get(SESSION_COOKIE)?.value);
}

export const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 };
