import "server-only";
// The live data layer: Postgres for users and their data, official market-data APIs (cached in price_bars) for prices.
// Same contract as the demo layer it replaced, now async. Screens and API routes import only from ./index.
// Authorisation: every user-owned query is scoped by the viewer's user id here; RLS stays on with no policies.
import { sql } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { endAllSessions, isOwner, sessionUser } from "@/lib/server/auth";
import { pushConfigured, sendPush } from "@/lib/server/push";
import { ASSETS, ASSET_BY_SLUG, MARKETS, PLANS, PLAN_BY_CODE } from "./catalogue";
import { pulse, signalHistory } from "./indicators";
import { check as checkFormula } from "../indicators/formula";
import { ensure, ensureCrosscheck } from "./marketdata";
import { MODELS, closedBars, isDemo, metrics, paths, quote, scenarios, shortTerm } from "./model";
import {
  DataError, type Alert, type AlertCondition, type Asset, type Bar, type ForecastPage, type ForecastQuery, type ForecastRow,
  type Horizon, type Market, type MarketCode, type Mover, type Plan, type Signal, type TablePrefs, type Timeframe, type UserIndicator, type Viewer,
} from "./types";

const PULSE_TFS: Timeframe[] = ["5m", "30m", "1h", "1d", "1w"];
const ROW_TFS: Timeframe[] = ["5m", "30m", "1h", "1d"];

// ---------------------------------------------------------------- entitlements

export function canSee(v: Viewer, a: Asset) {
  return v.plan.markets.includes(a.market) && (!v.plan.publicOnly || a.isPublic);
}

/** Which plan unlocks this asset (for paywall copy in a non-private build). */
export function planFor(a: Asset): Plan {
  return PLANS.find((p) => p.markets.includes(a.market) && (!p.publicOnly || a.isPublic))!;
}

export function runAt(): string {
  return new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
}

export function privateMode() {
  return env().PRIVATE_MODE;
}

export { isDemo };

// ---------------------------------------------------------------- catalogue

export function listMarkets(v: Viewer): Market[] {
  return MARKETS.map((m) => ({ ...m, locked: !v.plan.markets.includes(m.code) }));
}

export function getAsset(slug: string): Asset | null {
  return ASSET_BY_SLUG.get(slug) ?? null;
}

export function listAssets(market?: MarketCode): Asset[] {
  return market ? ASSETS.filter((a) => a.market === market) : ASSETS;
}

export function relatedAssets(slug: string, n = 4): Asset[] {
  const a = ASSET_BY_SLUG.get(slug);
  if (!a) return [];
  return ASSETS.filter((x) => x.market === a.market && x.slug !== slug).slice(0, n);
}

export function listPlans(): Plan[] {
  return PLANS;
}

function requireAsset(slug: string): Asset {
  const a = getAsset(slug);
  if (!a) throw new DataError("not_found", "No such asset");
  return a;
}

/** Load prices for the assets a call touches (only those the viewer may see). */
async function load(v: Viewer, assets: Asset[], tfs: Timeframe[] = ROW_TFS) {
  const seen = assets.filter((a) => canSee(v, a)).map((a) => a.slug);
  await Promise.all([ensure(seen, tfs), seen.some((s) => ASSET_BY_SLUG.get(s)!.market === "crypto") ? ensureCrosscheck() : null]);
}

// ---------------------------------------------------------------- forecast table

function row(v: Viewer, a: Asset): ForecastRow {
  if (!canSee(v, a)) return { asset: a, locked: true, demo: isDemo(a.slug) };
  if (!closedBars(a.slug, "1d").length) return { asset: a, locked: true }; // no data yet: treated like a locked row
  const qt = quote(a.slug);
  const { points } = shortTerm(a.slug);
  const m = metrics(a.slug);
  const h7 = points.find((p) => p.horizon === "7d")!;
  const intraday: ForecastRow["intraday"] = {};
  for (const tf of ["5m", "30m", "1h"] as const) intraday[tf] = pulse(tf, closedBars(a.slug, tf)).verdict;
  return {
    asset: a, locked: false, demo: isDemo(a.slug), price: qt.price, change24hPct: qt.change24hPct,
    horizons: Object.fromEntries(points.map((p) => [p.horizon, { mid: p.mid, changePct: p.changePct }])),
    signal: h7.signal!, pUp: h7.pUp!, intraday,
    metrics: { macd: m.macd, maCross: m.maCross, ma200Trend: m.ma200Trend, pctFromMa200: m.pctFromMa200,
      volatilityPct: m.volatilityPct, volatilityLabel: m.volatilityLabel, sharpe: m.sharpe, dividendYieldPct: m.dividendYieldPct },
  };
}

