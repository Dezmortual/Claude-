import "server-only";
// Scheduled jobs, triggered by /api/cron/[job]. Each run is recorded in job_runs; failed runs stay there as the
// dead-letter log. Every job is safe to run twice: inserts are keyed, alert firing is a compare-and-set.
import { ASSETS, ASSET_BY_SLUG, MARKETS } from "@/lib/data/catalogue";
import { pulse } from "@/lib/data/indicators";
import { ensure, ensureCrosscheck, effectiveSource, warmAll } from "@/lib/data/marketdata";
import { MODELS, challenger, closedBars, quote, shortTerm, signalFromP } from "@/lib/data/model";
import type { MarketCode, Signal, Timeframe } from "@/lib/data/types";
import { SIGNAL_LABEL } from "@/lib/format";
import { sql } from "./db";
import { sendEmail } from "./email";
import { env } from "./env";

const liveSlugs = () => ASSETS.filter((a) => effectiveSource(a.slug) !== "demo").map((a) => a.slug);

export async function runJob<T>(job: string, fn: () => Promise<T>) {
  const db = sql();
  const [run] = await db<{ id: string }[]>`insert into job_runs (job) values (${job}) returning id`;
  try {
    const detail = await fn();
    await db`update job_runs set status = 'ok', finished_at = now(), detail = ${db.json((detail ?? {}) as never)} where id = ${run.id}`;
    return detail;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db`update job_runs set status = 'failed', finished_at = now(), detail = ${db.json({ error: msg })} where id = ${run.id}`;
    throw e;
  }
}

// ---------------------------------------------------------------- ingest

export async function ingest() {
  await Promise.all([warmAll(["5m", "30m", "1h", "1d", "1w"]), ensureCrosscheck()]);
  return { assets: liveSlugs().length };
}

/** One market's live series. The scheduled run calls these in turn, so no single request carries every asset
 *  (Netlify's synchronous functions stop at about 10 s). */
export async function ingestMarket(market: MarketCode) {
  const slugs = liveSlugs().filter((s) => ASSET_BY_SLUG.get(s)!.market === market);
  await Promise.all([ensure(slugs, ["5m", "30m", "1h", "1d", "1w"]), market === "crypto" ? ensureCrosscheck() : null]);
  return { market, assets: slugs.length };
}

// ---------------------------------------------------------------- publish + score

/** Locks in the current forecasts for live assets. Demo-series assets are never published or scored. */
export async function publishForecasts() {
  const db = sql();
  const slugs = liveSlugs();
  await ensure(slugs, ["5m", "1d"]);
  let runId: string;
  try {
    [{ id: runId }] = await db<{ id: string }[]>`insert into forecast_runs (model_version) values (${MODELS.live}) returning id`;
  } catch {
    return { skipped: "another run is in progress" };
  }
  try {
    const ids = new Map((await db<{ id: string; slug: string }[]>`select id, slug from assets`).map((r) => [r.slug, r.id]));
    type Row = { asset_id: string; horizon: string; base_price: number; generated_at: Date; target_at: Date;
      low: number; mid: number; high: number; p_up: number; signal: Signal };
    const rows: (Row & { run_id: string })[] = [];
    const shadow: Row[] = [];
    const now = new Date();
    for (const slug of slugs) {
      if (!closedBars(slug, "1d").length || quote(slug).status === "stale") continue;
      const base = quote(slug).price;
      const ch = challenger(slug);
      for (const p of shortTerm(slug).points) {
        if (p.kind !== "forecast") continue;
        const common = { asset_id: ids.get(slug)!, horizon: p.horizon, base_price: base, generated_at: now, target_at: new Date(p.targetAt) };
        rows.push({ run_id: runId, ...common, low: p.low, mid: p.mid, high: p.high, p_up: p.pUp!, signal: p.signal! });
        const c = ch?.[p.horizon as "1d" | "7d" | "1m"];
        // Same asset, base price and target time as the live forecast, so the two can be compared pair by pair.
        if (c) shadow.push({ ...common, low: base * Math.exp(c.lo), mid: base * Math.exp(c.mid), high: base * Math.exp(c.hi), p_up: c.pUp, signal: signalFromP(c.pUp) });
      }
    }
    if (rows.length) await db`insert into forecasts ${db(rows)}`;
    await db`update forecast_runs set status = 'published', published_at = now() where id = ${runId}`;
    // The challenger's run: hidden from every screen, scored like any other (see replica/model.md).
    if (shadow.length) {
      const [{ id: chId }] = await db<{ id: string }[]>`insert into forecast_runs (model_version) values (${MODELS.challenger}) returning id`;
      await db`insert into forecasts ${db(shadow.map((r) => ({ run_id: chId, ...r })))}`;
      await db`update forecast_runs set status = 'published', published_at = now() where id = ${chId}`;
    }
    return { published: rows.length, challenger: shadow.length };
  } catch (e) {
    await db`update forecast_runs set status = 'failed', notes = ${String(e).slice(0, 500)} where id = ${runId}`;
    throw e;
  }
}

