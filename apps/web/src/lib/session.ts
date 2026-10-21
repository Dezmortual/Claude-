import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getViewer } from "./data";

export const SESSION_COOKIE = "sid";

/** The signed-in viewer for this request (memoised per request). */
export const viewer = cache(async () => getViewer((await cookies()).get(SESSION_COOKIE)?.value));

export const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 };
