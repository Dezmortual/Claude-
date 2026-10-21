// The fake data layer: demo series + baseline model + JSON-file users. Every function here is part of
// the contract /replica-backend implements on Supabase; screens and API routes only import from ./index.
import crypto from "node:crypto";
import { ASSETS, ASSET_BY_SLUG, MARKETS, PLANS, PLAN_BY_CODE } from "./catalogue";
import { pulse } from "./indicators";
import { closedBars, metrics, paths, quote, scenarios, shortTerm } from "./model";
import { db, save, type StoredUser } from "./store";
import {
  DataError, type Alert, type AlertCondition, type Asset, type Bar, type ForecastPage, type ForecastQuery, type ForecastRow,
  type Horizon, type Market, type MarketCode, type Mover, type Plan, type PlanCode, type Signal, type Subscription, type TablePrefs,
  type Timeframe, type User, type Viewer,
} from "./types";

const PULSE_TFS: Timeframe[] = ["5m", "30m", "1h", "1d", "1w"];
const SESSION_DAYS = 30;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------- entitlements

export function canSee(v: Viewer, a: Asset) {
  return v.plan.markets.includes(a.market) && (!v.plan.publicOnly || a.isPublic);
}

/** Which plan unlocks this asset for this viewer (for paywall copy). */
export function planFor(a: Asset): Plan {
  return PLANS.find((p) => p.markets.includes(a.market) && (!p.publicOnly || a.isPublic))!;
}

export function runAt(): string {
  const d = new Date();
  d.setUTCMinutes(7, 0, 0);
  if (d.getTime() > Date.now()) d.setUTCHours(d.getUTCHours() - 1);
  return d.toISOString();
}

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

// ---------------------------------------------------------------- forecast table

function row(v: Viewer, a: Asset): ForecastRow {
  if (!canSee(v, a)) return { asset: a, locked: true };
  const qt = quote(a.slug);
  const { points } = shortTerm(a.slug);
  const m = metrics(a.slug);
  const h7 = points.find((p) => p.horizon === "7d")!;
  const intraday: ForecastRow["intraday"] = {};
  for (const tf of ["5m", "30m", "1h"] as const) intraday[tf] = pulse(tf, closedBars(a.slug, tf)).verdict;
  return {
    asset: a, locked: false, price: qt.price, change24hPct: qt.change24hPct,
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

export function listForecasts(v: Viewer, q: ForecastQuery): ForecastPage {
  const perPage = [10, 20, 50, 100].includes(q.perPage ?? 0) ? q.perPage! : 20;
  const needle = (q.q ?? "").trim().toLowerCase();
  let rows = ASSETS
    .filter((a) => !q.market || q.market === "all" || a.market === q.market)
    .filter((a) => !needle || a.name.toLowerCase().includes(needle) || a.ticker.toLowerCase().includes(needle) || a.slug.includes(needle))
    .map((a) => row(v, a));
  if (q.signal && q.signal !== "all") rows = rows.filter((r) => !r.locked && r.signal === q.signal);
  if (q.volatility && q.volatility !== "all") rows = rows.filter((r) => !r.locked && r.metrics!.volatilityLabel === q.volatility);
  const key = SORTS[q.sort ?? ""] ?? null;
  const dir = q.dir ? (q.dir === "asc" ? 1 : -1) : q.sort === "asset" ? 1 : -1;
  // Unlocked first, then the chosen sort; locked rows keep catalogue order at the end.
  rows.sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? 1 : -1;
    if (!key || a.locked) return 0;
    const x = key(a), y = key(b);
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, q.page ?? 1), pages);
  return {
    rows: rows.slice((page - 1) * perPage, page * perPage), page, pages, total, runAt: runAt(),
    tabLocked: q.tab === "day_trading" && !v.plan.dayTrading,
  };
}

export function movers(v: Viewer, horizon: Exclude<Horizon, "5y" | "10y">, n = 7): { gainers: Mover[]; losers: Mover[] } {
  const all = ASSETS.filter((a) => canSee(v, a)).map((a) => {
    const p = shortTerm(a.slug).points.find((x) => x.horizon === horizon)!;
    return { asset: a, changePct: p.changePct, price: quote(a.slug).price };
  });
  all.sort((a, b) => b.changePct - a.changePct);
  return { gainers: all.slice(0, n).filter((m) => m.changePct >= 0.005), losers: all.slice(-n).reverse().filter((m) => m.changePct <= -0.005) };
}

