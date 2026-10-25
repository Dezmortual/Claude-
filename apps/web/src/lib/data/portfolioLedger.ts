import "server-only";
// The portfolio ledger (purchases plus sales, dividends, fees and broker imports), performance over time, the risk of
// today's mix, rebalancing to target weights, and concentration limits.
import { sql } from "@/lib/server/db";
import { broker, brokerConfigured, brokerMode } from "@/lib/server/broker";
import { ASSETS, ASSET_BY_SLUG } from "./catalogue";
import { closedBars, quote } from "./model";
import { bySymbol, holdable, load, portfolio, requireUser, viaBroker } from "./live";
import { DataError, type Asset, type MarketCode, type Viewer } from "./types";
import { dayOf, drawdowns, monteCarlo, navSeries, periodReturns, rebalance, riskOf, alignedReturns, type Closes, type Entry } from "../portfolio/analytics";

export const brokerReady = () => brokerConfigured();
const asset = (slug: string) => { const a = ASSET_BY_SLUG.get(slug); if (!a) throw new DataError("not_found", "No such asset"); return a; };
const YEAR = 365 * 86_400_000;

// ---------------------------------------------------------------- the ledger

export type BookRow = { id: string; table: "holding" | "entry"; slug: string; name: string; kind: Entry["kind"]; quantity: number | null; price: number | null;
  amount: number | null; on: string | null; note: string | null; source: "manual" | "alpaca" };

export async function ledger(v: Viewer): Promise<BookRow[]> {
  const u = requireUser(v);
  const db = sql();
  const rows = await db<{ id: string; t: "holding" | "entry"; slug: string; kind: Entry["kind"]; quantity: number | null; price: number | null; amount: number | null;
    day: Date | null; note: string | null; source: "manual" | "alpaca"; created_at: Date }[]>`
    select h.id, 'holding' as t, a.slug, 'buy' as kind, h.quantity, h.cost_price as price, null::float as amount, h.bought_on as day, h.note, 'manual' as source, h.created_at
      from holdings h join assets a on a.id = h.asset_id where h.user_id = ${u.id}
    union all
    select e.id, 'entry', a.slug, e.kind, e.quantity, e.price, e.amount, e.happened_on, e.note, e.source, e.created_at
      from portfolio_entries e join assets a on a.id = e.asset_id where e.user_id = ${u.id}
    order by day desc nulls last, created_at desc`;
  return rows.map((r) => ({ id: r.id, table: r.t, slug: r.slug, name: ASSET_BY_SLUG.get(r.slug)?.name ?? r.slug, kind: r.kind, quantity: r.quantity, price: r.price,
    amount: r.amount, on: r.day?.toISOString().slice(0, 10) ?? null, note: r.note, source: r.source }));
}

export type EntryInput = { slug: string; kind: "sell" | "dividend" | "fee"; quantity?: number | null; price?: number | null; amount?: number | null; on: string; note?: string | null };

export async function addEntry(v: Viewer, i: EntryInput) {
  const u = requireUser(v);
  const a = asset(i.slug);
  if (!holdable(a)) throw new DataError("invalid", `${a.name} isn't priced in dollars, so it can't be in a portfolio`);
  if (Date.parse(i.on) > Date.now() + 86_400_000) throw new DataError("invalid", "The date is in the future");
  if (i.kind === "sell") {
    if (!i.quantity || !i.price) throw new DataError("invalid", "A sale needs how many and the price");
    const held = (await portfolio(v)).positions.find((p) => p.asset.slug === a.slug)?.quantity ?? 0;
    if (i.quantity > held + 1e-9) throw new DataError("invalid", held ? `You hold ${+held.toPrecision(10)} ${a.name}; you can't record selling more` : `You don't hold any ${a.name}`);
  } else if (!(i.amount && i.amount > 0)) throw new DataError("invalid", i.kind === "dividend" ? "Enter the dividend received, in dollars" : "Enter the fee, in dollars");
  const [r] = await sql()<{ id: string }[]>`insert into portfolio_entries (user_id, asset_id, kind, quantity, price, amount, happened_on, note)
    select ${u.id}, id, ${i.kind}, ${i.kind === "sell" ? i.quantity! : null}, ${i.kind === "sell" ? i.price! : null},
      ${i.kind === "sell" ? (i.amount ?? null) : i.amount!}, ${i.on}, ${i.note?.trim() || null} from assets where slug = ${a.slug} returning id`;
  return { id: r.id };
}