const SORTS: Record<string, (r: ForecastRow) => number | string> = {
  asset: (r) => r.asset.name.toLowerCase(),
  price: (r) => r.price ?? -Infinity,
  change: (r) => r.change24hPct ?? -Infinity,
  "1d": (r) => r.horizons?.["1d"]?.changePct ?? -Infinity,
  "7d": (r) => r.horizons?.["7d"]?.changePct ?? -Infinity,
  "1m": (r) => r.horizons?.["1m"]?.changePct ?? -Infinity,
  "1y": (r) => r.horizons?.["1y"]?.changePct ?? -Infinity,
  "5y": (r) => r.horizons?.["5y"]?.changePct ?? -Infinity,
  "10y": (r) => r.horizons?.["10y"]?.changePct ?? -Infinity,
  signal: (r) => r.pUp ?? -Infinity,
  volatility: (r) => r.metrics?.volatilityPct ?? -Infinity,
  sharpe: (r) => r.metrics?.sharpe ?? -Infinity,
  dividend: (r) => r.metrics?.dividendYieldPct ?? -Infinity,
};

export async function listForecasts(v: Viewer, q: ForecastQuery): Promise<ForecastPage> {
  const perPage = [10, 20, 50, 100].includes(q.perPage ?? 0) ? q.perPage! : 20;
  const needle = (q.q ?? "").trim().toLowerCase();
  const assets = ASSETS
    .filter((a) => !q.market || q.market === "all" || a.market === q.market)
    .filter((a) => !needle || a.name.toLowerCase().includes(needle) || a.ticker.toLowerCase().includes(needle) || a.slug.includes(needle));
  await load(v, assets);
  let rows = assets.map((a) => row(v, a));
  if (q.signal && q.signal !== "all") rows = rows.filter((r) => !r.locked && r.signal === q.signal);
  if (q.volatility && q.volatility !== "all") rows = rows.filter((r) => !r.locked && r.metrics!.volatilityLabel === q.volatility);
  const key = SORTS[q.sort ?? ""] ?? null;
  const dir = q.dir ? (q.dir === "asc" ? 1 : -1) : q.sort === "asset" ? 1 : -1;
  rows.sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? 1 : -1;
    if (!key || a.locked) return 0;
    const x = key(a), y = key(b);
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, q.page ?? 1), pages);
  return { rows: rows.slice((page - 1) * perPage, page * perPage), page, pages, total, runAt: runAt(), tabLocked: q.tab === "day_trading" && !v.plan.dayTrading };
}

async function visibleWithData(v: Viewer, assets: Asset[] = ASSETS) {
  await load(v, assets, ["5m", "1d"]);
  return assets.filter((a) => canSee(v, a) && closedBars(a.slug, "1d").length);
}

export async function movers(v: Viewer, horizon: Exclude<Horizon, "5y" | "10y">, n = 7, market?: MarketCode): Promise<{ gainers: Mover[]; losers: Mover[] }> {
  const all = (await visibleWithData(v, market ? listAssets(market) : ASSETS)).map((a) => {
    const p = shortTerm(a.slug).points.find((x) => x.horizon === horizon)!;
    return { asset: a, changePct: p.changePct, price: quote(a.slug).price };
  });
  all.sort((a, b) => b.changePct - a.changePct);
  return { gainers: all.slice(0, n).filter((m) => m.changePct >= 0.005), losers: all.slice(-n).reverse().filter((m) => m.changePct <= -0.005) };
}

export async function outlook(v: Viewer, horizon: "1d" | "7d" | "1m", market?: MarketCode) {
  const pts = (await visibleWithData(v, market ? listAssets(market) : ASSETS)).map((a) => ({ a, p: shortTerm(a.slug).points.find((x) => x.horizon === horizon)! }));
  const up = pts.filter((x) => x.p.changePct > 0).length;
  const strongest = pts.reduce<(typeof pts)[number] | null>((best, x) => (!best || Math.abs(x.p.changePct) > Math.abs(best.p.changePct) ? x : best), null);
  return { total: pts.length, up, down: pts.length - up, strongest: strongest && { asset: strongest.a, changePct: strongest.p.changePct } };
}

// ---------------------------------------------------------------- dashboard

/** The asset that stands for each market on the dashboard. */
const HEADLINE: Record<MarketCode, string> = {
  crypto: "bitcoin", forex: "eurusd", stocks: "nvda", commodities: "gold", indices: "sp500", etfs: "qqq", bonds: "us-10y",
};

