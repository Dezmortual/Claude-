import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { DataError, getViewer, privateMode, type Viewer } from "@/lib/data";
import { SESSION_COOKIE } from "@/lib/session";

const STATUS: Record<DataError["code"], number> = { unauthorized: 401, forbidden: 403, not_found: 404, invalid: 422, limit: 402, conflict: 409, rate_limited: 429 };

/** Session from the cookie (web) or "Authorization: Bearer <token>" (mobile). */
export async function apiViewer(): Promise<Viewer> {
  const auth = (await headers()).get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : (await cookies()).get(SESSION_COOKIE)?.value;
  return getViewer(token);
}

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: viewer lookup, private-mode gate, DataError -> HTTP status, zod errors -> 422. */
export function route<P = Record<string, never>>(fn: (req: Request, v: Viewer, params: P) => unknown | Promise<unknown>, cacheSeconds = 0, opts: { public?: boolean } = {}) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const v = opts.public ? await getViewer(undefined) : await apiViewer();
      if (!opts.public && privateMode() && !v.user) throw new DataError("unauthorized", "Sign in first");
      const body = await fn(req, v, (await ctx?.params) ?? ({} as P));
      if (body instanceof Response) return body;
      if (body === undefined) return new NextResponse(null, { status: 204 });
      const res = NextResponse.json(body);
      res.headers.set("cache-control", cacheSeconds ? `private, max-age=${cacheSeconds}` : "no-store");
      return res;
    } catch (e) {
      if (e instanceof DataError) return NextResponse.json({ error: e.code, message: e.message }, { status: STATUS[e.code] });
      if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid", message: e.issues[0]?.message ?? "Invalid input" }, { status: 422 });
      console.error(e);
      return NextResponse.json({ error: "server", message: "Something went wrong on our side" }, { status: 500 });
    }
  };
}

/** Parses and validates a JSON body against a zod schema. */
export async function jsonBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new DataError("invalid", "Send a JSON body"); }
  return schema.parse(raw);
}

/** Client address for rate limits. Forwarding headers are only trusted behind a proxy that sets them (Netlify, Vercel,
 *  or TRUST_PROXY_HEADERS=true); otherwise any client could invent a new address per request, so all requests share
 *  one bucket, which is fine for an owner-only app. */
export async function clientIp() {
  const h = await headers();
  // Netlify's edge overwrites this header; x-forwarded-for there can carry an internal address.
  if (process.env.NETLIFY === "true") return (h.get("x-nf-client-connection-ip") ?? "unknown").trim().slice(0, 64);
  if (process.env.VERCEL) return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim().slice(0, 64);
  if (process.env.TRUST_PROXY_HEADERS === "true") return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
  return "direct";
}

export const qs = (req: Request) => new URL(req.url).searchParams;
