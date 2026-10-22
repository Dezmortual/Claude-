import "server-only";
// Scheduled jobs, triggered by /api/cron/[job]. Each run is recorded in job_runs; failed runs stay there as the
// dead-letter log. Every job is safe to run twice: inserts are keyed, alert firing is a compare-and-set.
import { ASSETS, ASSET_BY_SLUG, MARKETS } from "@/lib/data/catalogue";
import { heldTwoBars } from "@/lib/data/indicators";
import { evaluate, holdsNow } from "@/lib/indicators/formula";
import { ensure, ensureCrosscheck, effectiveSource, warmAll } from "@/lib/data/marketdata";
import { MODELS, challenger, closedBars, quote, shortTerm, signalFromP } from "@/lib/data/model";
import type { MarketCode, Signal, Timeframe } from "@/lib/data/types";
import { SIGNAL_LABEL } from "@/lib/format";
import { sql } from "./db";
import { sendEmail } from "./email";
import { pushConfigured, sendPush } from "./push";
import { env } from "./env";

const STEP: Record<Timeframe, number> = { "5m": 300_000, "30m": 1_800_000, "1h": 3_600_000, "1d": 86_400_000, "1w": 604_800_000 };
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
export async function ingestMarket(market: MarketCode, part = 1, parts = 1) {
  const slugs = liveSlugs().filter((s) => ASSET_BY_SLUG.get(s)!.market === market).filter((_, i) => i % parts === part - 1);
  await Promise.all([ensure(slugs, ["5m", "30m", "1h", "1d", "1w"]), market === "crypto" && part === 1 ? ensureCrosscheck() : null]);
  return { market, part: `${part}/${parts}`, assets: slugs.length };
}

/** Crypto has the most assets, so its price loading is cut into this many requests. */
export const CRYPTO_PARTS = 3;

// ---------------------------------------------------------------- publish + score

/** Locks in the current forecasts for live assets. Demo-series assets are never published or scored. */
export async function publishForecasts() {
  const db = sql();
  const slugs = liveSlugs();
  // At most one publish per UTC hour, however often the scheduler calls: forecasts are hourly by design, and
  // duplicates would weight the track record towards whichever hour got called most.
  const [done] = await db`select 1 from forecast_runs where model_version = ${MODELS.live} and status = 'published'
    and published_at >= date_trunc('hour', now())`;
  if (done) return { skipped: "already published this hour" };
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
  signal: Signal | null; timeframe: Timeframe | null; armed: boolean; cooldown_minutes: number; last_fired_at: Date | null; channels: string[];
  indicator_name: string | null; buy_rule: string | null; sell_rule: string | null };