export interface DashboardCard { market: Market; row: ForecastRow; spark: number[] }

/** Everything the home dashboard shows, from one load: a card per market, the strongest live signals, signal counts
 *  and the scored track record so far. Demo-data assets never count towards the totals or the signal list. */
export async function dashboard(v: Viewer) {
  await load(v, ASSETS);
  const rows = ASSETS.map((a) => row(v, a));
  const live = rows.filter((r) => !r.locked && !r.demo);
  const bySlug = new Map(rows.map((r) => [r.asset.slug, r]));
  const cards: DashboardCard[] = MARKETS.map((m) => {
    const r = bySlug.get(HEADLINE[m.code])!;
    return { market: m, row: r, spark: r.locked ? [] : closedBars(r.asset.slug, "1d").slice(-30).map((b) => b.c) };
  });
  const strongest = [...live].sort((a, b) => Math.abs(b.pUp! - 0.5) - Math.abs(a.pUp! - 0.5)).slice(0, 6);
  const scored = await trackRecord();
  const n = scored.reduce((s, r) => s + r.n, 0);
  const hitRate = n ? scored.reduce((s, r) => s + r.hit_rate * r.n, 0) / n : null;
  return {
    cards, strongest, runAt: runAt(),
    counts: {
      live: live.length,
      bullish: live.filter((r) => r.signal === "buy" || r.signal === "strong_buy").length,
      bearish: live.filter((r) => r.signal === "sell" || r.signal === "strong_sell").length,
    },
    record: { scored: n, hitRate },
  };
}

// ---------------------------------------------------------------- asset pages

/** Loads everything an asset page needs in one go. Locked assets still get prices (the daily signal is shown free). */
async function loadAsset(slug: string, tfs: Timeframe[] = PULSE_TFS) {
  const a = requireAsset(slug);
  await Promise.all([ensure([slug], tfs), a.market === "crypto" ? ensureCrosscheck() : null]);
  if (!closedBars(slug, "1d").length) throw new DataError("not_found", `No price history for ${a.name} yet`);
  return a;
}

export async function assetSummary(v: Viewer, slug: string) {
  const asset = await loadAsset(slug);
  return { asset, quote: quote(slug), metrics: metrics(slug), locked: !canSee(v, asset), unlockPlan: planFor(asset), demo: isDemo(slug) };
}

const RANGE_DAYS: Record<string, number> = { "1d": 1, "1w": 7, "1m": 31, "3m": 92, "1y": 366, "5y": 1830, all: 1e9 };

/** `warmup`: up to this many bars from before the range, so indicators on the chart have history from its first bar. */
export async function assetBars(v: Viewer, slug: string, range: string, warmup = 0): Promise<{ tf: Timeframe; bars: Bar[]; warmup: Bar[] }> {
  const a = await loadAsset(slug, ["5m", "1h", "1d", "1w"]);
  const days = RANGE_DAYS[range] ?? 92;
  let tf: Timeframe = days <= 1 ? "5m" : days <= 7 ? "1h" : days <= 366 ? "1d" : "1w";
  if ((tf === "5m" || tf === "1h") && !canSee(v, a)) throw new DataError("forbidden", "Intraday charts need a plan");
  if ((tf === "5m" || tf === "1h") && !closedBars(slug, tf).length) tf = "1d"; // daily-only sources
  const from = Date.now() - days * 86_400_000;
  const all = closedBars(slug, tf), first = all.findIndex((x) => x.ts >= from);
  const start = first === -1 ? all.length : first;
  return { tf, bars: all.slice(start), warmup: all.slice(Math.max(0, start - Math.min(warmup, 500)), start) };
}

export async function assetForecast(v: Viewer, slug: string) {
  const a = await loadAsset(slug);
  if (!canSee(v, a)) throw new DataError("forbidden", `Forecasts for ${a.name} are on the ${planFor(a).name} plan`);
  return { runAt: runAt(), basePrice: quote(slug).price, points: shortTerm(slug).points, paths: paths(slug) };
}

export async function assetSignals(v: Viewer, slug: string) {
  const a = await loadAsset(slug);
  const full = canSee(v, a);
  return PULSE_TFS.map((tf) => {
    const b = closedBars(slug, tf);
    const p = pulse(tf, b);
    if (!b.length) return { ...p, reason: "This source publishes one price per day", locked: false };
    if (full) return { ...p, history: p.verdict === "unavailable" ? undefined : signalHistory(tf, b), locked: false };
    if (tf === "1d") return { ...p, indicators: [], locked: false };
    return { timeframe: tf, verdict: "unavailable" as const, ma: { buy: 0, neutral: 0, sell: 0 }, osc: { buy: 0, neutral: 0, sell: 0 },
      reason: `On the ${planFor(a).name} plan`, indicators: [], locked: true };
  });
}