export function outlook(v: Viewer, horizon: "1d" | "7d" | "1m") {
  const seen = ASSETS.filter((a) => canSee(v, a));
  const pts = seen.map((a) => ({ a, p: shortTerm(a.slug).points.find((x) => x.horizon === horizon)! }));
  const up = pts.filter((x) => x.p.changePct > 0).length;
  const strongest = pts.reduce<(typeof pts)[number] | null>((best, x) => (!best || Math.abs(x.p.changePct) > Math.abs(best.p.changePct) ? x : best), null);
  return { total: pts.length, up, down: pts.length - up, strongest: strongest && { asset: strongest.a, changePct: strongest.p.changePct } };
}

// ---------------------------------------------------------------- asset page

export function assetSummary(v: Viewer, slug: string) {
  const asset = getAsset(slug);
  if (!asset) throw new DataError("not_found", "No such asset");
  return { asset, quote: quote(slug), metrics: metrics(slug), locked: !canSee(v, asset), unlockPlan: planFor(asset) };
}

const RANGE_DAYS: Record<string, number> = { "1d": 1, "1w": 7, "1m": 31, "3m": 92, "1y": 366, "5y": 1830, all: 1e9 };

export function assetBars(v: Viewer, slug: string, range: string): { tf: Timeframe; bars: Bar[] } {
  const a = getAsset(slug);
  if (!a) throw new DataError("not_found", "No such asset");
  const days = RANGE_DAYS[range] ?? 92;
  const tf: Timeframe = days <= 1 ? "5m" : days <= 7 ? "1h" : days <= 366 ? "1d" : "1w";
  if ((tf === "5m" || tf === "1h") && !canSee(v, a)) throw new DataError("forbidden", "Intraday charts need a plan");
  const b = closedBars(slug, tf);
  const from = Date.now() - days * 86_400_000;
  return { tf, bars: b.filter((x) => x.ts >= from) };
}

export function assetForecast(v: Viewer, slug: string) {
  const a = getAsset(slug);
  if (!a) throw new DataError("not_found", "No such asset");
  if (!canSee(v, a)) throw new DataError("forbidden", `Forecasts for ${a.name} are on the ${planFor(a).name} plan`);
  return { runAt: runAt(), basePrice: quote(slug).price, points: shortTerm(slug).points, paths: paths(slug) };
}

export function assetSignals(v: Viewer, slug: string) {
  const a = getAsset(slug);
  if (!a) throw new DataError("not_found", "No such asset");
  const full = canSee(v, a);
  // Guests on locked assets still see the daily verdict (no indicator detail): a free taste, nothing more.
  return PULSE_TFS.map((tf) => {
    const p = pulse(tf, closedBars(slug, tf));
    if (full) return { ...p, locked: false };
    if (tf === "1d") return { ...p, indicators: [], locked: false };
    return { timeframe: tf, verdict: "unavailable" as const, ma: { buy: 0, neutral: 0, sell: 0 }, osc: { buy: 0, neutral: 0, sell: 0 },
      reason: `On the ${planFor(a).name} plan`, indicators: [], locked: true };
  });
}

export function assetScenarios(slug: string) {
  if (!getAsset(slug)) throw new DataError("not_found", "No such asset");
  return scenarios(slug);
}

// ---------------------------------------------------------------- auth (fake)

function hashPw(pw: string, salt: string) {
  return crypto.scryptSync(pw, salt, 32).toString("hex");
}

function newSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  db().sessions[token] = { userId, expiresAt: Date.now() + SESSION_DAYS * 86_400_000 };
  save();
  return token;
}

const publicUser = ({ passwordHash: _p, salt: _s, ...u }: StoredUser): User => u;

export function signUp(name: string, email: string, password: string): string {
  email = email.trim().toLowerCase();
  if (!name.trim()) throw new DataError("invalid", "Enter your name");
  if (!EMAIL.test(email)) throw new DataError("invalid", "Enter a valid email address");
  if (password.length < 8) throw new DataError("invalid", "Use at least 8 characters for your password");
  if (db().users.some((u) => u.email === email)) throw new DataError("conflict", "An account with this email already exists");
  const salt = crypto.randomBytes(16).toString("hex");
  const user: StoredUser = { id: crypto.randomUUID(), name: name.trim().slice(0, 80), email, createdAt: new Date().toISOString(),
    timezone: "UTC", salt, passwordHash: hashPw(password, salt) };
  db().users.push(user);
  return newSession(user.id);
}

export function signIn(email: string, password: string): string {
  const u = db().users.find((x) => x.email === email.trim().toLowerCase());
  const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(password, u.salt), "hex"), Buffer.from(u.passwordHash, "hex"));
  if (!u || !ok) throw new DataError("unauthorized", "That email and password don't match an account");
  return newSession(u.id);
}

export function signOut(token: string) {
  delete db().sessions[token];
  save();
}

/** Always succeeds, so the form never reveals which emails have accounts. Email sending arrives with the backend. */
export function requestPasswordReset(_email: string) {
  return { ok: true };
}

const GUEST: Viewer = { user: null, plan: PLAN_BY_CODE.get("free")!, subscription: null };

