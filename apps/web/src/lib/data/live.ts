import "server-only";
// The live data layer: Postgres for users and their data, official market-data APIs (cached in price_bars) for prices.
// Same contract as the demo layer it replaced, now async. Screens and API routes import only from ./index.
// Authorisation: every user-owned query is scoped by the viewer's user id here; RLS stays on with no policies.
import { sql } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { endAllSessions, isOwner, sessionUser } from "@/lib/server/auth";
import { pushConfigured, sendPush } from "@/lib/server/push";
import { BrokerError, broker, brokerConfigured, brokerMode, type BrokerPosition, type OrderRequest } from "@/lib/server/broker";
import { ASSETS, ASSET_BY_SLUG, MARKETS, PLANS, PLAN_BY_CODE, SCENARIO_CAGR } from "./catalogue";
import { MIN_BARS, pulse, recentVerdicts, signalChanges, signalHistory, type SignalChange } from "./indicators";
import { check as checkFormula, evaluate as evalFormula, holdsNow, signalBars } from "../indicators/formula";
import { backtest } from "../indicators/backtest";
import { effectiveSource, ensure, ensureCrosscheck } from "./marketdata";
import { SOURCE_LABEL, type SourceName } from "./sources/map";
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
  const top = topSignals(live);
  const scored = await trackRecord();
  const n = scored.reduce((s, r) => s + r.n, 0);
  const hitRate = n ? scored.reduce((s, r) => s + r.hit_rate * r.n, 0) / n : null;
  return {
    cards, strongest, top, runAt: runAt(),
    counts: {
      live: live.length,
      bullish: live.filter((r) => r.signal === "buy" || r.signal === "strong_buy").length,
      bearish: live.filter((r) => r.signal === "sell" || r.signal === "strong_sell").length,
    },
    record: { scored: n, hitRate },
  };
}

// ---------------------------------------------------------------- top signals

export type TopSignal = {
  row: ForecastRow; side: "buy" | "sell";
  /** -1 to 1, signed: the weighted blend of the three reads below. */
  score: number; strength: "Very strong" | "Strong" | "Moderate";
  daily: { agree: number; heldBars: number }; hourly: { agree: number; against: number } | null;
  pSide: number; range7d: { low: number; high: number }; aligned: boolean;
};
const WEIGHTS = { daily: 0.45, hourly: 0.25, forecast: 0.3 } as const;

/** Ranks the live assets by three independent reads that must point the same way to rank high: the daily chart's
 *  20 indicators, the hourly chart's 20, and the 7-day forecast's chance of a move. Stale prices are left out. */
function topSignals(live: ForecastRow[], n = 5) {
  const scored: TopSignal[] = [];
  for (const r of live) {
    const slug = r.asset.slug, q = quote(slug);
    if (q.status === "stale" || r.pUp === undefined) continue;
    const d = pulse("1d", closedBars(slug, "1d"));
    if (d.verdict === "unavailable") continue;
    const h = pulse("1h", closedBars(slug, "1h"));
    const net = (p: typeof d) => (p.ma.buy + p.osc.buy - p.ma.sell - p.osc.sell) / 20;
    const sd = net(d), sh = h.verdict === "unavailable" ? 0 : net(h), f = (r.pUp - 0.5) * 2;
    const score = WEIGHTS.daily * sd + WEIGHTS.hourly * sh + WEIGHTS.forecast * f;
    const side = score > 0 ? "buy" : "sell", dir = side === "buy" ? 1 : -1;
    // A real candidate needs the daily chart and the forecast on its side; the hourly chart can only add or subtract.
    if (Math.abs(score) < 0.15 || sd * dir <= 0 || f * dir <= 0) continue;
    const v = recentVerdicts("1d", closedBars(slug, "1d"), 8);
    let held = 0;
    while (held < v.length && v[v.length - 1 - held] === d.verdict) held++;
    const p7 = shortTerm(slug).points.find((x) => x.horizon === "7d")!;
    const agree = (p: typeof d) => (dir === 1 ? p.ma.buy + p.osc.buy : p.ma.sell + p.osc.sell);
    const against = (p: typeof d) => (dir === 1 ? p.ma.sell + p.osc.sell : p.ma.buy + p.osc.buy);
    scored.push({
      row: r, side, score, strength: Math.abs(score) >= 0.5 ? "Very strong" : Math.abs(score) >= 0.3 ? "Strong" : "Moderate",
      daily: { agree: agree(d), heldBars: held }, hourly: h.verdict === "unavailable" ? null : { agree: agree(h), against: against(h) },
      pSide: dir === 1 ? r.pUp : 1 - r.pUp, range7d: { low: p7.low, high: p7.high }, aligned: sh * dir > 0,
    });
  }
  const pick = (side: "buy" | "sell") => scored.filter((x) => x.side === side).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, n);
  return { buys: pick("buy"), sells: pick("sell"), scanned: live.length };
}