export async function assetScenarios(slug: string) {
  await loadAsset(slug, ["5m", "1d"]);
  return scenarios(slug);
}

export async function assetStats(slug: string) {
  await loadAsset(slug, ["5m", "1d"]);
  const d = closedBars(slug, "1d");
  const b5 = closedBars(slug, "5m").filter((x) => x.ts >= Date.now() - 86_400_000);
  const day = b5.length ? b5 : d.slice(-1);
  const last = quote(slug).price;
  const back = (n: number) => d.at(-1 - n)?.c ?? null;
  const ch = (p: number | null) => (p ? (last / p - 1) * 100 : null);
  const yr = d.slice(-365);
  const month = d.slice(-31);
  const rets = month.map((x, i) => (i ? Math.log(x.c / month[i - 1].c) : 0)).slice(1);
  return {
    day: { lo: Math.min(...day.map((x) => x.l)), hi: Math.max(...day.map((x) => x.h)), short: b5.length < 250 },
    week52: { lo: Math.min(...yr.map((x) => x.l)), hi: Math.max(...yr.map((x) => x.h)) },
    change: { "7d": ch(back(7)), "30d": ch(back(30)), "1y": ch(back(365)) },
    upDays30: rets.filter((r) => r > 0).length,
    days30: rets.length,
  };
}

// ---------------------------------------------------------------- viewer

const GUEST_PLAN = PLAN_BY_CODE.get("free")!;
const OWNER_PLAN: Plan = { ...PLAN_BY_CODE.get("unlimited")!, name: "Owner" };

/** Private build: the owner gets everything, free; any other session is treated as signed out. */
export async function getViewer(token: string | undefined): Promise<Viewer> {
  const u = await sessionUser(token);
  if (!u || !u.verified) return { user: null, plan: GUEST_PLAN, subscription: null };
  const owner = isOwner(u.email);
  if (privateMode() && !owner) return { user: null, plan: GUEST_PLAN, subscription: null };
  const user = { id: u.id, name: u.name, email: u.email, timezone: u.timezone, createdAt: u.created_at.toISOString() };
  return { user, plan: owner ? OWNER_PLAN : GUEST_PLAN, subscription: null };
}

function requireUser(v: Viewer) {
  if (!v.user) throw new DataError("unauthorized", "Sign in first");
  return v.user;
}

export async function updateProfile(v: Viewer, patch: { name?: string; timezone?: string }) {
  const u = requireUser(v);
  if (patch.name !== undefined && !patch.name.trim()) throw new DataError("invalid", "Enter your name");
  if (patch.timezone) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: patch.timezone }); } catch { throw new DataError("invalid", "Unknown time zone"); }
  }
  await sql()`update users set name = coalesce(${patch.name?.trim().slice(0, 80) ?? null}, name), timezone = coalesce(${patch.timezone ?? null}, timezone) where id = ${u.id}`;
}

export async function deleteAccount(v: Viewer) {
  const u = requireUser(v);
  await sql()`delete from users where id = ${u.id}`; // cascades to sessions, tokens, watchlist, alerts, events, prefs
}

export async function signOutEverywhere(v: Viewer) {
  await endAllSessions(requireUser(v).id);
}

// ---------------------------------------------------------------- watchlist

function requireFeature(v: Viewer) {
  requireUser(v);
  if (!v.plan.watchlistAlerts) throw new DataError("limit", "Watchlists and alerts aren't on this plan");
}

export async function watchlistSlugs(v: Viewer): Promise<string[]> {
  if (!v.user) return [];
  const rows = await sql()<{ slug: string }[]>`select a.slug from watchlist_items w join assets a on a.id = w.asset_id where w.user_id = ${v.user.id} order by w.sort, w.created_at`;
  return rows.map((r) => r.slug);
}

export async function getWatchlist(v: Viewer): Promise<ForecastRow[]> {
  requireUser(v);
  const assets = (await watchlistSlugs(v)).map((s) => getAsset(s)).filter((a): a is Asset => !!a);
  await load(v, assets);
  return assets.map((a) => row(v, a));
}