export function getViewer(token: string | undefined): Viewer {
  if (!token) return GUEST;
  const s = db().sessions[token];
  if (!s || s.expiresAt < Date.now()) return GUEST;
  const u = db().users.find((x) => x.id === s.userId);
  if (!u) return GUEST;
  let sub: Subscription | null = db().subscriptions[u.id] ?? null;
  if (sub && new Date(sub.currentPeriodEnd).getTime() < Date.now()) sub = null;
  return { user: publicUser(u), plan: PLAN_BY_CODE.get(sub?.plan ?? "free")!, subscription: sub };
}

function requireUser(v: Viewer): User {
  if (!v.user) throw new DataError("unauthorized", "Sign in first");
  return v.user;
}

export function updateProfile(v: Viewer, patch: { name?: string; timezone?: string }) {
  const u = db().users.find((x) => x.id === requireUser(v).id)!;
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new DataError("invalid", "Enter your name");
    u.name = patch.name.trim().slice(0, 80);
  }
  if (patch.timezone) u.timezone = patch.timezone;
  save();
}

export function deleteAccount(v: Viewer) {
  const id = requireUser(v).id;
  const d = db();
  d.users = d.users.filter((u) => u.id !== id);
  for (const [t, s] of Object.entries(d.sessions)) if (s.userId === id) delete d.sessions[t];
  delete d.subscriptions[id]; delete d.watchlists[id]; delete d.alerts[id]; delete d.prefs[id];
  save();
}

// ---------------------------------------------------------------- billing (fake: no payment is taken)

export function listPlans(): Plan[] {
  return PLANS;
}

export function demoCheckout(v: Viewer, plan: PlanCode, interval: "month" | "year") {
  const u = requireUser(v);
  if (!PLAN_BY_CODE.has(plan) || plan === "free") throw new DataError("invalid", "Pick a paid plan");
  const end = new Date();
  if (interval === "year") end.setUTCFullYear(end.getUTCFullYear() + 1); else end.setUTCMonth(end.getUTCMonth() + 1);
  db().subscriptions[u.id] = { plan, interval, status: "active", currentPeriodEnd: end.toISOString(), cancelAtPeriodEnd: false };
  save();
}

export function cancelSubscription(v: Viewer, resume = false) {
  const u = requireUser(v);
  const s = db().subscriptions[u.id];
  if (!s) throw new DataError("not_found", "No active plan");
  s.cancelAtPeriodEnd = !resume;
  save();
}

// ---------------------------------------------------------------- watchlist

function requireFeature(v: Viewer) {
  requireUser(v);
  if (!v.plan.watchlistAlerts) throw new DataError("limit", "Watchlists and alerts start on the Crypto plan");
}

export function getWatchlist(v: Viewer): ForecastRow[] {
  const u = requireUser(v);
  return (db().watchlists[u.id] ?? []).map((s) => getAsset(s)).filter((a): a is Asset => !!a).map((a) => row(v, a));
}

export function watchlistSlugs(v: Viewer): string[] {
  return v.user ? db().watchlists[v.user.id] ?? [] : [];
}

export function addToWatchlist(v: Viewer, slug: string) {
  requireFeature(v);
  if (!getAsset(slug)) throw new DataError("not_found", "No such asset");
  const list = (db().watchlists[v.user!.id] ??= []);
  if (list.includes(slug)) throw new DataError("conflict", "Already on your watchlist");
  list.push(slug);
  save();
}

export function removeFromWatchlist(v: Viewer, slug: string) {
  const u = requireUser(v);
  db().watchlists[u.id] = (db().watchlists[u.id] ?? []).filter((s) => s !== slug);
  save();
}

// ---------------------------------------------------------------- alerts (stored; delivery arrives with the worker)

export interface AlertInput {
  assetSlug: string; condition: AlertCondition; threshold?: number | null; signal?: Signal | null;
  timeframe?: Timeframe | null; channels?: ("email" | "push")[]; cooldownMinutes?: number;
}

export function listAlerts(v: Viewer): Alert[] {
  return db().alerts[requireUser(v).id] ?? [];
}

function validateAlert(v: Viewer, i: AlertInput) {
  const a = getAsset(i.assetSlug);
  if (!a) throw new DataError("not_found", "No such asset");
  if (!canSee(v, a)) throw new DataError("limit", `Alerts on ${a.name} need the ${planFor(a).name} plan`);
  if (i.condition === "signal_becomes") {
    if (!i.signal || !i.timeframe) throw new DataError("invalid", "Pick a signal and a timeframe");
  } else if (!(typeof i.threshold === "number" && Number.isFinite(i.threshold) && i.threshold > 0)) {
    throw new DataError("invalid", i.condition === "forecast_move_above" ? "Enter a percentage above 0" : "Enter a price above 0");
  }
  const channels = (i.channels ?? ["email"]).filter((c) => c === "email" || c === "push");
  if (!channels.length) throw new DataError("invalid", "Pick at least one way to be told");
  return channels;
}

