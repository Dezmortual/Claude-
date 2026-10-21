import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { DataError, getViewer, type Viewer } from "@/lib/data";
import { SESSION_COOKIE } from "@/lib/session";

const STATUS: Record<DataError["code"], number> = { unauthorized: 401, forbidden: 403, not_found: 404, invalid: 422, limit: 402, conflict: 409 };

/** Session from the cookie (web) or "Authorization: Bearer <token>" (mobile). */
export async function apiViewer(): Promise<Viewer> {
  const auth = (await headers()).get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : (await cookies()).get(SESSION_COOKIE)?.value;
  return getViewer(token);
}

type Ctx<P> = { params: Promise<P> };

export function route<P = Record<string, never>>(fn: (req: Request, v: Viewer, params: P) => unknown | Promise<unknown>, cacheSeconds = 0) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const body = await fn(req, await apiViewer(), (await ctx?.params) ?? ({} as P));
      if (body instanceof Response) return body;
      const res = NextResponse.json(body ?? { ok: true }, { status: body === undefined ? 204 : 200 });
      res.headers.set("cache-control", cacheSeconds ? `private, max-age=${cacheSeconds}` : "no-store");
      return body === undefined ? new NextResponse(null, { status: 204 }) : res;
    } catch (e) {
      if (e instanceof DataError) return NextResponse.json({ error: e.code, message: e.message }, { status: STATUS[e.code] });
      console.error(e);
      return NextResponse.json({ error: "server", message: "Something went wrong on our side" }, { status: 500 });
    }
  };
}

export async function jsonBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new DataError("invalid", "Send a JSON body");
  }
}

export const qs = (req: Request) => new URL(req.url).searchParams;