export async function deleteEntry(v: Viewer, id: string) {
  const u = requireUser(v);
  const [r] = await sql()`delete from portfolio_entries where id = ${id} and user_id = ${u.id} returning id`;
  if (!r) throw new DataError("not_found", "No such entry");
}

/** Adds the broker's fills as ledger entries. Each fill is added once, however often this runs. */
export async function importBrokerFills(v: Viewer) {
  const u = requireUser(v);
  if (!brokerConfigured()) throw new DataError("invalid", "Trading isn't set up: add your Alpaca keys first");
  const map = bySymbol();
  const fills = [];
  let token: string | undefined;
  for (let page = 0; page < 10; page++) {
    const batch = await viaBroker(() => broker.fills(token));
    fills.push(...batch);
    if (batch.length < 100) break;
    token = batch.at(-1)!.id;
  }
  let added = 0, skipped = 0;
  const unknown = new Set<string>();
  for (const f of fills) {
    const a = map.get(f.symbol.replace("/", ""));
    if (!a || !holdable(a)) { unknown.add(f.symbol); skipped++; continue; }
    if (f.side === "sell_short") { skipped++; continue; }
    const r = await sql()`insert into portfolio_entries (user_id, asset_id, kind, quantity, price, happened_on, note, source, external_id)
      select ${u.id}, id, ${f.side === "buy" ? "buy" : "sell"}, ${Number(f.qty)}, ${Number(f.price)}, ${f.transaction_time.slice(0, 10)},
        ${`Alpaca ${brokerMode() === "paper" ? "practice" : "live"} fill`}, 'alpaca', ${f.id} from assets where slug = ${a.slug}
      on conflict do nothing returning id`;
    if (r.length) added++;
  }
  return { added, alreadyThere: fills.length - added - skipped, skipped, unknown: [...unknown], mode: brokerMode() };
}

export async function removeImported(v: Viewer) {
  const u = requireUser(v);
  const r = await sql()`delete from portfolio_entries where user_id = ${u.id} and source = 'alpaca' returning id`;
  return { removed: r.length };
}

// ---------------------------------------------------------------- performance

async function ledgerEntries(v: Viewer): Promise<Entry[]> {
  return (await ledger(v)).map((r) => ({ slug: r.slug, kind: r.kind, qty: r.quantity ?? 0, price: r.price,
    amount: r.amount, at: r.on ? Date.parse(r.on) : null }));
}
const closesOf = (slugs: string[]): Closes => new Map(slugs.map((s) => [s, closedBars(s, "1d").map((b) => ({ ts: b.ts, c: b.c }))]));
export const BENCHMARKS = ["spy", "bitcoin", "qqq", "gld"].filter((s) => ASSET_BY_SLUG.has(s));

export async function benchmarkFor(v: Viewer) {
  const u = requireUser(v);
  const [r] = await sql()<{ benchmark_slug: string | null }[]>`select benchmark_slug from users where id = ${u.id}`;
  const slug = r?.benchmark_slug && ASSET_BY_SLUG.has(r.benchmark_slug) ? r.benchmark_slug : BENCHMARKS[0] ?? "bitcoin";
  return asset(slug);
}
export async function setBenchmark(v: Viewer, slug: string) {
  const u = requireUser(v);
  const a = asset(slug);
  if (!holdable(a)) throw new DataError("invalid", "Pick an asset priced in dollars");
  await sql()`update users set benchmark_slug = ${a.slug} where id = ${u.id}`;
}

