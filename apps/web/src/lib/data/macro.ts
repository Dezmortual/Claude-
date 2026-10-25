import "server-only";
// Economic data and prediction markets: a curated set of FRED series (or any FRED code), World Bank country
// comparisons, and Polymarket odds. Each fetch is cached in the database: series for 12 hours, odds for 10 minutes.
import { sql } from "@/lib/server/db";
import { ASSET_BY_SLUG } from "./catalogue";
import { loadAsset, requireUser } from "./live";
import { quote } from "./model";
import { optionSnapshots } from "./sources/options";
import { annual, sharesOutstanding } from "../fundamentals";
import { DataError, type Viewer } from "./types";
import { fredSeries, polymarketTop, worldBank, type Prediction, type Point } from "./sources/macro";

export type MacroDef = { id: string; name: string; group: string; unit: string; freq: "daily" | "weekly" | "monthly" | "quarterly"; about: string; yoy?: boolean };

export const MACRO: MacroDef[] = [
  { id: "CPIAUCSL", name: "US consumer prices (CPI)", group: "Inflation", unit: "index", freq: "monthly", yoy: true, about: "Prices of a basket of goods and services. The yearly change is the headline inflation rate." },
  { id: "CPILFESL", name: "US core CPI", group: "Inflation", unit: "index", freq: "monthly", yoy: true, about: "CPI without food and energy, which swing the most." },
  { id: "PCEPI", name: "US PCE prices", group: "Inflation", unit: "index", freq: "monthly", yoy: true, about: "The price measure the Federal Reserve targets at 2% a year." },
  { id: "T10YIE", name: "US 10-year inflation expected", group: "Inflation", unit: "%", freq: "daily", about: "The inflation the bond market prices in for the next ten years." },
  { id: "UNRATE", name: "US unemployment rate", group: "Jobs", unit: "%", freq: "monthly", about: "Share of the labour force out of work and looking." },
  { id: "PAYEMS", name: "US jobs (nonfarm payrolls)", group: "Jobs", unit: "thousands", freq: "monthly", about: "Jobs outside farming, from the monthly jobs report." },
  { id: "ICSA", name: "US jobless claims", group: "Jobs", unit: "claims", freq: "weekly", about: "New claims for unemployment benefit each week: the earliest sign of layoffs." },
  { id: "GDPC1", name: "US real GDP", group: "Growth", unit: "billions of 2017 dollars", freq: "quarterly", yoy: true, about: "The economy's output after inflation." },
  { id: "INDPRO", name: "US industrial production", group: "Growth", unit: "index", freq: "monthly", yoy: true, about: "Output of factories, mines and utilities." },
  { id: "RSAFS", name: "US retail sales", group: "Growth", unit: "millions of dollars", freq: "monthly", yoy: true, about: "What shops and restaurants take in." },
  { id: "UMCSENT", name: "US consumer sentiment", group: "Growth", unit: "index", freq: "monthly", about: "The University of Michigan's survey of how households feel." },
  { id: "DFF", name: "Fed funds rate", group: "Rates", unit: "%", freq: "daily", about: "The overnight rate the Federal Reserve steers." },
  { id: "DGS2", name: "US 2-year Treasury yield", group: "Rates", unit: "%", freq: "daily", about: "Moves with what markets expect from the Fed." },
  { id: "DGS10", name: "US 10-year Treasury yield", group: "Rates", unit: "%", freq: "daily", about: "The benchmark long-term borrowing rate." },
  { id: "T10Y2Y", name: "10-year minus 2-year yield", group: "Rates", unit: "points", freq: "daily", about: "Below zero (an inverted curve) has come before most US recessions." },
  { id: "MORTGAGE30US", name: "US 30-year mortgage rate", group: "Rates", unit: "%", freq: "weekly", about: "The average 30-year fixed mortgage rate." },
  { id: "M2SL", name: "US money supply (M2)", group: "Money and markets", unit: "billions of dollars", freq: "monthly", yoy: true, about: "Cash, deposits and money-market funds." },
  { id: "DTWEXBGS", name: "US dollar index", group: "Money and markets", unit: "index", freq: "daily", about: "The dollar against a broad basket of trading partners' currencies." },
  { id: "VIXCLS", name: "VIX (expected stock swings)", group: "Money and markets", unit: "index", freq: "daily", about: "How much the S&P 500 is expected to move over the next month. High means fear." },
  { id: "DCOILWTICO", name: "Oil (WTI)", group: "Money and markets", unit: "dollars a barrel", freq: "daily", about: "US crude oil, spot." },
  { id: "CSUSHPINSA", name: "US house prices (Case-Shiller)", group: "Housing", unit: "index", freq: "monthly", yoy: true, about: "Prices of existing homes across the US." },
  { id: "HOUST", name: "US housing starts", group: "Housing", unit: "thousands a year", freq: "monthly", about: "New homes started, at a yearly pace." },
];
export const MACRO_GROUPS = [...new Set(MACRO.map((m) => m.group))];
const defOf = (id: string) => MACRO.find((m) => m.id === id);

