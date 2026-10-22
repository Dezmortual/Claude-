import { NextResponse, type NextRequest } from "next/server";

import { guestHome, isPublicPath } from "@/lib/paths";

// Private build: every page but the auth and legal ones needs a session. The cookie check here is only a fast path;
// the root layout validates the session against the database and the owner list.

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  const isPublic = isPublicPath(pathname);
  if (process.env.PRIVATE_MODE !== "false" && !isPublic && !req.cookies.get("sid")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/" ? guestHome() : "/sign-in";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers } });
}

// Pages only: API routes enforce access themselves, static files need none.
// Public images (the landing page screenshot) need no session either.
export const config = { matcher: ["/((?!api/|_next/|favicon.ico|robots.txt|.*\\.(?:webp|png|svg)$).*)"] };