export async function addToWatchlist(v: Viewer, slug: string) {
  requireFeature(v);
  requireAsset(slug);
  const r = await sql()`insert into watchlist_items (user_id, asset_id) select ${v.user!.id}, id from assets where slug = ${slug} on conflict do nothing returning 1`;
  if (!r.length) throw new DataError("conflict", "Already on your watchlist");
}

export async function removeFromWatchlist(v: Viewer, slug: string) {
  const u = requireUser(v);
  await sql()`delete from watchlist_items where user_id = ${u.id} and asset_id = (select id from assets where slug = ${slug})`;
}

// ---------------------------------------------------------------- alerts

export interface AlertInput {
  assetSlug: string; condition: AlertCondition; threshold?: number | null; signal?: Signal | null;
  timeframe?: Timeframe | null; channels?: ("email" | "push")[]; cooldownMinutes?: number; indicatorId?: string | null;
}

type AlertRow = { id: string; slug: string; condition: AlertCondition; threshold: number | null; signal: Signal | null; timeframe: Timeframe | null;
  indicator_id: string | null; indicator_name: string | null;
  channels: ("email" | "push")[]; is_active: boolean; cooldown_minutes: number; last_fired_at: Date | null; created_at: Date };

const toAlert = (r: AlertRow): Alert => ({ id: r.id, assetSlug: r.slug, condition: r.condition, threshold: r.threshold, signal: r.signal,
  timeframe: r.timeframe, indicatorId: r.indicator_id, indicatorName: r.indicator_name, channels: r.channels, isActive: r.is_active, cooldownMinutes: r.cooldown_minutes,
  lastFiredAt: r.last_fired_at?.toISOString() ?? null, createdAt: r.created_at.toISOString() });

export async function listAlerts(v: Viewer): Promise<Alert[]> {
  const u = requireUser(v);
  const rows = await sql()<AlertRow[]>`select al.*, a.slug, ui.name as indicator_name from alerts al join assets a on a.id = al.asset_id
    left join user_indicators ui on ui.id = al.indicator_id where al.user_id = ${u.id} order by al.created_at desc`;
  return rows.map(toAlert);
}

