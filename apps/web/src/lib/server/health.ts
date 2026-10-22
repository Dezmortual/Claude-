import "server-only";
// Data health: checks each price source and the scheduler, keeps one open incident per problem in
// health_incidents, and tells the owners once when a problem starts and once when it clears.
import { ASSETS } from "@/lib/data/catalogue";
import { cachedBars, effectiveSource, loadError } from "@/lib/data/marketdata";
import { SOURCE_LABEL, type SourceName } from "@/lib/data/sources/map";
import { sql } from "./db";
import { sendEmail } from "./email";
import { env } from "./env";
import { pushConfigured, sendPush } from "./push";

export type Problem = { key: string; detail: string };
const MIN = 60_000;

/** Forex trades from Sunday 22:00 to Friday 22:00 UTC (roughly); outside that a quiet feed is expected. */
function forexOpen(at: Date) {
  const d = at.getUTCDay(), h = at.getUTCHours();
  return !(d === 6 || (d === 5 && h >= 22) || (d === 0 && h < 22));
}

/** After a price load: sources whose refresh failed, and always-trading markets whose newest 5-minute bar is old. */
export function sourceProblems(now = new Date()): { checked: string[]; problems: Problem[] } {
  const live = ASSETS.filter((a) => effectiveSource(a.slug) !== "demo");
  const bySource = new Map<SourceName, string[]>();
  for (const a of live) bySource.set(effectiveSource(a.slug), [...(bySource.get(effectiveSource(a.slug)) ?? []), a.slug]);
  const checked: string[] = [], problems: Problem[] = [];
  for (const [source, slugs] of bySource) {
    const key = `source:${source}`;
    checked.push(key);
    const failed = slugs.map((s) => [s, loadError(s)] as const).filter(([, e]) => e);
    if (failed.length) {
      problems.push({ key, detail: `${SOURCE_LABEL[source]}: ${failed.length} of ${slugs.length} assets failed to refresh (${failed[0][1]!.slice(0, 160)})` });
      continue;
    }
    // Crypto never closes, forex only at weekends: a 5-minute series more than 45 minutes old means the feed stopped.
    if (source === "binance" || (source === "twelvedata" && forexOpen(now))) {
      const newest = Math.max(...slugs.map((s) => { try { return cachedBars(s, "5m").at(-1)?.ts ?? 0; } catch { return 0; } }));
      if (now.getTime() - newest > 45 * MIN) problems.push({ key, detail: `${SOURCE_LABEL[source]}: no new prices since ${new Date(newest).toISOString().slice(0, 16).replace("T", " ")} UTC` });
    }
  }
  return { checked, problems };
}

/** The scheduler (cron-job.org calling /api/cron/tick every 30 minutes) has gone quiet. */
export async function schedulerProblem(now = new Date()): Promise<{ checked: string[]; problems: Problem[] }> {
  const [r] = await sql()<{ at: Date | null }[]>`select max(started_at) as at from job_runs where job = 'tick' and status = 'ok'`;
  const at = r?.at;
  // Never ticked at all: nothing to compare with (a fresh database or a host without the outside scheduler).
  if (!at || now.getTime() - at.getTime() < 75 * MIN) return { checked: ["scheduler"], problems: [] };
  return { checked: ["scheduler"], problems: [{ key: "scheduler", detail: `No successful 30-minute update since ${at.toISOString().slice(0, 16).replace("T", " ")} UTC: check cron-job.org` }] };
}

async function tellOwners(subject: string, text: string) {
  const owners = await sql()<{ id: string; email: string }[]>`select id, email from users where email = any(${env().OWNER_EMAILS})`;
  for (const o of owners) {
    await sendEmail(o.email, subject, `${text}\n\nStatus: ${env().APP_URL}/status`).catch((e) => console.error(`health email: ${e}`));
    if (pushConfigured()) await sendPush(o.id, { title: subject, body: text, url: "/status", tag: "health" }).catch(() => {});
  }
}

/** Opens incidents for new problems, closes those that cleared among the keys checked, and notifies on each change. */
export async function recordHealth(r: { checked: string[]; problems: Problem[] }) {
  const db = sql();
  let opened = 0, resolved = 0;
  for (const p of r.problems) {
    const [row] = await db<{ fresh: boolean }[]>`
      insert into health_incidents (key, detail) values (${p.key}, ${p.detail})
      on conflict (key) where resolved_at is null do update set last_seen_at = now(), detail = excluded.detail
      returning (xmax = 0) as fresh`;
    if (row.fresh) { opened++; await tellOwners("Proofcast: data problem", p.detail); }
  }
  const ok = r.checked.filter((k) => !r.problems.some((p) => p.key === k));
  if (ok.length) {
    const closed = await db<{ key: string; detail: string; started_at: Date }[]>`
      update health_incidents set resolved_at = now() where resolved_at is null and key = any(${ok}) returning key, detail, started_at`;
    for (const c of closed) {
      resolved++;
      const mins = Math.round((Date.now() - c.started_at.getTime()) / MIN);
      await tellOwners("Proofcast: data back to normal", `Fixed after ${mins < 120 ? `${mins} minutes` : `${Math.round(mins / 60)} hours`}: ${c.detail}`);
    }
  }
  return { problems: r.problems.length, opened, resolved };
}