/** Scores every forecast whose target time has passed, against the close of the bar that ends at or before it. */
export async function scoreForecasts() {
  const db = sql();
  const due = await db<{ id: string; slug: string; base_price: number; mid: number; low: number; high: number; target_at: Date }[]>`
    select f.id, a.slug, f.base_price, f.mid, f.low, f.high, f.target_at from forecasts f join assets a on a.id = f.asset_id
    where f.target_at <= now() and not exists (select 1 from forecast_outcomes o where o.forecast_id = f.id)
    order by f.target_at limit 5000`;
  if (!due.length) return { scored: 0 };
  await ensure([...new Set(due.map((d) => d.slug))], ["1h", "1d"]);
  const out = [];
  for (const f of due) {
    const intraday = closedBars(f.slug, "1h");
    const series = intraday.length ? intraday : closedBars(f.slug, "1d");
    const step = intraday.length ? 3_600_000 : 86_400_000;
    const t = f.target_at.getTime();
    const bar = [...series].reverse().find((b) => b.ts + step <= t + 1);
    // Need a bar that closes within two steps of the target; otherwise wait for data.
    if (!bar || t - (bar.ts + step) > 2 * step) continue;
    const realized = bar.c;
    const predictedUp = f.mid >= f.base_price;
    out.push({ forecast_id: f.id, realized_price: realized, realized_at: new Date(bar.ts + step),
      direction_hit: predictedUp === realized >= f.base_price, inside_band: realized >= f.low && realized <= f.high,
      abs_pct_error: (Math.abs(realized - f.mid) / f.mid) * 100 });
  }
  if (out.length) await db`insert into forecast_outcomes ${db(out)} on conflict (forecast_id) do nothing`;
  return { due: due.length, scored: out.length };
}

// ---------------------------------------------------------------- alerts

type AlertDue = { id: string; user_id: string; slug: string; name: string; email: string; condition: string; threshold: number | null;
  signal: Signal | null; timeframe: Timeframe | null; armed: boolean; cooldown_minutes: number; last_fired_at: Date | null };