export async function createAlert(v: Viewer, i: AlertInput): Promise<Alert> {
  requireFeature(v);
  const a = requireAsset(i.assetSlug);
  if (!canSee(v, a)) throw new DataError("limit", `Alerts on ${a.name} aren't on this plan`);
  let indicatorName: string | null = null;
  if (i.condition === "signal_becomes") {
    if (!i.signal || !i.timeframe) throw new DataError("invalid", "Pick a signal and a timeframe");
  } else if (i.condition === "indicator_signal") {
    if (!i.indicatorId || (i.signal !== "buy" && i.signal !== "sell") || !i.timeframe) throw new DataError("invalid", "Pick an indicator, buy or sell, and a timeframe");
    const [ind] = await sql()<{ name: string; buy_rule: string | null; sell_rule: string | null }[]>`
      select name, buy_rule, sell_rule from user_indicators where id = ${i.indicatorId} and user_id = ${v.user!.id}`;
    if (!ind) throw new DataError("not_found", "No such indicator");
    if (!(i.signal === "buy" ? ind.buy_rule : ind.sell_rule)) throw new DataError("invalid", `${ind.name} has no ${i.signal} rule`);
    indicatorName = ind.name;
  } else if (!(typeof i.threshold === "number" && Number.isFinite(i.threshold) && i.threshold > 0)) {
    throw new DataError("invalid", i.condition === "forecast_move_above" ? "Enter a percentage above 0" : "Enter a price above 0");
  }
  const channels = [...new Set(i.channels?.length ? i.channels : ["email" as const])];
  if (channels.includes("push") && !pushConfigured()) throw new DataError("invalid", "Push isn't set up on this server yet");
  const db = sql();
  return db.begin(async (tx) => {
    // Lock the user's row so two tabs can't both slip under the limit.
    await tx`select 1 from users where id = ${v.user!.id} for update`;
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from alerts where user_id = ${v.user!.id} and is_active`;
    if (v.plan.maxAlerts !== null && n >= v.plan.maxAlerts) throw new DataError("limit", `Your plan allows ${v.plan.maxAlerts} active alerts`);
    const sig = i.condition === "signal_becomes" || i.condition === "indicator_signal";
    const [r] = await tx<AlertRow[]>`
      insert into alerts (user_id, asset_id, condition, threshold, signal, timeframe, indicator_id, channels, cooldown_minutes)
      select ${v.user!.id}, id, ${i.condition}, ${sig ? null : i.threshold!}, ${sig ? i.signal! : null}, ${sig ? i.timeframe! : null},
        ${i.condition === "indicator_signal" ? i.indicatorId! : null}, ${channels}, ${Math.max(5, i.cooldownMinutes ?? 60)} from assets where slug = ${i.assetSlug}
      returning *, ${i.assetSlug}::text as slug, ${indicatorName}::text as indicator_name`;
    return toAlert(r);
  }) as Promise<Alert>;
}

export async function updateAlert(v: Viewer, id: string, patch: { isActive?: boolean }) {
  const u = requireUser(v);
  const [cur] = await sql()<{ is_active: boolean }[]>`select is_active from alerts where id = ${id} and user_id = ${u.id}`;
  if (!cur) throw new DataError("not_found", "No such alert");
  if (patch.isActive && !cur.is_active && v.plan.maxAlerts !== null) {
    const [{ n }] = await sql()<{ n: number }[]>`select count(*)::int as n from alerts where user_id = ${u.id} and is_active`;
    if (n >= v.plan.maxAlerts) throw new DataError("limit", `Your plan allows ${v.plan.maxAlerts} active alerts`);
  }
  // Resuming re-arms the alert so it can fire on the next check.
  await sql()`update alerts set is_active = coalesce(${patch.isActive ?? null}, is_active), armed = armed or coalesce(${patch.isActive ?? null}, false)
    where id = ${id} and user_id = ${u.id}`;
}

export async function deleteAlert(v: Viewer, id: string) {
  const u = requireUser(v);
  await sql()`delete from alerts where id = ${id} and user_id = ${u.id}`;
}

export type AlertEvent = { id: string; slug: string; message: string; firedAt: string; observedAt: string | null;
  email: { status: string; sentAt: string | null }; push: { status: string; sentAt: string | null } };

/** Recently fired alerts with their timing: the data they were judged on, when they fired, when each channel sent. */
export async function alertEvents(v: Viewer, limit = 20): Promise<AlertEvent[]> {
  const u = requireUser(v);
  const rows = await sql()<{ id: string; slug: string; message: string; fired_at: Date; observed_at: Date | null; email_status: string;
    email_sent_at: Date | null; push_status: string; push_sent_at: Date | null }[]>`
    select e.id, a.slug, e.message, e.fired_at, e.observed_at, e.email_status, e.email_sent_at, e.push_status, e.push_sent_at
    from alert_events e join alerts al on al.id = e.alert_id join assets a on a.id = al.asset_id
    where e.user_id = ${u.id} order by e.fired_at desc limit ${limit}`;
  return rows.map((r) => ({ id: r.id, slug: r.slug, message: r.message, firedAt: r.fired_at.toISOString(), observedAt: r.observed_at?.toISOString() ?? null,
    email: { status: r.email_status, sentAt: r.email_sent_at?.toISOString() ?? null }, push: { status: r.push_status, sentAt: r.push_sent_at?.toISOString() ?? null } }));
}

/** Assets the viewer may set alerts on, with the current price for the form's hint. */
export async function alertableAssets(v: Viewer) {
  const assets = await visibleWithData(v);
  return assets.map((a) => ({ slug: a.slug, name: a.name, ticker: a.ticker, price: quote(a.slug).price }));
}

// ---------------------------------------------------------------- table preferences

export const DEFAULT_COLUMNS = ["price", "1d", "7d", "1m", "signal", "macd", "maCross", "ma200", "volatility"];
export const ALL_COLUMNS = ["price", "1d", "7d", "1m", "1y", "5y", "10y", "signal", "macd", "maCross", "ma200", "volatility", "sharpe", "dividend"];

export async function getPrefs(v: Viewer): Promise<TablePrefs> {
  const fallback: TablePrefs = { visibleColumns: DEFAULT_COLUMNS, rowsPerPage: 20, defaultTab: "investing" };
  if (!v.user) return fallback;
  const [r] = await sql()<{ visible_columns: string[]; rows_per_page: 10 | 20 | 50 | 100; default_tab: TablePrefs["defaultTab"] }[]>`
    select visible_columns, rows_per_page, default_tab from table_preferences where user_id = ${v.user.id}`;
  return r ? { visibleColumns: r.visible_columns, rowsPerPage: r.rows_per_page, defaultTab: r.default_tab } : fallback;
}

export async function setPrefs(v: Viewer, p: TablePrefs) {
  const u = requireUser(v);
  const cols = p.visibleColumns.filter((c) => ALL_COLUMNS.includes(c));
  if (!cols.length) throw new DataError("invalid", "Keep at least one column");
  if (![10, 20, 50, 100].includes(p.rowsPerPage)) throw new DataError("invalid", "Rows per page must be 10, 20, 50 or 100");
  await sql()`insert into table_preferences (user_id, visible_columns, rows_per_page, default_tab, updated_at)
    values (${u.id}, ${cols}, ${p.rowsPerPage}, ${p.defaultTab === "day_trading" ? "day_trading" : "investing"}, now())
    on conflict (user_id) do update set visible_columns = excluded.visible_columns, rows_per_page = excluded.rows_per_page,
      default_tab = excluded.default_tab, updated_at = now()`;
}

// ---------------------------------------------------------------- track record

type ScoreRow = { n: number; hit_rate: number; coverage: number; median_err: number; brier: number; up_rate: number; naive_err: number };

/** One model's scored forecasts by market and horizon. Two naive baselines are scored on the very same forecasts:
 *  "always up" (its hit rate is the share that ended higher) and "no change" (its error is the actual move). The Brier
 *  score grades the up-probability: lower is better, and a flat 50% scores 0.25. */
export async function trackRecord(model: string = MODELS.live) {
  return sql()<(ScoreRow & { horizon: string; market: string })[]>`
    select f.horizon, m.code as market, ${scoreCols()}
    from forecast_outcomes o join forecasts f on f.id = o.forecast_id join forecast_runs r on r.id = f.run_id
    join assets a on a.id = f.asset_id join markets m on m.id = a.market_id
    where r.model_version = ${model}
    group by f.horizon, m.code order by m.code, f.horizon`;
}

function scoreCols() {
  return sql()`count(*)::int as n,
      avg(o.direction_hit::int)::float as hit_rate, avg(o.inside_band::int)::float as coverage,
      percentile_cont(0.5) within group (order by o.abs_pct_error)::float as median_err,
      avg(power(f.p_up - (o.realized_price >= f.base_price)::int, 2))::float as brier,
      avg((o.realized_price >= f.base_price)::int)::float as up_rate,
      percentile_cont(0.5) within group (order by abs(o.realized_price / f.base_price - 1) * 100)::float as naive_err`;
}

/** Does "61% up" come true about 61% of the time? Scored forecasts grouped by their stated up-probability. */
export async function calibration(model: string = MODELS.live) {
  return sql()<{ bucket: number; label: string; n: number; stated: number; actual: number }[]>`
    with b as (
      select case when f.p_up < 0.35 then 0 when f.p_up < 0.45 then 1 when f.p_up <= 0.55 then 2 when f.p_up < 0.65 then 3 else 4 end as bucket,
        f.p_up, (o.realized_price >= f.base_price)::int as up
      from forecast_outcomes o join forecasts f on f.id = o.forecast_id join forecast_runs r on r.id = f.run_id
      where r.model_version = ${model})
    select bucket, (array['under 35%','35–45%','45–55%','55–65%','65% and over'])[bucket + 1] as label,
      count(*)::int as n, avg(p_up)::float as stated, avg(up)::float as actual
    from b group by bucket order by bucket`;
}

/** The live model and the challenger by horizon, over the same hours (both publish in every run). */
export async function modelComparison() {
  return sql()<(ScoreRow & { model: string; horizon: string })[]>`
    select r.model_version as model, f.horizon, ${scoreCols()}
    from forecast_outcomes o join forecasts f on f.id = o.forecast_id join forecast_runs r on r.id = f.run_id
    where r.model_version in (${MODELS.live}, ${MODELS.challenger})
    group by r.model_version, f.horizon order by f.horizon, r.model_version`;
}


// ---------------------------------------------------------------- push notifications

/** Whether this server can send push, its public key for subscribing, and how many of the user's devices are on. */
export async function pushStatus(v: Viewer) {
  const u = requireUser(v);
  const [r] = await sql()<{ n: number }[]>`select count(*)::int as n from push_subscriptions where user_id = ${u.id}`;
  return { configured: pushConfigured(), publicKey: env().VAPID_PUBLIC_KEY ?? null, devices: r.n };
}

export async function savePushSubscription(v: Viewer, s: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string | null) {
  const u = requireUser(v);
  if (!pushConfigured()) throw new DataError("invalid", "Push isn't set up on this server yet");
  // An endpoint belongs to one browser; re-subscribing (or a new owner on a shared device) takes it over.
  await sql()`insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    values (${u.id}, ${s.endpoint}, ${s.keys.p256dh}, ${s.keys.auth}, ${userAgent?.slice(0, 300) ?? null})
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
      user_agent = excluded.user_agent, created_at = now()`;
  return pushStatus(v);
}

export async function removePushSubscription(v: Viewer, endpoint: string) {
  const u = requireUser(v);
  await sql()`delete from push_subscriptions where user_id = ${u.id} and endpoint = ${endpoint}`;
  return pushStatus(v);
}

export async function sendTestPush(v: Viewer) {
  const u = requireUser(v);
  if (!pushConfigured()) throw new DataError("invalid", "Push isn't set up on this server yet");
  const r = await sendPush(u.id, { title: "Proofcast", body: "Notifications are on. Alerts you set will arrive here.", url: "/alerts", tag: "test" })
    .catch(() => { throw new DataError("invalid", "The push service didn't accept the test. Turn notifications off and on again."); });
  if (!r.sent) throw new DataError("invalid", "No device is turned on for notifications");
  return r;
}

// ---------------------------------------------------------------- indicators

type IndicatorRow = { id: string; name: string; lines: string[]; display: "overlay" | "pane"; buy_rule: string | null; sell_rule: string | null; updated_at: Date };
const toIndicator = (r: IndicatorRow): UserIndicator => ({ id: r.id, name: r.name, lines: r.lines, display: r.display, buyRule: r.buy_rule, sellRule: r.sell_rule, updatedAt: r.updated_at.toISOString() });
export type IndicatorInput = { name: string; lines: string[]; display: "overlay" | "pane"; buyRule?: string | null; sellRule?: string | null };
const MAX_INDICATORS = 50;

/** Every formula must parse; the message says which field and where. */
function validateIndicator(i: IndicatorInput) {
  const fields: [string, string | null | undefined][] = [...i.lines.map((l, n) => [`Line ${n + 1}`, l] as [string, string]), ["Buy rule", i.buyRule], ["Sell rule", i.sellRule]];
  for (const [label, f] of fields) {
    if (!f) continue;
    const err = checkFormula(f);
    if (err) throw new DataError("invalid", `${label}: ${err.message}`);
  }
}

export async function listIndicators(v: Viewer): Promise<UserIndicator[]> {
  const u = requireUser(v);
  return (await sql()<IndicatorRow[]>`select * from user_indicators where user_id = ${u.id} order by created_at`).map(toIndicator);
}

export async function getIndicator(v: Viewer, id: string): Promise<UserIndicator> {
  const u = requireUser(v);
  const [r] = await sql()<IndicatorRow[]>`select * from user_indicators where id = ${id} and user_id = ${u.id}`;
  if (!r) throw new DataError("not_found", "No such indicator");
  return toIndicator(r);
}

export async function createIndicator(v: Viewer, i: IndicatorInput): Promise<UserIndicator> {
  const u = requireUser(v);
  validateIndicator(i);
  return sql().begin(async (tx) => {
    await tx`select 1 from users where id = ${u.id} for update`;
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from user_indicators where user_id = ${u.id}`;
    if (n >= MAX_INDICATORS) throw new DataError("limit", `You can keep up to ${MAX_INDICATORS} indicators`);
    const [r] = await tx<IndicatorRow[]>`insert into user_indicators (user_id, name, lines, display, buy_rule, sell_rule)
      values (${u.id}, ${i.name.trim()}, ${i.lines}, ${i.display}, ${i.buyRule || null}, ${i.sellRule || null}) returning *`;
    return toIndicator(r);
  }) as Promise<UserIndicator>;
}

export async function updateIndicator(v: Viewer, id: string, i: IndicatorInput): Promise<UserIndicator> {
  const u = requireUser(v);
  validateIndicator(i);
  const [r] = await sql()<IndicatorRow[]>`update user_indicators set name = ${i.name.trim()}, lines = ${i.lines}, display = ${i.display},
    buy_rule = ${i.buyRule || null}, sell_rule = ${i.sellRule || null}, updated_at = now() where id = ${id} and user_id = ${u.id} returning *`;
  if (!r) throw new DataError("not_found", "No such indicator");
  // An alert on a rule that no longer exists can't fire: remove it rather than leave it silently dead.
  if (!r.buy_rule) await sql()`delete from alerts where indicator_id = ${id} and signal = 'buy'`;
  if (!r.sell_rule) await sql()`delete from alerts where indicator_id = ${id} and signal = 'sell'`;
  return toIndicator(r);
}

/** Deleting an indicator deletes the alerts that use it (on delete cascade). */
export async function deleteIndicator(v: Viewer, id: string) {
  const u = requireUser(v);
  const r = await sql()`delete from user_indicators where id = ${id} and user_id = ${u.id} returning 1`;
  if (!r.length) throw new DataError("not_found", "No such indicator");
}