export async function portfolioPerformance(v: Viewer) {
  const entries = await ledgerEntries(v);
  const bench = await benchmarkFor(v);
  const slugs = [...new Set(entries.map((e) => e.slug))];
  await load(v, [...slugs, bench.slug].map(asset), ["1d"]);
  const now = Date.now();
  const firstDated = Math.min(...entries.filter((e) => e.at !== null).map((e) => e.at!), now);
  // Undated purchases: shown from a year back, or from the first dated entry if that's earlier.
  const start = Math.min(firstDated, now - YEAR);
  const nav = navSeries(entries, closesOf(slugs), start, now).filter((p, i, a) => p.value > 0 || a.slice(i).some((x) => x.value > 0));
  const firstFunded = nav.findIndex((p) => p.value > 0);
  const live = firstFunded === -1 ? [] : nav.slice(firstFunded);
  if (!live.length) return { points: [], bench, benchPoints: [], dd: drawdowns([]), periods: periodReturns([]), twr: 0, annual: null, money: null, undated: entries.some((e) => e.at === null) };
  const b = closedBars(bench.slug, "1d");
  const b0 = b.findLast((x) => dayOf(x.ts) <= live[0].ts)?.c ?? b[0]?.c;
  const benchPoints = b0 ? live.map((p) => ({ ts: p.ts, v: (b.findLast((x) => dayOf(x.ts) <= p.ts)?.c ?? b0) / b0 })) : [];
  const years = (live.at(-1)!.ts - live[0].ts) / YEAR;
  const twr = (live.at(-1)!.index - 1) * 100;
  // Money in and out: what was paid, what came back, what's left.
  const paid = entries.reduce((a, e) => a + (e.kind === "buy" ? e.qty * (e.price ?? 0) + (e.amount ?? 0) : e.kind === "fee" ? e.amount ?? 0 : 0), 0);
  const back = entries.reduce((a, e) => a + (e.kind === "sell" ? e.qty * (e.price ?? 0) - (e.amount ?? 0) : e.kind === "dividend" ? e.amount ?? 0 : 0), 0);
  const unpriced = entries.some((e) => e.kind === "buy" && e.price === null);
  return {
    points: live.map((p) => ({ ts: p.ts, v: p.index })), values: live.map((p) => ({ ts: p.ts, v: p.value })), bench, benchPoints,
    dd: drawdowns(live), periods: periodReturns(live), twr, annual: years >= 0.5 ? (live.at(-1)!.index ** (1 / years) - 1) * 100 : null,
    money: unpriced ? null : { paid, back, now: live.at(-1)!.value, profit: live.at(-1)!.value + back - paid },
    undated: entries.some((e) => e.at === null),
  };
}

// ---------------------------------------------------------------- risk, scenarios, rebalance, limits

const SHOCKS: { label: string; hit: (a: Asset) => number }[] = [
  { label: "Crypto falls 30%", hit: (a) => (a.market === "crypto" ? -0.3 : 0) },
  { label: "Stocks and funds fall 15%", hit: (a) => (a.market === "stocks" || a.market === "etfs" || a.market === "indices" ? -0.15 : 0) },
  { label: "Gold and oil fall 10%", hit: (a) => (a.market === "commodities" ? -0.1 : 0) },
  { label: "Everything falls 10%", hit: () => -0.1 },
];

export async function portfolioRisk(v: Viewer) {
  const p = await portfolio(v);
  const bench = await benchmarkFor(v);
  if (!p.positions.length) return null;
  await load(v, [bench], ["1d"]);
  const weights = new Map(p.positions.map((x) => [x.asset.slug, x.weight]));
  const closes = closesOf([...weights.keys()]);
  const now = Date.now();
  const risk = riskOf(weights, closes, closedBars(bench.slug, "1d").map((b) => ({ ts: b.ts, c: b.c })), now);
  const { rets } = alignedReturns(closes, now, 365);
  const daily = [...rets.values()][0]?.map((_, i) => [...weights].reduce((a, [s, w]) => a + w * (rets.get(s)?.[i] ?? 0), 0)) ?? [];
  const sim = monteCarlo(daily);
  const shocks = SHOCKS.map((s) => {
    const loss = p.positions.reduce((a, x) => a + x.value * s.hit(x.asset), 0);
    return { label: s.label, change: loss, pct: p.total ? (loss / p.total) * 100 : 0 };
  }).filter((s) => s.change !== 0);
  return { total: p.total, bench, risk, sim, shocks, positions: p.positions.map((x) => ({ slug: x.asset.slug, name: x.asset.name, weight: x.weight, value: x.value })) };
}

export async function targets(v: Viewer) {
  const u = requireUser(v);
  return (await sql()<{ slug: string; weight: number }[]>`select slug, weight from portfolio_targets where user_id = ${u.id} order by weight desc`);
}

export async function setTargets(v: Viewer, list: { slug: string; weight: number }[]) {
  const u = requireUser(v);
  for (const t of list) { const a = asset(t.slug); if (!holdable(a)) throw new DataError("invalid", `${a.name} can't be in a portfolio`); }
  const sum = list.reduce((a, t) => a + t.weight, 0);
  if (list.length && Math.abs(sum - 100) > 0.5) throw new DataError("invalid", `Targets add up to ${+sum.toFixed(2)}%; make them add up to 100%`);
  await sql().begin(async (tx) => {
    await tx`delete from portfolio_targets where user_id = ${u.id}`;
    for (const t of list) await tx`insert into portfolio_targets (user_id, slug, weight) values (${u.id}, ${t.slug}, ${t.weight})`;
  });
}