export function createAlert(v: Viewer, i: AlertInput): Alert {
  requireFeature(v);
  const channels = validateAlert(v, i);
  const list = (db().alerts[v.user!.id] ??= []);
  const active = list.filter((x) => x.isActive).length;
  if (v.plan.maxAlerts !== null && active >= v.plan.maxAlerts) {
    throw new DataError("limit", `Your plan allows ${v.plan.maxAlerts} active alerts`);
  }
  const alert: Alert = {
    id: crypto.randomUUID(), assetSlug: i.assetSlug, condition: i.condition,
    threshold: i.condition === "signal_becomes" ? null : i.threshold!, signal: i.condition === "signal_becomes" ? i.signal! : null,
    timeframe: i.condition === "signal_becomes" ? i.timeframe! : null, channels, isActive: true,
    cooldownMinutes: Math.max(5, i.cooldownMinutes ?? 60), lastFiredAt: null, createdAt: new Date().toISOString(),
  };
  list.unshift(alert);
  save();
  return alert;
}

export function updateAlert(v: Viewer, id: string, patch: Partial<Pick<Alert, "isActive">>) {
  const a = listAlerts(v).find((x) => x.id === id);
  if (!a) throw new DataError("not_found", "No such alert");
  if (patch.isActive && !a.isActive) {
    const active = listAlerts(v).filter((x) => x.isActive).length;
    if (v.plan.maxAlerts !== null && active >= v.plan.maxAlerts) throw new DataError("limit", `Your plan allows ${v.plan.maxAlerts} active alerts`);
  }
  if (patch.isActive !== undefined) a.isActive = patch.isActive;
  save();
  return a;
}

export function deleteAlert(v: Viewer, id: string) {
  const u = requireUser(v);
  db().alerts[u.id] = listAlerts(v).filter((x) => x.id !== id);
  save();
}

// ---------------------------------------------------------------- table preferences

export const DEFAULT_COLUMNS = ["price", "1d", "7d", "1m", "signal", "macd", "maCross", "ma200", "volatility"];
export const ALL_COLUMNS = ["price", "1d", "7d", "1m", "1y", "5y", "10y", "signal", "macd", "maCross", "ma200", "volatility", "sharpe", "dividend"];

export function getPrefs(v: Viewer): TablePrefs {
  const p = v.user ? db().prefs[v.user.id] : undefined;
  return p ?? { visibleColumns: DEFAULT_COLUMNS, rowsPerPage: 20, defaultTab: "investing" };
}

export function setPrefs(v: Viewer, p: TablePrefs) {
  const u = requireUser(v);
  const cols = p.visibleColumns.filter((c) => ALL_COLUMNS.includes(c));
  if (!cols.length) throw new DataError("invalid", "Keep at least one column");
  if (![10, 20, 50, 100].includes(p.rowsPerPage)) throw new DataError("invalid", "Rows per page must be 10, 20, 50 or 100");
  db().prefs[u.id] = { visibleColumns: cols, rowsPerPage: p.rowsPerPage, defaultTab: p.defaultTab === "day_trading" ? "day_trading" : "investing" };
  save();
}

// ---------------------------------------------------------------- live page stats

export function assetStats(slug: string) {
  if (!getAsset(slug)) throw new DataError("not_found", "No such asset");
  const d = closedBars(slug, "1d");
  const b5 = closedBars(slug, "5m").slice(-288);
  const last = quote(slug).price;
  const back = (n: number) => d.at(-1 - n)?.c ?? null;
  const ch = (p: number | null) => (p ? (last / p - 1) * 100 : null);
  const yr = d.slice(-365);
  const month = d.slice(-30);
  const rets = month.map((x, i) => (i ? Math.log(x.c / month[i - 1].c) : 0)).slice(1);
  return {
    day: { lo: Math.min(...b5.map((x) => x.l)), hi: Math.max(...b5.map((x) => x.h)), short: b5.length < 288 },
    week52: { lo: Math.min(...yr.map((x) => x.l)), hi: Math.max(...yr.map((x) => x.h)) },
    change: { "7d": ch(back(7)), "30d": ch(back(30)), "1y": ch(back(365)) },
    upDays30: rets.filter((r) => r > 0).length,
    days30: rets.length,
  };
}

/** Assets a viewer may set alerts on, with the current price for the form's hint. */
export function alertableAssets(v: Viewer) {
  return ASSETS.filter((a) => canSee(v, a)).map((a) => ({ slug: a.slug, name: a.name, ticker: a.ticker, price: quote(a.slug).price }));
}