export const WORLD = [
  { id: "NY.GDP.MKTP.KD.ZG", name: "Economic growth", unit: "% a year" },
  { id: "FP.CPI.TOTL.ZG", name: "Inflation", unit: "% a year" },
  { id: "SL.UEM.TOTL.ZS", name: "Unemployment", unit: "% of the labour force" },
  { id: "GC.DOD.TOTL.GD.ZS", name: "Government debt", unit: "% of GDP" },
];
export const COUNTRIES = ["US", "GB", "DE", "FR", "JP", "CN", "IN", "CA", "BR", "ZA"];

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<{ data: T; fetchedAt: string; stale: boolean }> {
  const db = sql();
  const [c] = await db<{ data: T; fetched_at: Date }[]>`select data, fetched_at from macro_cache where key = ${key}`;
  if (c && Date.now() - c.fetched_at.getTime() < ttlMs) return { data: c.data, fetchedAt: c.fetched_at.toISOString(), stale: false };
  try {
    const data = await load();
    await db`insert into macro_cache (key, data, fetched_at) values (${key}, ${db.json(data as never)}, now())
      on conflict (key) do update set data = excluded.data, fetched_at = excluded.fetched_at`;
    return { data, fetchedAt: new Date().toISOString(), stale: false };
  } catch (e) {
    if (c) return { data: c.data, fetchedAt: c.fetched_at.toISOString(), stale: true }; // the source is down: show the last copy
    throw new DataError("not_found", `Couldn't fetch it: ${e instanceof Error ? e.message : e}`);
  }
}

const FRED_ID = /^[A-Z0-9_.]{1,30}$/;
/** Change over the year before each point, for index-like series. */
function yoy(points: Point[], def: MacroDef | undefined): Point[] {
  const lag = def?.freq === "quarterly" ? 4 : def?.freq === "weekly" ? 52 : def?.freq === "daily" ? 252 : 12;
  return points.slice(lag).map((p, i) => ({ ts: p.ts, v: (p.v / points[i].v - 1) * 100 }));
}

export type MacroSeries = { def: MacroDef; points: Point[]; yoyPoints: Point[] | null; latest: Point | null; prev: Point | null; yearAgo: Point | null; fetchedAt: string; stale: boolean };

export async function macroSeries(v: Viewer, rawId: string): Promise<MacroSeries> {
  requireUser(v);
  const id = rawId.toUpperCase();
  if (!FRED_ID.test(id)) throw new DataError("invalid", "FRED codes are letters, digits, dots and underscores, like UNRATE");
  const def = defOf(id) ?? { id, name: id, group: "Other", unit: "", freq: "monthly" as const, about: "A FRED series opened by its code." };
  const c = await cached(`fred:${id}`, 12 * 3_600_000, () => fredSeries(id));
  const points = c.data;
  const latest = points.at(-1) ?? null;
  const yearAgo = latest ? [...points].reverse().find((p) => p.ts <= latest.ts - 360 * 86_400_000) ?? null : null;
  return { def, points, yoyPoints: def.yoy ? yoy(points, def) : null, latest, prev: points.at(-2) ?? null, yearAgo, fetchedAt: c.fetchedAt, stale: c.stale };
}