export async function evaluateAlerts() {
  const db = sql();
  const alerts = await db<AlertDue[]>`
    select al.id, al.user_id, a.slug, a.name, u.email, al.condition, al.threshold, al.signal, al.timeframe, al.armed, al.cooldown_minutes, al.last_fired_at
    from alerts al join assets a on a.id = al.asset_id join users u on u.id = al.user_id
    where al.is_active and a.is_active and u.email_verified_at is not null`;
  if (!alerts.length) return { checked: 0, fired: 0 };
  await ensure([...new Set(alerts.map((a) => a.slug))]);
  let fired = 0, rearmed = 0;
  for (const al of alerts) {
    if (!closedBars(al.slug, "1d").length) continue;
    const q = quote(al.slug);
    if (q.status === "stale") continue; // never alert on old prices
    let hit = false, message = "";
    const asset = ASSET_BY_SLUG.get(al.slug)!;
    if (al.condition === "price_above" || al.condition === "price_below") {
      hit = al.condition === "price_above" ? q.price > al.threshold! : q.price < al.threshold!;
      message = `${asset.name} is at ${q.price.toPrecision(6)}, ${al.condition === "price_above" ? "above" : "below"} your level of ${al.threshold}.`;
    } else if (al.condition === "signal_becomes") {
      const verdict = pulse(al.timeframe!, closedBars(al.slug, al.timeframe!)).verdict;
      hit = verdict === al.signal;
      message = `${asset.name}'s ${al.timeframe} signal is now ${SIGNAL_LABEL[al.signal!].toLowerCase()}.`;
    } else {
      const p7 = shortTerm(al.slug).points.find((p) => p.horizon === "7d")!;
      hit = Math.abs(p7.changePct) >= al.threshold!;
      message = `${asset.name}'s 7-day forecast now expects a ${p7.changePct.toFixed(2)}% move, beyond your ${al.threshold}%.`;
    }
    if (!hit) {
      if (!al.armed) { await db`update alerts set armed = true where id = ${al.id}`; rearmed++; }
      continue;
    }
    const cooled = !al.last_fired_at || Date.now() - al.last_fired_at.getTime() >= al.cooldown_minutes * 60_000;
    if (!al.armed || !cooled) continue;
    // Compare-and-set: only one evaluator can fire this alert for this condition episode.
    const won = await db`update alerts set armed = false, last_fired_at = now() where id = ${al.id} and armed returning 1`;
    if (!won.length) continue;
    await db`insert into alert_events (alert_id, user_id, message, dedupe_key)
      values (${al.id}, ${al.user_id}, ${message}, ${`${al.id}:${Math.floor(Date.now() / 60_000)}`}) on conflict (dedupe_key) do nothing`;
    fired++;
  }
  return { checked: alerts.length, fired, rearmed };
}

/** Sends pending alert emails; failures retry on later runs, up to 5 attempts, then stay as failed. */
export async function deliverAlerts() {
  const db = sql();
  const events = await db<{ id: string; email: string; message: string; slug: string; attempts: number }[]>`
    select e.id, u.email, e.message, a.slug, e.attempts from alert_events e join users u on u.id = e.user_id
    join alerts al on al.id = e.alert_id join assets a on a.id = al.asset_id
    where e.email_status in ('pending', 'failed') and e.attempts < 5 order by e.fired_at limit 100`;
  let sent = 0, failed = 0;
  for (const e of events) {
    try {
      await sendEmail(e.email, `Alert: ${ASSET_BY_SLUG.get(e.slug)?.name ?? e.slug}`, `${e.message}\n\nSee it: ${env().APP_URL}/assets/${e.slug}\nManage alerts: ${env().APP_URL}/alerts\n\nForecasts and signals are statistics, not financial advice.`);
      await db`update alert_events set email_status = 'sent', attempts = attempts + 1, last_error = null where id = ${e.id}`;
      sent++;
    } catch (err) {
      await db`update alert_events set email_status = 'failed', attempts = attempts + 1, last_error = ${String(err).slice(0, 300)} where id = ${e.id}`;
      failed++;
    }
  }
  return { sent, failed };
}

/** Housekeeping: expired sessions and tokens, old rate-limit windows, old job logs. */
export async function cleanup() {
  const db = sql();
  const [s] = await db`with d as (delete from sessions where expires_at < now() returning 1) select count(*)::int as n from d`;
  await db`delete from email_tokens where expires_at < now() - interval '7 days'`;
  await db`delete from rate_limits where window_start < now() - interval '1 day'`;
  await db`delete from job_runs where started_at < now() - interval '30 days' and status = 'ok'`;
  return { sessionsRemoved: s.n };
}

export const JOBS: Record<string, () => Promise<unknown>> = {
  ingest,
  ...Object.fromEntries(MARKETS.map((m) => [`ingest-${m.code}`, () => ingestMarket(m.code)])),
  publish: async () => ({ ...(await publishForecasts()), ...(await scoreForecasts()) }),
  alerts: async () => ({ ...(await evaluateAlerts()), ...(await deliverAlerts()) }),
  cleanup,
};