/** The home page's top signals for the scheduled job, which has no signed-in viewer: every market, live assets only. */
export async function scanTopSignals() {
  const v: Viewer = { user: null, plan: PLAN_BY_CODE.get("unlimited")!, subscription: null };
  await load(v, ASSETS);
  const live = ASSETS.map((a) => row(v, a)).filter((r) => !r.locked && !r.demo);
  return topSignals(live);
}

/** One line on why an entry is in the list, for its notification. */
export function topWhy(t: TopSignal) {
  const word = t.side === "buy" ? "buy" : "sell";
  return `Daily ${t.daily.agree}/20 ${word}${t.hourly ? (t.aligned ? `, hourly ${t.hourly.agree}/20 ${word}` : ", hourly disagrees") : ""}, ` +
    `7 days ${Math.round(t.pSide * 100)}% ${t.side === "buy" ? "up" : "down"}.`;
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
  const r = await sendPush(u.id, { title: "FXDEZ", body: "Notifications are on. Alerts you set will arrive here.", url: "/alerts", tag: "test" })
    .catch((e) => {
      // Owner-only app: show the push service's reply, it's the only way to tell a key problem from a stale device.
      const why = String(e instanceof Error ? e.message : e).replace(/^push failed on every device: /, "").slice(0, 200);
      throw new DataError("invalid", `The push service didn't accept the test: ${why}`);
    });
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

// ---------------------------------------------------------------- notification controls (F6)

export type DeliverySettings = { mutedUntil: string | null; quiet: { start: number; end: number } | null; emailMode: "instant" | "digest"; digestHour: number; topSignalPush: boolean };
export type DeliveryPatch = { muteFor?: "off" | "1h" | "8h" | "24h" | "indefinitely"; quiet?: { start: number; end: number } | null; emailMode?: "instant" | "digest"; digestHour?: number; topSignalPush?: boolean };
const FOREVER = new Date("9999-01-01T00:00:00Z"); // "until I turn it back on"
const MUTE_MS = { "1h": 3_600_000, "8h": 8 * 3_600_000, "24h": 24 * 3_600_000 } as const;

export async function deliverySettings(v: Viewer): Promise<DeliverySettings> {
  const u = requireUser(v);
  const [r] = await sql()<{ alerts_muted_until: Date | null; quiet_start: number | null; quiet_end: number | null; email_mode: "instant" | "digest"; digest_hour: number; top_signal_push: boolean }[]>`
    select alerts_muted_until, quiet_start, quiet_end, email_mode, digest_hour, top_signal_push from users where id = ${u.id}`;
  const muted = r.alerts_muted_until && r.alerts_muted_until > new Date() ? r.alerts_muted_until : null;
  return { mutedUntil: muted ? (muted >= FOREVER ? "indefinitely" : muted.toISOString()) : null,
    quiet: r.quiet_start === null || r.quiet_end === null ? null : { start: r.quiet_start, end: r.quiet_end }, emailMode: r.email_mode, digestHour: r.digest_hour,
    topSignalPush: r.top_signal_push };
}

export async function updateDeliverySettings(v: Viewer, p: DeliveryPatch): Promise<DeliverySettings> {
  const u = requireUser(v);
  const db = sql();
  if (p.muteFor) {
    const until = p.muteFor === "off" ? null : p.muteFor === "indefinitely" ? FOREVER : new Date(Date.now() + MUTE_MS[p.muteFor]);
    await db`update users set alerts_muted_until = ${until} where id = ${u.id}`;
  }
  if (p.quiet !== undefined) {
    if (p.quiet && p.quiet.start === p.quiet.end) throw new DataError("invalid", "Quiet hours need different start and end times");
    await db`update users set quiet_start = ${p.quiet?.start ?? null}, quiet_end = ${p.quiet?.end ?? null} where id = ${u.id}`;
  }
  if (p.emailMode) {
    await db`update users set email_mode = ${p.emailMode} where id = ${u.id}`;
    // Switching back to one email per alert sends what was waiting for the summary on the next run.
    if (p.emailMode === "instant") await db`update alert_events set email_status = 'pending' where user_id = ${u.id} and email_status = 'digest'`;
  }
  if (p.digestHour !== undefined) await db`update users set digest_hour = ${p.digestHour} where id = ${u.id}`;
  if (p.topSignalPush !== undefined) await db`update users set top_signal_push = ${p.topSignalPush} where id = ${u.id}`;
  return deliverySettings(v);
}

/** The alert behind a stop link, without signing in: the token is the only key, so it is long and random. */
export async function alertByStopToken(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const [r] = await sql()<(AlertRow & { asset_name: string })[]>`
    select al.*, a.slug, a.name as asset_name, ui.name as indicator_name from alerts al join assets a on a.id = al.asset_id
    left join user_indicators ui on ui.id = al.indicator_id where al.stop_token = ${token}`;
  return r ? { alert: toAlert(r), assetName: r.asset_name } : null;
}

/** Pauses the alert behind a stop link. It can be resumed from the Alerts page. */
export async function stopAlertByToken(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new DataError("not_found", "This stop link isn't valid");
  const r = await sql()`update alerts set is_active = false, updated_at = now() where stop_token = ${token} returning 1`;
  if (!r.length) throw new DataError("not_found", "This stop link isn't valid");
  return { stopped: true };
}

// ---------------------------------------------------------------- forecast ledger (F1)

export type LedgerQuery = { asset?: string; horizon?: Horizon; status?: "all" | "scored" | "pending" | "hits" | "misses"; page?: number };
export type LedgerRow = {
  id: string; slug: string; horizon: Horizon; generatedAt: string; targetAt: string; base: number; low: number; mid: number; high: number;
  pUp: number; signal: Signal;
  outcome: null | { realized: number; realizedAt: string; directionHit: boolean; inside: boolean; errPct: number };
};
export const LEDGER_PAGE = 50;

/** Every published forecast of the live model, newest first, hits and misses alike. Rates only, never summed
 *  returns: adding percentage moves across different assets means nothing. */
export async function forecastLedger(v: Viewer, q: LedgerQuery) {
  requireUser(v);
  const db = sql();
  const page = Math.max(1, Math.min(q.page ?? 1, 10_000));
  const asset = q.asset ? requireAsset(q.asset) : null;
  const where = db`r.model_version = ${MODELS.live} and r.status = 'published'
    ${asset ? db`and a.slug = ${asset.slug}` : db``}
    ${q.horizon ? db`and f.horizon = ${q.horizon}` : db``}
    ${q.status === "scored" ? db`and o.forecast_id is not null` : q.status === "pending" ? db`and o.forecast_id is null`
      : q.status === "hits" ? db`and o.direction_hit` : q.status === "misses" ? db`and not o.direction_hit` : db``}`;
  const from = db`forecasts f join forecast_runs r on r.id = f.run_id join assets a on a.id = f.asset_id
    left join forecast_outcomes o on o.forecast_id = f.id`;
  const [rows, [sum]] = await Promise.all([
    db<{ id: string; slug: string; horizon: Horizon; generated_at: Date; target_at: Date; base_price: number; low: number; mid: number; high: number;
      p_up: number; signal: Signal; realized_price: number | null; realized_at: Date | null; direction_hit: boolean | null; inside_band: boolean | null; abs_pct_error: number | null }[]>`
      select f.id, a.slug, f.horizon, f.generated_at, f.target_at, f.base_price, f.low, f.mid, f.high, f.p_up, f.signal,
        o.realized_price, o.realized_at, o.direction_hit, o.inside_band, o.abs_pct_error
      from ${from} where ${where} order by f.generated_at desc, a.slug, f.horizon limit ${LEDGER_PAGE} offset ${(page - 1) * LEDGER_PAGE}`,
    db<{ total: number; scored: number; hits: number; inside: number }[]>`
      select count(*)::int as total, count(o.forecast_id)::int as scored,
        count(*) filter (where o.direction_hit)::int as hits, count(*) filter (where o.inside_band)::int as inside
      from ${from} where ${where}`,
  ]);
  return {
    page, pages: Math.max(1, Math.ceil(sum.total / LEDGER_PAGE)), total: sum.total, scored: sum.scored, hits: sum.hits, inside: sum.inside,
    rows: rows.map((r): LedgerRow => ({ id: r.id, slug: r.slug, horizon: r.horizon, generatedAt: r.generated_at.toISOString(), targetAt: r.target_at.toISOString(),
      base: r.base_price, low: r.low, mid: r.mid, high: r.high, pUp: r.p_up, signal: r.signal,
      outcome: r.realized_price === null ? null : { realized: r.realized_price, realizedAt: r.realized_at!.toISOString(), directionHit: !!r.direction_hit,
        inside: !!r.inside_band, errPct: r.abs_pct_error! } })),
  };
}

// ---------------------------------------------------------------- signal history (F2)

export type SignalSideStats = { n: number; scored: number; right: number; medianAfter7d: number | null; medianWorst7d: number | null };
const HISTORY_TFS = [["1h", 400], ["1d", 366]] as const; // the closed bars looked at; the first ~210 only warm the indicators up
const historyMemo = new Map<string, { last: number; changes: SignalChange[] }>();
const med = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Each past change of an asset's indicator reading, on the hourly and daily charts, with what happened next. */
export async function assetSignalHistory(v: Viewer, slug: string) {
  const a = await loadAsset(slug, ["1h", "1d"]);
  if (!canSee(v, a)) throw new DataError("forbidden", `Signals for ${a.name} are on the ${planFor(a).name} plan`);
  return HISTORY_TFS.map(([tf, lookback]) => {
    const b = closedBars(slug, tf);
    const key = `${slug}:${tf}`, last = b.at(-1)?.ts ?? 0;
    let hit = historyMemo.get(key);
    if (!hit || hit.last !== last) { hit = { last, changes: b.length ? signalChanges(tf, b, lookback) : [] }; historyMemo.set(key, hit); }
    const stats = (dir: 1 | -1): SignalSideStats => {
      const c = hit!.changes.filter((x) => (dir === 1 ? x.verdict === "buy" || x.verdict === "strong_buy" : x.verdict === "sell" || x.verdict === "strong_sell"));
      const done = c.filter((x) => x.after7d !== null);
      return { n: c.length, scored: done.length, right: done.filter((x) => x.after7d! > 0).length,
        medianAfter7d: med(done.map((x) => x.after7d!)), medianWorst7d: med(done.filter((x) => x.worst7d !== null).map((x) => x.worst7d!)) };
    };
    // The first bar with a reading: the window start, or later where there isn't enough history to warm up.
    const first = Math.max(b.length - lookback, MIN_BARS - 1);
    return { timeframe: tf as Timeframe, since: first < b.length ? new Date(b[first].ts).toISOString() : null,
      changes: hit.changes, buy: stats(1), sell: stats(-1) };
  });
}

// ---------------------------------------------------------------- glance (home-screen view)

/** One screen to check at a glance: the watchlist (or one asset per market while it's empty) with the last day's
 *  hourly closes, and the latest alerts. */
export async function glance(v: Viewer) {
  const u = requireUser(v);
  const mine = (await watchlistSlugs(v)).map((s) => getAsset(s)).filter((a): a is Asset => !!a);
  const assets = mine.length ? mine : MARKETS.map((m) => ASSET_BY_SLUG.get(HEADLINE[m.code])!).filter(Boolean);
  await load(v, assets);
  await ensure(assets.map((a) => a.slug), ["1h"]);
  const rows = assets.map((a) => {
    const r = row(v, a);
    return { ...r, spark: r.locked ? [] : closedBars(a.slug, "1h").slice(-24).map((b) => b.c) };
  });
  return { fromWatchlist: mine.length > 0, rows, alerts: (await alertEvents(v, 3)), at: new Date().toISOString(), tz: u.timezone };
}

// ---------------------------------------------------------------- indicator screener

export type ScreenRow = {
  slug: string; name: string; ticker: string; market: MarketCode; price: number; unit: string;
  buyNow: boolean; sellNow: boolean;
  last: null | { side: "buy" | "sell"; at: string; barsAgo: number };
  /** Over the test window: signals, share right 5 bars later, and the same share from any bar (the bar to beat). */
  buy: null | { signals: number; scored: number; right: number; anyBar: number };
  sell: null | { signals: number; scored: number; right: number; anyBar: number };
  error?: string;
};
const SCREEN_WINDOW: Record<"1d" | "1h", number> = { "1d": 365, "1h": 400 };

/** Runs one of your indicators on every asset you can see: where its rule holds now, its latest signal, and how
 *  its past signals did on that asset (in-sample, before costs). */
export async function screenIndicator(v: Viewer, id: string, tf: "1d" | "1h") {
  const ind = await getIndicator(v, id);
  const assets = await visibleWithData(v);
  await ensure(assets.map((a) => a.slug), [tf]);
  const STEP = tf === "1d" ? 86_400_000 : 3_600_000;
  const rows: ScreenRow[] = assets.map((a) => {
    const b = closedBars(a.slug, tf);
    const base = { slug: a.slug, name: a.name, ticker: a.ticker, market: a.market, price: quote(a.slug).price, unit: a.quoteUnit, buyNow: false, sellNow: false, last: null, buy: null, sell: null };
    if (b.length < 30) return { ...base, error: "Not enough bars on this chart" };
    try {
      const buyS = ind.buyRule ? evalFormula(ind.buyRule, b) : null, sellS = ind.sellRule ? evalFormula(ind.sellRule, b) : null;
      const from = Math.max(0, b.length - SCREEN_WINDOW[tf]);
      const bt = backtest(b, { buy: ind.buyRule, sell: ind.sellRule }, from);
      const lastOf = (s: (number | null)[] | null) => (s ? signalBars(s).at(-1) ?? -1 : -1);
      const lb = lastOf(buyS), ls = lastOf(sellS), li = Math.max(lb, ls);
      const side = (st: typeof bt.buy, dir: 1 | -1) => st && { signals: st.signals, scored: st.after[1].n, right: st.after[1].right,
        anyBar: dir === 1 ? bt.base[1].up : 1 - bt.base[1].up };
      return { ...base, buyNow: !!buyS && holdsNow(buyS), sellNow: !!sellS && holdsNow(sellS),
        last: li < 0 ? null : { side: li === lb ? "buy" : "sell", at: new Date(b[li].ts + STEP).toISOString(), barsAgo: b.length - 1 - li },
        buy: side(bt.buy, 1), sell: side(bt.sell, -1) };
    } catch {
      return { ...base, error: "The formula couldn't run here" };
    }
  });
  // Firing now first, then the rule's best record (buy edge over any bar, needing a few signals to count).
  const edge = (r: ScreenRow) => (r.buy && r.buy.scored >= 3 ? r.buy.right - r.buy.anyBar : -1);
  rows.sort((x, y) => +(y.buyNow || y.sellNow) - +(x.buyNow || x.sellNow) || edge(y) - edge(x) || x.name.localeCompare(y.name));
  return { indicator: ind, timeframe: tf, rows };
}

// ---------------------------------------------------------------- portfolio

export type HoldingInput = { assetSlug: string; quantity: number; costPrice?: number | null; boughtOn?: string | null; note?: string | null };
export type Lot = { id: string; quantity: number; costPrice: number | null; boughtOn: string | null; note: string | null };
export type Position = {
  asset: Asset; lots: Lot[]; quantity: number; price: number; value: number; change24hValue: number; change24hPct: number;
  /** Over the lots with a purchase price; `costCovered` is the share of the quantity that has one. */
  cost: number | null; pnl: number | null; pnlPct: number | null; costCovered: number;
  weight: number; signal: Signal | null; pUp: number | null; alerts: number; stale: boolean;
};
const MAX_LOTS = 200;
/** Only assets priced in US dollars can be added up: currency pairs and bond yields have no dollar value per unit. */
export const holdable = (a: Asset) => a.quoteUnit === "USD" || a.quoteUnit === "USD per share";

export async function addHolding(v: Viewer, i: HoldingInput) {
  const u = requireUser(v);
  const a = requireAsset(i.assetSlug);
  if (!holdable(a)) throw new DataError("invalid", `${a.name} isn't priced in dollars, so it can't be added up in a portfolio`);
  if (i.boughtOn && Date.parse(i.boughtOn) > Date.now() + 86_400_000) throw new DataError("invalid", "The purchase date is in the future");
  return sql().begin(async (tx) => {
    await tx`select 1 from users where id = ${u.id} for update`;
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from holdings where user_id = ${u.id}`;
    if (n >= MAX_LOTS) throw new DataError("limit", `Up to ${MAX_LOTS} purchases can be tracked`);
    const [r] = await tx<{ id: string }[]>`insert into holdings (user_id, asset_id, quantity, cost_price, bought_on, note)
      select ${u.id}, id, ${i.quantity}, ${i.costPrice ?? null}, ${i.boughtOn ?? null}, ${i.note?.trim() || null} from assets where slug = ${a.slug} returning id`;
    return { id: r.id };
  });
}

export async function deleteHolding(v: Viewer, id: string) {
  const u = requireUser(v);
  const r = await sql()`delete from holdings where id = ${id} and user_id = ${u.id} returning 1`;
  if (!r.length) throw new DataError("not_found", "No such holding");
}

export async function portfolio(v: Viewer) {
  const u = requireUser(v);
  const db = sql();
  const [lots, alertCounts] = await Promise.all([
    db<{ id: string; slug: string; quantity: number; cost_price: number | null; bought_on: Date | null; note: string | null }[]>`
      select h.id, a.slug, h.quantity, h.cost_price, h.bought_on, h.note from holdings h join assets a on a.id = h.asset_id
      where h.user_id = ${u.id} order by h.bought_on nulls last, h.created_at`,
    db<{ slug: string; n: number }[]>`select a.slug, count(*)::int as n from alerts al join assets a on a.id = al.asset_id
      where al.user_id = ${u.id} and al.is_active group by a.slug`,
  ]);
  const assets = [...new Set(lots.map((l) => l.slug))].map((s) => getAsset(s)).filter((a): a is Asset => !!a);
  await load(v, assets);
  const nAlerts = new Map(alertCounts.map((x) => [x.slug, x.n]));
  const positions: Position[] = assets.filter((a) => closedBars(a.slug, "1d").length).map((a) => {
    const mine = lots.filter((l) => l.slug === a.slug);
    const r = row(v, a), q = quote(a.slug);
    const quantity = mine.reduce((t, l) => t + l.quantity, 0), value = quantity * q.price;
    const priced = mine.filter((l) => l.cost_price !== null);
    const pq = priced.reduce((t, l) => t + l.quantity, 0);
    const cost = pq ? priced.reduce((t, l) => t + l.quantity * l.cost_price!, 0) : null;
    const pricedValue = pq * q.price;
    return {
      asset: a, quantity, price: q.price, value,
      change24hPct: q.change24hPct, change24hValue: value - value / (1 + q.change24hPct / 100),
      cost, pnl: cost === null ? null : pricedValue - cost, pnlPct: cost ? (pricedValue / cost - 1) * 100 : null, costCovered: quantity ? pq / quantity : 0,
      weight: 0, signal: r.signal ?? null, pUp: r.pUp ?? null, alerts: nAlerts.get(a.slug) ?? 0, stale: q.status === "stale",
      lots: mine.map((l) => ({ id: l.id, quantity: l.quantity, costPrice: l.cost_price, boughtOn: l.bought_on?.toISOString().slice(0, 10) ?? null, note: l.note })),
    };
  });
  const total = positions.reduce((t, x) => t + x.value, 0);
  for (const x of positions) x.weight = total ? x.value / total : 0;
  positions.sort((x, y) => y.value - x.value);
  const cost = positions.reduce((t, x) => t + (x.cost ?? 0), 0), pricedValue = positions.reduce((t, x) => t + x.price * x.quantity * x.costCovered, 0);
  const change24h = positions.reduce((t, x) => t + x.change24hValue, 0);
  // The long-term scenario rates for each holding's market, applied to its value today.
  const scenario = (n: number) => {
    const at = (k: 0 | 1 | 2) => positions.reduce((t, x) => t + x.value * (1 + SCENARIO_CAGR[x.asset.market][k]) ** n, 0);
    return { years: n, bear: at(0), base: at(1), bull: at(2) };
  };
  return {
    positions, total, cost: cost || null, pnl: cost ? pricedValue - cost : null, pnlPct: cost ? (pricedValue / cost - 1) * 100 : null,
    change24h, change24hPct: total - change24h ? (change24h / (total - change24h)) * 100 : 0,
    scenarios: [scenario(1), scenario(5)],
    holdableAssets: ASSETS.filter(holdable).map((a) => ({ slug: a.slug, name: a.name, ticker: a.ticker, unit: a.meta.proxy ? `${a.meta.proxy} shares` : a.market === "crypto" ? a.ticker : "shares" })),
  };
}

// ---------------------------------------------------------------- data health

/** For the status page: each price source's last refresh, open and recent problems, and the latest scheduled runs. */
export async function dataStatus(v: Viewer) {
  requireUser(v);
  const db = sql();
  const [fetches, incidents, runs] = await Promise.all([
    db<{ slug: string; at: Date }[]>`select a.slug, max(bf.fetched_at) as at from bar_fetches bf join assets a on a.id = bf.asset_id group by a.slug`,
    db<{ id: string; key: string; detail: string; started_at: Date; resolved_at: Date | null }[]>`
      select id, key, detail, started_at, resolved_at from health_incidents order by started_at desc limit 20`,
    db<{ job: string; started_at: Date; finished_at: Date | null; status: string }[]>`
      select job, started_at, finished_at, status from job_runs order by started_at desc limit 12`,
  ]);
  const last = new Map(fetches.map((f) => [f.slug, f.at]));
  const groups = new Map<SourceName, string[]>();
  for (const a of ASSETS) { const s = effectiveSource(a.slug); groups.set(s, [...(groups.get(s) ?? []), a.slug]); }
  const sources = [...groups].filter(([s]) => s !== "demo").map(([s, slugs]) => {
    const times = slugs.map((x) => last.get(x)?.getTime() ?? 0).filter(Boolean);
    return { source: s, label: SOURCE_LABEL[s], assets: slugs.length, lastRefresh: times.length ? new Date(Math.max(...times)).toISOString() : null,
      open: incidents.find((i) => i.key === `source:${s}` && !i.resolved_at)?.detail ?? null };
  });
  return {
    sources, demoAssets: groups.get("demo")?.length ?? 0,
    scheduler: incidents.find((i) => i.key === "scheduler" && !i.resolved_at)?.detail ?? null,
    incidents: incidents.map((i) => ({ id: i.id, key: i.key, detail: i.detail, startedAt: i.started_at.toISOString(), resolvedAt: i.resolved_at?.toISOString() ?? null })),
    runs: runs.map((r) => ({ job: r.job, startedAt: r.started_at.toISOString(), seconds: r.finished_at ? (r.finished_at.getTime() - r.started_at.getTime()) / 1000 : null, status: r.status })),
  };
}

// ---------------------------------------------------------------- trading (Alpaca)

/** The broker's symbol for an asset: crypto as BTC/USD, stocks and funds by ticker (stand-ins by their fund). */
export function tradeSymbol(a: Asset): string | null {
  if (a.market === "crypto") return `${a.ticker}/USD`;
  if (a.meta.proxy) return a.meta.proxy;
  if (a.market === "stocks" || a.market === "etfs") return a.ticker;
  return null; // currency pairs, bond yields, and indices without a fund aren't traded at Alpaca
}
const posKey = (sym: string) => sym.replace("/", "");
const bySymbol = () => new Map(ASSETS.map((a) => [tradeSymbol(a), a] as const).filter(([s]) => s).map(([s, a]) => [posKey(s!), a]));
const num = (x: string | null | undefined) => (x === null || x === undefined || x === "" ? null : Number(x));
/** Broker failures reach the screen as plain messages, never as a server error. */
async function viaBroker<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e) {
    if (e instanceof BrokerError) throw new DataError(e.status === 404 ? "not_found" : "invalid", e.message);
    throw new DataError("invalid", `Couldn't reach Alpaca: ${e instanceof Error ? e.message : e}`);
  }
}

export async function tradingOverview(v: Viewer) {
  const u = requireUser(v);
  const [[limits], log] = await Promise.all([
    sql()<{ max_order_usd: number }[]>`select max_order_usd from users where id = ${u.id}`,
    sql()<{ created_at: Date; slug: string; side: string; notional: number | null; qty: number | null; status: string; error: string | null }[]>`
      select created_at, slug, side, notional, qty, status, error from trade_log where user_id = ${u.id} order by created_at desc limit 10`,
  ]);
  const base = { configured: brokerConfigured(), mode: brokerMode(), maxOrderUsd: limits.max_order_usd,
    log: log.map((l) => ({ at: l.created_at.toISOString(), slug: l.slug, side: l.side, notional: l.notional, qty: l.qty, status: l.status, error: l.error })) };
  if (!base.configured) return { ...base, account: null, positions: [], open: [], recent: [], marketOpen: null };
  const [account, positions, open, recent, clock] = await viaBroker(() => Promise.all([
    broker.account(), broker.positions(), broker.orders("open", 50), broker.orders("all", 15), broker.clock()]));
  const map = bySymbol();
  const order = (o: (typeof open)[number]) => ({ id: o.id, symbol: o.symbol, slug: map.get(posKey(o.symbol))?.slug ?? null, side: o.side, type: o.type,
    orderClass: o.order_class, qty: num(o.qty), notional: num(o.notional), filledQty: num(o.filled_qty), filledPrice: num(o.filled_avg_price),
    limitPrice: num(o.limit_price), status: o.status, submittedAt: o.submitted_at });
  return {
    ...base,
    account: { status: account.status, cash: Number(account.cash), buyingPower: Number(account.buying_power), equity: Number(account.equity),
      dayChange: Number(account.equity) - Number(account.last_equity), blocked: account.trading_blocked || account.account_blocked },
    positions: positions.map((x: BrokerPosition) => ({ symbol: x.symbol, slug: map.get(posKey(x.symbol))?.slug ?? null, name: map.get(posKey(x.symbol))?.name ?? x.symbol,
      qty: Number(x.qty), avgPrice: Number(x.avg_entry_price), price: Number(x.current_price), value: Number(x.market_value),
      pnl: Number(x.unrealized_pl), pnlPct: Number(x.unrealized_plpc) * 100 })),
    open: open.map(order), recent: recent.map(order), marketOpen: clock.is_open,
  };
}

/** What the order ticket on an asset page needs: whether Alpaca trades it, the price, what's held and the limit. */
export async function tradeTicket(v: Viewer, slug: string) {
  const u = requireUser(v);
  const a = await loadAsset(slug, ["5m", "1d"]);
  const symbol = tradeSymbol(a), mode = brokerMode();
  const [{ max_order_usd }] = await sql()<{ max_order_usd: number }[]>`select max_order_usd from users where id = ${u.id}`;
  const none = (reason: string) => ({ tradable: false as const, reason, mode });
  if (!brokerConfigured()) return none("Trading isn't set up: add your Alpaca keys in the host's settings.");
  if (!symbol) return none(`${a.name} isn't traded through Alpaca. Currency pairs, bond yields and indices without a stand-in fund aren't available there.`);
  const asset = await viaBroker(() => broker.asset(symbol)).catch((e) => { if (e instanceof DataError && e.code === "not_found") return null; throw e; });
  if (!asset || !asset.tradable) return none(`Alpaca doesn't offer ${symbol} for trading.`);
  const [positions, clock] = await viaBroker(() => Promise.all([broker.positions(), broker.clock()]));
  const held = positions.find((x) => posKey(x.symbol) === posKey(symbol));
  const crypto = asset.class === "crypto";
  return {
    tradable: true as const, mode, symbol, name: a.name, crypto, fractionable: crypto || asset.fractionable,
    price: quote(slug).price, held: held ? Number(held.qty) : 0, maxOrderUsd: max_order_usd,
    // Alpaca: stop-loss and take-profit legs (bracket orders) are for stocks and funds, in whole shares.
    brackets: !crypto, marketOpen: crypto ? true : clock.is_open,
  };
}

export type TradeInput = { slug: string; side: "buy" | "sell"; type: "market" | "limit"; amountUsd?: number | null; qty?: number | null;
  limitPrice?: number | null; stopLoss?: number | null; takeProfit?: number | null; clientOrderId: string };

const round = (x: number, dp: number) => Math.floor(x * 10 ** dp) / 10 ** dp;

/** Checks an order against the ticket and the owner's limit, then sends it. Every attempt is logged. */
export async function placeTrade(v: Viewer, i: TradeInput) {
  const u = requireUser(v);
  const db = sql();
  const [dup] = await db<{ status: string; broker_order_id: string | null; error: string | null }[]>`
    select status, broker_order_id, error from trade_log where client_order_id = ${i.clientOrderId} and user_id = ${u.id}`;
  if (dup) return { duplicate: true, status: dup.status, orderId: dup.broker_order_id, error: dup.error }; // the same tap sent twice
  const t = await tradeTicket(v, i.slug);
  if (!t.tradable) throw new DataError("invalid", t.reason);
  const ref = i.type === "limit" ? i.limitPrice ?? 0 : t.price;
  if (i.type === "limit") {
    if (!(ref > 0)) throw new DataError("invalid", "Enter a limit price above 0");
    if (Math.abs(ref / t.price - 1) > 0.2) throw new DataError("invalid", `The limit price is more than 20% from the current price of ${t.price.toPrecision(6)}. Check for a typo.`);
  }
  const dp = t.crypto ? 8 : t.fractionable ? 6 : 0;
  const o: OrderRequest = { symbol: t.symbol, side: i.side, type: i.type, time_in_force: t.crypto ? "gtc" : "day", client_order_id: i.clientOrderId,
    ...(i.type === "limit" ? { limit_price: String(ref) } : {}) };
  let notional: number | null = null, qty: number | null = null;
  const wantsBracket = !!(i.stopLoss || i.takeProfit);
  if (i.side === "buy") {
    const amount = i.amountUsd ?? 0;
    if (!(amount >= 1)) throw new DataError("invalid", "Enter an amount of at least $1");
    if (amount > t.maxOrderUsd) throw new DataError("invalid", `That's above your limit of $${t.maxOrderUsd.toLocaleString("en-US")} per order. Change it on the Trade page.`);
    if (wantsBracket) {
      if (!t.brackets) throw new DataError("invalid", "Alpaca doesn't take stop-loss or take-profit on crypto orders. Place the buy, then a separate sell later.");
      if (i.stopLoss && !(i.stopLoss < ref)) throw new DataError("invalid", "The stop-loss must be below the buy price");
      if (i.takeProfit && !(i.takeProfit > ref)) throw new DataError("invalid", "The take-profit must be above the buy price");
      qty = Math.floor(amount / ref);
      if (qty < 1) throw new DataError("invalid", `With a stop-loss or take-profit Alpaca needs whole shares: $${amount} doesn't buy one at ${ref.toFixed(2)}.`);
      Object.assign(o, { qty: String(qty), order_class: "bracket" as const,
        ...(i.takeProfit ? { take_profit: { limit_price: String(i.takeProfit) } } : {}), ...(i.stopLoss ? { stop_loss: { stop_price: String(i.stopLoss) } } : {}) });
    } else if (i.type === "market" && t.fractionable) {
      notional = round(amount, 2); o.notional = String(notional); // Alpaca buys this many dollars' worth
    } else {
      qty = round(amount / ref, dp);
      if (!(qty > 0)) throw new DataError("invalid", `$${amount} doesn't buy a whole share at ${ref.toFixed(2)}`);
      o.qty = String(qty);
    }
  } else {
    // Sells close or reduce what's held: the app never sells short.
    if (wantsBracket) throw new DataError("invalid", "Stop-loss and take-profit go with a buy");
    qty = round(i.qty ?? 0, dp);
    if (!(qty > 0)) throw new DataError("invalid", "Enter how much to sell");
    if (qty > t.held + 1e-9) throw new DataError("invalid", t.held ? `You hold ${t.held}; you can't sell more than that` : `You don't hold any ${t.name} to sell`);
    o.qty = String(qty);
  }
  const claimed = await db`insert into trade_log (user_id, client_order_id, mode, slug, symbol, side, order_type, notional, qty, limit_price, stop_loss, take_profit, status)
    values (${u.id}, ${i.clientOrderId}, ${t.mode}, ${i.slug}, ${t.symbol}, ${i.side}, ${i.type}, ${notional}, ${qty}, ${i.type === "limit" ? ref : null},
      ${i.stopLoss ?? null}, ${i.takeProfit ?? null}, 'sending')
    on conflict (client_order_id) do nothing returning id`;
  // Two copies of one tap arriving together: the first claims the id, the other reports it as a repeat.
  if (!claimed.length) return { duplicate: true, status: "sending", orderId: null, error: null };
  try {
    const r = await broker.place(o);
    await db`update trade_log set broker_order_id = ${r.id}, status = ${r.status} where client_order_id = ${i.clientOrderId}`;
    return { duplicate: false, status: r.status, orderId: r.id, error: null, mode: t.mode };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db`update trade_log set status = 'rejected', error = ${msg.slice(0, 300)} where client_order_id = ${i.clientOrderId}`;
    throw new DataError("invalid", msg);
  }
}

export async function cancelTrade(v: Viewer, orderId: string) {
  requireUser(v);
  await viaBroker(() => broker.cancel(orderId));
}

/** Sells the whole position at market. */
export async function closeTradePosition(v: Viewer, symbol: string) {
  requireUser(v);
  if (!/^[A-Z0-9./]{1,15}$/.test(symbol)) throw new DataError("invalid", "Not a symbol");
  const r = await viaBroker(() => broker.close(symbol));
  return { orderId: r.id, status: r.status };
}

export async function setMaxOrder(v: Viewer, usd: number) {
  const u = requireUser(v);
  await sql()`update users set max_order_usd = ${usd} where id = ${u.id}`;
  return { maxOrderUsd: usd };
}