/** Latest value and a year of history for every curated series; a series that fails is left out, not the page. */
export async function macroOverview(v: Viewer) {
  const all = await Promise.all(MACRO.map((m) => macroSeries(v, m.id).catch(() => null)));
  return all.filter((s): s is MacroSeries => !!s).map((s) => ({ ...s, points: s.points.filter((p) => p.ts > Date.now() - 3 * 365 * 86_400_000),
    yoyPoints: s.yoyPoints?.filter((p) => p.ts > Date.now() - 3 * 365 * 86_400_000) ?? null }));
}

export async function worldCompare(v: Viewer, indicator: string) {
  requireUser(v);
  const ind = WORLD.find((w) => w.id === indicator);
  if (!ind) throw new DataError("invalid", "No such indicator");
  const c = await cached(`wb:${ind.id}`, 24 * 3_600_000, () => worldBank(ind.id, COUNTRIES));
  return { indicator: ind, countries: c.data, fetchedAt: c.fetchedAt, stale: c.stale };
}

export async function macroPins(v: Viewer): Promise<string[]> {
  const u = requireUser(v);
  const [r] = await sql()<{ macro_pins: string[] }[]>`select macro_pins from users where id = ${u.id}`;
  return r?.macro_pins ?? [];
}
export async function setMacroPin(v: Viewer, id: string, on: boolean) {
  const u = requireUser(v);
  const code = id.toUpperCase();
  if (!FRED_ID.test(code)) throw new DataError("invalid", "Not a FRED code");
  const pins = (await macroPins(v)).filter((p) => p !== code);
  if (on) { if (pins.length >= 8) throw new DataError("limit", "Pin up to 8 series"); pins.push(code); }
  await sql()`update users set macro_pins = ${pins} where id = ${u.id}`;
  return pins;
}

// ---------------------------------------------------------------- prediction markets