export async function rebalancePlan(v: Viewer) {
  const [p, t] = await Promise.all([portfolio(v), targets(v)]);
  if (!t.length) return null;
  const extra = t.map((x) => asset(x.slug)).filter((a) => !p.positions.some((x) => x.asset.slug === a.slug));
  await load(v, extra, ["1d"]);
  const current = new Map(p.positions.map((x) => [x.asset.slug, { value: x.value, price: x.price }]));
  for (const a of extra) current.set(a.slug, { value: 0, price: quote(a.slug).price });
  const plan = rebalance(current, new Map(t.map((x) => [x.slug, x.weight])), p.total);
  return { ...plan, trades: plan.trades.map((x) => ({ ...x, name: ASSET_BY_SLUG.get(x.slug)?.name ?? x.slug, unit: unitOf(asset(x.slug)) })) };
}
const unitOf = (a: Asset) => (a.meta.proxy ? `${a.meta.proxy} shares` : a.market === "crypto" ? a.ticker : "shares");

export type Limit = { id: string; kind: "max_holding" | "max_market"; target: string; pct: number };
export type LimitStatus = Limit & { label: string; worst: { name: string; pct: number } | null; state: "ok" | "near" | "over" };
const MARKET_NAMES: Record<string, string> = { crypto: "Crypto", forex: "Forex", stocks: "Stocks", commodities: "Commodities", indices: "Indices", etfs: "ETFs", bonds: "Bonds" };

export async function limitStatus(v: Viewer): Promise<LimitStatus[]> {
  const u = requireUser(v);
  const [limits, p] = await Promise.all([sql()<Limit[]>`select id, kind, target, pct from portfolio_limits where user_id = ${u.id} order by created_at`, portfolio(v)]);
  return limits.map((l) => {
    let worst: { name: string; pct: number } | null = null;
    if (l.kind === "max_holding") {
      const xs = p.positions.filter((x) => l.target === "any" || x.asset.slug === l.target);
      const top = xs.sort((a, b) => b.weight - a.weight)[0];
      worst = top ? { name: top.asset.name, pct: top.weight * 100 } : null;
    } else {
      const share = p.positions.filter((x) => x.asset.market === l.target).reduce((a, x) => a + x.weight, 0) * 100;
      worst = { name: MARKET_NAMES[l.target] ?? l.target, pct: share };
    }
    const label = l.kind === "max_holding" ? `${l.target === "any" ? "Any one holding" : ASSET_BY_SLUG.get(l.target)?.name ?? l.target} at most ${l.pct}%`
      : `${MARKET_NAMES[l.target] ?? l.target} at most ${l.pct}% in total`;
    const state = !worst ? "ok" : worst.pct > l.pct + 1e-9 ? "over" : worst.pct >= l.pct * 0.9 ? "near" : "ok";
    return { ...l, label, worst, state };
  });
}

export async function addLimit(v: Viewer, i: { kind: Limit["kind"]; target: string; pct: number }) {
  const u = requireUser(v);
  if (i.kind === "max_holding" && i.target !== "any") asset(i.target);
  if (i.kind === "max_market" && !Object.hasOwn(MARKET_NAMES, i.target)) throw new DataError("invalid", "No such market");
  const [{ n }] = await sql()<{ n: number }[]>`select count(*)::int as n from portfolio_limits where user_id = ${u.id}`;
  if (n >= 20) throw new DataError("limit", "Up to 20 limits");
  await sql()`insert into portfolio_limits (user_id, kind, target, pct) values (${u.id}, ${i.kind}, ${i.target}, ${i.pct})`;
}
export async function deleteLimit(v: Viewer, id: string) {
  const u = requireUser(v);
  const [r] = await sql()`delete from portfolio_limits where id = ${id} and user_id = ${u.id} returning id`;
  if (!r) throw new DataError("not_found", "No such limit");
}
export const LIMIT_MARKETS = Object.entries(MARKET_NAMES).filter(([k]) => ASSETS.some((a) => a.market === (k as MarketCode) && holdable(a))).map(([code, name]) => ({ code, name }));