export async function evaluateAlerts() {
  const db = sql();
  const alerts = await db<AlertDue[]>`
    select al.id, al.user_id, a.slug, a.name, u.email, al.condition, al.threshold, al.signal, al.timeframe, al.armed, al.cooldown_minutes, al.last_fired_at, al.channels,
      ui.name as indicator_name, ui.buy_rule, ui.sell_rule
    from alerts al join assets a on a.id = al.asset_id join users u on u.id = al.user_id left join user_indicators ui on ui.id = al.indicator_id
    where al.is_active and a.is_active and u.email_verified_at is not null`;
  if (!alerts.length) return { checked: 0, fired: 0 };
  await ensure([...new Set(alerts.map((a) => a.slug))]);
  let fired = 0, rearmed = 0;
  for (const al of alerts) {
    if (!closedBars(al.slug, "1d").length) continue;
    const q = quote(al.slug);
    if (q.status === "stale") continue; // never alert on old prices
    let hit = false, message = "";
    let observedAt: Date | null = new Date(q.observedAt); // the price or bar the alert is judged on
    const asset = ASSET_BY_SLUG.get(al.slug)!;
    if (al.condition === "price_above" || al.condition === "price_below") {
      hit = al.condition === "price_above" ? q.price > al.threshold! : q.price < al.threshold!;
      message = `${asset.name} is at ${q.price.toPrecision(6)}, ${al.condition === "price_above" ? "above" : "below"} your level of ${al.threshold}.`;
    } else if (al.condition === "signal_becomes") {
      // Damped: the new reading must hold on the last two closed bars, so one bar's flicker doesn't fire an alert.
      const bars = closedBars(al.slug, al.timeframe!);
      hit = heldTwoBars(al.timeframe!, bars, al.signal!);
      observedAt = bars.length ? new Date(bars.at(-1)!.ts + STEP[al.timeframe!]) : null;
      message = `${asset.name}'s ${al.timeframe} signal is now ${SIGNAL_LABEL[al.signal!].toLowerCase()}, held for two closed bars.`;
    } else if (al.condition === "indicator_signal") {
      // The rule as it stands on the last closed bar of the chosen chart. A formula that no longer parses never fires.
      const rule = al.signal === "buy" ? al.buy_rule : al.sell_rule, bars = closedBars(al.slug, al.timeframe!);
      try { hit = !!rule && bars.length > 0 && holdsNow(evaluate(rule, bars)); } catch { hit = false; }
      observedAt = bars.length ? new Date(bars.at(-1)!.ts + STEP[al.timeframe!]) : null;
      message = `${asset.name}: your indicator "${al.indicator_name}" gives a ${al.signal} signal on the ${al.timeframe} chart, at ${q.price.toPrecision(6)}.`;
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
    const email = al.channels.includes("email") ? "pending" : "skipped", push = al.channels.includes("push") ? "pending" : "skipped";
    await db`insert into alert_events (alert_id, user_id, message, dedupe_key, email_status, push_status, observed_at)
      values (${al.id}, ${al.user_id}, ${message}, ${`${al.id}:${Math.floor(Date.now() / 60_000)}`}, ${email}, ${push}, ${observedAt})
      on conflict (dedupe_key) do nothing`;
    fired++;
  }
  return { checked: alerts.length, fired, rearmed };
}

const utc = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
/** Says how old the data was, so a late alert is visibly late. */
function timing(observed: Date | null, fired: Date) {
  return `${observed ? `Based on data up to ${utc(observed)}. ` : ""}Fired ${utc(fired)}, sent ${utc(new Date())}.`;
}

/** Sends pending alert emails (failures retry on later runs, up to 5 attempts, then stay as failed) and pushes
 *  (one try: a push that arrives an hour late is worse than none). */
export async function deliverAlerts() {
  const db = sql();
  const events = await db<{ id: string; email: string; message: string; slug: string; attempts: number; fired_at: Date; observed_at: Date | null }[]>`
    select e.id, u.email, e.message, a.slug, e.attempts, e.fired_at, e.observed_at from alert_events e join users u on u.id = e.user_id
    join alerts al on al.id = e.alert_id join assets a on a.id = al.asset_id
    where e.email_status in ('pending', 'failed') and e.attempts < 5 order by e.fired_at limit 100`;
  let sent = 0, failed = 0;
  for (const e of events) {
    try {
      await sendEmail(e.email, `Alert: ${ASSET_BY_SLUG.get(e.slug)?.name ?? e.slug}`, `${e.message}\n\n${timing(e.observed_at, e.fired_at)}\n\nSee it: ${env().APP_URL}/assets/${e.slug}\nManage alerts: ${env().APP_URL}/alerts\n\nForecasts and signals are statistics, not financial advice.`);
      await db`update alert_events set email_status = 'sent', email_sent_at = now(), attempts = attempts + 1, last_error = null where id = ${e.id}`;
      sent++;
    } catch (err) {
      await db`update alert_events set email_status = 'failed', attempts = attempts + 1, last_error = ${String(err).slice(0, 300)} where id = ${e.id}`;
      failed++;
    }
  }
  const pushes = await db<{ id: string; user_id: string; message: string; slug: string; observed_at: Date | null }[]>`
    select e.id, e.user_id, e.message, a.slug, e.observed_at from alert_events e join alerts al on al.id = e.alert_id join assets a on a.id = al.asset_id
    where e.push_status = 'pending' order by e.fired_at limit 100`;
  let pushed = 0, pushFailed = 0;
  for (const e of pushes) {
    try {
      if (!pushConfigured()) throw new Error("push is not configured (VAPID keys missing)");
      const r = await sendPush(e.user_id, { title: `Alert: ${ASSET_BY_SLUG.get(e.slug)?.name ?? e.slug}`, body: e.observed_at ? `${e.message} Data to ${utc(e.observed_at)}.` : e.message, url: `/assets/${e.slug}`, tag: `alert-${e.id}` });
      await db`update alert_events set push_status = ${r.sent ? "sent" : "skipped"}, push_sent_at = ${r.sent ? new Date() : null} where id = ${e.id}`;
      if (r.sent) pushed++;
    } catch (err) {
      await db`update alert_events set push_status = 'failed', last_error = ${String(err).slice(0, 300)} where id = ${e.id}`;
      pushFailed++;
    }
  }
  return { sent, failed, pushed, pushFailed };
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

/** Everything a scheduled run does, in one request, for an outside scheduler hitting a single URL every 30 minutes
 *  (cron-job.org on Vercel's free plan, where a function may run for minutes): prices market by market and alerts
 *  every run, publish and score on the run in the first half of the hour, cleanup on the 03:00 UTC run. */
async function tick() {
  const now = new Date();
  const out: Record<string, unknown> = {};
  for (const m of MARKETS) out[`ingest-${m.code}`] = await ingestMarket(m.code);
  out.alerts = { ...(await evaluateAlerts()), ...(await deliverAlerts()) };
  if (now.getUTCMinutes() < 30) out.publish = { ...(await publishForecasts()), ...(await scoreForecasts()) };
  if (now.getUTCHours() === 3 && now.getUTCMinutes() < 30) out.cleanup = await cleanup();
  return out;
}

export const JOBS: Record<string, () => Promise<unknown>> = {
  ingest,
  ...Object.fromEntries(MARKETS.map((m) => [`ingest-${m.code}`, () => ingestMarket(m.code)])),
  ...Object.fromEntries(Array.from({ length: CRYPTO_PARTS }, (_, i) => [`ingest-crypto-${i + 1}`, () => ingestMarket("crypto", i + 1, CRYPTO_PARTS)])),
  publish: async () => ({ ...(await publishForecasts()), ...(await scoreForecasts()) }),
  alerts: async () => ({ ...(await evaluateAlerts()), ...(await deliverAlerts()) }),
  cleanup,
  tick,
};