export async function predictions(v: Viewer, q?: string): Promise<{ markets: Prediction[]; fetchedAt: string; stale: boolean }> {
  requireUser(v);
  const c = await cached("polymarket:top", 10 * 60_000, () => polymarketTop(200));
  const words = (q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const markets = words.length ? c.data.filter((m) => words.every((w) => `${m.question} ${m.group ?? ""}`.toLowerCase().includes(w))) : c.data;
  return { markets, fetchedAt: c.fetchedAt, stale: c.stale };
}

/** Open markets about one asset, matched on its name or ticker in the question. */
export async function assetPredictions(v: Viewer, slug: string) {
  const a = ASSET_BY_SLUG.get(slug);
  if (!a) return [];
  const t = a.ticker.replace(/\/.*/, "");
  const re = new RegExp(`\\b(${a.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${t.length >= 3 ? `|${t}` : ""})\\b`, "i");
  try { return (await predictions(v)).markets.filter((m) => re.test(m.question)).slice(0, 6); } catch { return []; }
}

// ---------------------------------------------------------------- options

/** One expiry's chain around the price, the expiries available, and the move the options price in. Cached 10 minutes. */
export async function assetOptions(v: Viewer, slug: string, expiry?: string) {
  requireUser(v);
  const a = ASSET_BY_SLUG.get(slug);
  if (!a) throw new DataError("not_found", "No such asset");
  const underlying = a.market === "stocks" || a.market === "etfs" ? a.ticker : a.meta.proxy ? String(a.meta.proxy) : null;
  if (!underlying) throw new DataError("invalid", `${a.name} has no listed options through Alpaca.`);
  await loadAsset(slug, ["1d"]);
  const px = a.meta.proxy ? null : quote(slug).price;
  const today = new Date().toISOString().slice(0, 10), to = new Date(Date.now() + 75 * 86_400_000).toISOString().slice(0, 10);
  const c = await cached(`opt:${underlying}:${today}`, 10 * 60_000, async () => {
    const ref = px ?? 0;
    return optionSnapshots(underlying, { from: today, to, strikeLo: ref ? ref * 0.7 : 0, strikeHi: ref ? ref * 1.3 : 1e6 });
  });
  const expiries = [...new Set(c.data.map((x) => x.expiry))].sort();
  const pick = expiry && expiries.includes(expiry) ? expiry : expiries.find((e) => Date.parse(e) - Date.now() > 5 * 86_400_000) ?? expiries[0];
  const chain = c.data.filter((x) => x.expiry === pick);
  const strikes = [...new Set(chain.map((x) => x.strike))].sort((x, y) => x - y);
  const rows = strikes.map((k) => ({ strike: k, call: chain.find((x) => x.strike === k && x.type === "call") ?? null, put: chain.find((x) => x.strike === k && x.type === "put") ?? null }));
  const price = px ?? (rows.length ? rows[Math.floor(rows.length / 2)].strike : null);
  const mid = (x: { bid: number | null; ask: number | null; last: number | null } | null) => (x ? (x.bid !== null && x.ask !== null ? (x.bid + x.ask) / 2 : x.last) : null);
  const atm = price === null ? null : rows.reduce<(typeof rows)[number] | null>((b, r) => (!b || Math.abs(r.strike - price) < Math.abs(b.strike - price) ? r : b), null);
  const straddle = atm && mid(atm.call) !== null && mid(atm.put) !== null ? mid(atm.call)! + mid(atm.put)! : null;
  return { asset: a, underlying, price, expiries, expiry: pick ?? null, rows, atmStrike: atm?.strike ?? null,
    expectedMove: straddle && price ? { usd: straddle, pct: (straddle / price) * 100 } : null, fetchedAt: c.fetchedAt, stale: c.stale };
}

// ---------------------------------------------------------------- company fundamentals (SEC EDGAR)

/** SEC company numbers (CIK) for the catalogue's stocks, checked against EDGAR's company facts. */
const CIK: Record<string, number> = { aapl: 320193, nvda: 1045810, msft: 789019, tsla: 1318605, amzn: 1018724, googl: 1652044 };
export const hasFundamentals = (slug: string) => Object.hasOwn(CIK, slug);
export const FUNDAMENTAL_SLUGS = Object.keys(CIK);

export async function companyFundamentals(v: Viewer, slug: string) {
  requireUser(v);
  const a = ASSET_BY_SLUG.get(slug);
  if (!a || !hasFundamentals(slug)) throw new DataError("not_found", "No company filings for this asset");
  const c = await cached(`sec:${slug}`, 24 * 3_600_000, async () => {
    const contact = process.env.SEC_CONTACT?.trim();
    const base = process.env.SEC_DATA_URL?.trim() || "https://data.sec.gov";
    const r = await fetch(`${base}/api/xbrl/companyfacts/CIK${String(CIK[slug]).padStart(10, "0")}.json`, { cache: "no-store", signal: AbortSignal.timeout(20_000),
      headers: { "user-agent": `FXDEZ private research app${contact ? ` ${contact}` : ""}`, accept: "application/json" } });
    if (!r.ok) throw new Error(`the SEC answered ${r.status}`);
    const f = await r.json();
    return { name: f.entityName as string, years: annual(f), shares: sharesOutstanding(f) };
  });
  await loadAsset(slug, ["1d"]);
  const price = quote(slug).price;
  const y = c.data.years, last = y.at(-1) ?? null, first = y.find((x) => x.revenue !== null) ?? null;
  const mcap = c.data.shares ? price * c.data.shares : null;
  const span = last && first ? last.fy - first.fy : 0;
  const ratios = last && {
    pe: last.eps ? price / last.eps : null, ps: mcap && last.revenue ? mcap / last.revenue : null,
    fcfYield: mcap && last.fcf ? (last.fcf / mcap) * 100 : null, netMargin: last.revenue && last.netIncome !== null ? (last.netIncome / last.revenue) * 100 : null,
    revenueGrowth: span >= 1 && first!.revenue && last.revenue ? ((last.revenue / first!.revenue) ** (1 / span) - 1) * 100 : null,
    netCash: last.cash !== null ? last.cash - (last.debt ?? 0) : null,
  };
  return { asset: a, cik: CIK[slug], ...c.data, price, mcap, last, ratios, fetchedAt: c.fetchedAt, stale: c.stale };
}
