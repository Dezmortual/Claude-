import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/server/env";
import { JOBS, runJob } from "@/lib/server/jobs";

export const maxDuration = 300; // the tick job runs every step in one request (Vercel Hobby allows up to 300 s)

// Called by the scheduler (the GitHub Actions workflow; Vercel Cron would also work) with "Authorization: Bearer $CRON_SECRET".
async function handle(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = env().CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const ok = !!secret && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await params;
  const fn = JOBS[job];
  if (!fn) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    return NextResponse.json({ job, ...((await runJob(job, fn)) as object) });
  } catch (e) {
    return NextResponse.json({ job, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export const GET = handle; // Vercel Cron sends GET
export const POST = handle;
