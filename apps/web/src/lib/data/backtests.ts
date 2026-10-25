import "server-only";
// The backtest lab's data: runs on stored price history, saved strategies with versions, run history and compare.
import { createHash } from "node:crypto";
import { sql } from "@/lib/server/db";
import { ASSET_BY_SLUG } from "./catalogue";
import { closedBars } from "./model";
import { loadAsset, requireUser } from "./live";
import { DataError, type Viewer } from "./types";
import { check, evaluate } from "../indicators/formula";
import { deflatedSharpe, fill, placeholders, runStrategy, sweep as runSweep, thin, type Metrics, type Range, type StrategySpec, type Sweep, type Trade } from "../indicators/strategy";

export const MAX_RUNS = 200, MAX_STRATEGIES = 50, PERIODS = ["1y", "2y", "3y", "all"] as const;
export type Period = (typeof PERIODS)[number];

/** What the lab form sends: the spec, where to run it, and optionally ranges to sweep. */
export type LabInput = {
  slug: string; timeframe: "1d" | "1w"; period: Period;
  template: string | null; entry: string; exit: string | null; side: "long" | "short"; params: Record<string, number>;
  stopPct: number | null; takePct: number | null; maxBars: number | null; feePct: number; slippagePct: number;
  strategyId: string | null; ranges: Range[] | null;
};

export type RunSummary = { metrics: Metrics; luck: number | null; tries: number; warmupBars: number; note: string | null };
export type RunEquity = { strategy: { ts: number; v: number }[]; hold: { ts: number; v: number }[] };
export type SweepSummary = Omit<Sweep, "rows"> & { rows: Sweep["rows"] };
export type BacktestRun = {
  id: string; name: string; kind: "run" | "sweep"; slug: string; assetName: string; timeframe: "1d" | "1w"; strategyId: string | null;
  spec: LabInput; summary: RunSummary; equity: RunEquity; trades: Trade[]; sweep: SweepSummary | null; pinned: boolean; createdAt: string;
};
export type RunListItem = Pick<BacktestRun, "id" | "name" | "kind" | "slug" | "assetName" | "timeframe" | "pinned" | "createdAt"> &
  { totalReturn: number; maxDrawdown: number; sharpe: number | null; trades: number; buyHold: number; luck: number | null };

const YEAR = 365.25 * 86_400_000;
const nameOf = (slug: string) => ASSET_BY_SLUG.get(slug)?.name ?? slug;

/** Checks every rule with its placeholders filled; the message names the rule and what's wrong. */
function validate(i: LabInput) {
  const names = placeholders(i.entry, i.exit);
  const fromRanges = new Set((i.ranges ?? []).map((r) => r.name));
  for (const n of names) if (!Object.hasOwn(i.params, n) && !fromRanges.has(n)) throw new DataError("invalid", `Give {${n}} a value`);
  const sample = { ...i.params, ...Object.fromEntries((i.ranges ?? []).map((r) => [r.name, r.to])) };
  for (const [label, rule] of [["entry", i.entry], ["exit", i.exit]] as const) {
    if (!rule) continue;
    const e = check(fill(rule, sample));
    if (e) throw new DataError("invalid", `The ${label} rule: ${e.message}`);
  }
  for (const r of i.ranges ?? []) {
    if (!names.includes(r.name)) throw new DataError("invalid", `{${r.name}} isn't used in the rules`);
    if (!(r.step > 0) || r.to < r.from) throw new DataError("invalid", `The range for {${r.name}} needs from ≤ to and a step above 0`);
  }
  if (!i.exit && !i.stopPct && !i.takePct && !i.maxBars && /crosses_/.test(i.entry))
    throw new DataError("invalid", "A crossing is true for one bar only, so holding \"while the entry rule holds\" would sell the next day. Add an exit rule, a stop, a target or a time limit.");
}

/** The first bar every rule has a value on, so no trade happens before the indicators are ready. */
function firstReady(bars: ReturnType<typeof closedBars>, i: LabInput): number {
  const p = { ...i.params, ...Object.fromEntries((i.ranges ?? []).map((r) => [r.name, r.to])) };
  let first = 0;
  for (const rule of [i.entry, i.exit]) {
    if (!rule) continue;
    const s = evaluate(fill(rule, p), bars);
    const k = s.findIndex((x) => x !== null);
    first = Math.max(first, k === -1 ? bars.length : k);
  }
  return first;
}

const family = (i: LabInput) => i.strategyId ? `strategy:${i.strategyId}` : i.template ? `template:${i.template}`
  : `rule:${createHash("sha1").update(`${i.side}|${i.entry}|${i.exit ?? ""}`).digest("hex").slice(0, 16)}`;

export async function runBacktest(v: Viewer, i: LabInput): Promise<{ id: string }> {
  const u = requireUser(v);
  validate(i);
  const a = await loadAsset(i.slug, ["1d", "1w"]);
  const bars = closedBars(i.slug, i.timeframe);
  if (bars.length < 60) throw new DataError("invalid", `${a.name} has only ${bars.length} ${i.timeframe === "1d" ? "daily" : "weekly"} bars stored; a backtest needs at least 60`);
  const ready = firstReady(bars, i);
  const wanted = i.period === "all" ? 0 : Math.max(0, bars.findIndex((b) => b.ts >= Date.now() - Number(i.period[0]) * YEAR));
  const from = Math.max(wanted, ready + 1);
  if (bars.length - from < 30) throw new DataError("invalid", "After the indicators warm up there are fewer than 30 bars left to trade. Pick a longer period, weekly bars, or shorter windows.");
  const note = from > wanted ? `The first ${from - wanted} bars of the period went to warming up the indicators, so trading starts ${new Date(bars[from].ts).toISOString().slice(0, 10)}.` : null;

  const spec: StrategySpec = { entry: i.entry, exit: i.exit, side: i.side, params: i.params, stopPct: i.stopPct, takePct: i.takePct,
    maxBars: i.maxBars, feePct: i.feePct, slippagePct: i.slippagePct };
  let sw: Sweep | null = null;
  try { if (i.ranges?.length) sw = runSweep(bars, spec, i.ranges, from); } catch (e) { throw new DataError("invalid", e instanceof Error ? e.message : String(e)); }
  // A sweep's headline is its best whole-period row; the walk-forward block shows what that's really worth.
  const params = sw?.rows[0] ? { ...i.params, ...sw.rows[0].params } : i.params;
  const r = runStrategy(bars, { ...spec, params }, from);
  const trials = sw ? sw.tried : 1;
  const fam = family(i);

  return sql().begin(async (tx) => {
    await tx`select 1 from users where id = ${u.id} for update`;
    const [{ before }] = await tx<{ before: number }[]>`select coalesce(sum(trials), 0)::int as before from backtest_runs where user_id = ${u.id} and family = ${fam}`;
    const tries = before + trials;
    const summary: RunSummary = { metrics: r.metrics, luck: deflatedSharpe(r.metrics.perBar, tries, sw?.spread), tries, warmupBars: from, note };
    const c0 = bars[from].c;
    const equity: RunEquity = { strategy: thin(r.equity), hold: thin(bars.slice(from).map((b) => ({ ts: b.ts, v: b.c / c0 }))) };
    const sweepOut = sw ? { ...sw, rows: sw.rows.slice(0, 25), outOfSample: sw.outOfSample && { ...sw.outOfSample, equity: thin(sw.outOfSample.equity) } } : null;
    const tmpl = i.template ? i.template.replace(/-/g, " ") : "custom rules";
    const name = `${nameOf(i.slug)} · ${tmpl}${sw ? " · sweep" : ""}`;
    const [{ id }] = await tx<{ id: string }[]>`insert into backtest_runs (user_id, strategy_id, name, family, kind, slug, timeframe, spec, summary, equity, trades, sweep, trials)
      values (${u.id}, ${i.strategyId}, ${name}, ${fam}, ${sw ? "sweep" : "run"}, ${i.slug}, ${i.timeframe}, ${tx.json({ ...i, params } as never)},
        ${tx.json(summary as never)}, ${tx.json(equity as never)}, ${tx.json(r.trades.slice(-300) as never)}, ${sweepOut ? tx.json(sweepOut as never) : null}, ${trials})
      returning id`;
    // Keep the newest runs; pinned ones are never removed.
    await tx`delete from backtest_runs where id in (select id from backtest_runs where user_id = ${u.id} and not pinned
      order by created_at desc offset ${MAX_RUNS})`;
    return { id };
  }) as Promise<{ id: string }>;
}

type RunRow = { id: string; name: string; kind: "run" | "sweep"; slug: string; timeframe: "1d" | "1w"; strategy_id: string | null; spec: LabInput;
  summary: RunSummary; equity: RunEquity; trades: Trade[]; sweep: SweepSummary | null; pinned: boolean; created_at: Date };
const toRun = (r: RunRow): BacktestRun => ({ id: r.id, name: r.name, kind: r.kind, slug: r.slug, assetName: nameOf(r.slug), timeframe: r.timeframe,
  strategyId: r.strategy_id, spec: r.spec, summary: r.summary, equity: r.equity, trades: r.trades, sweep: r.sweep, pinned: r.pinned, createdAt: r.created_at.toISOString() });

export async function listRuns(v: Viewer): Promise<RunListItem[]> {
  const u = requireUser(v);
  const rows = await sql()<Omit<RunRow, "equity" | "trades" | "sweep" | "spec">[]>`
    select id, name, kind, slug, timeframe, strategy_id, summary, pinned, created_at from backtest_runs where user_id = ${u.id}
    order by pinned desc, created_at desc limit ${MAX_RUNS + 50}`;
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, slug: r.slug, assetName: nameOf(r.slug), timeframe: r.timeframe, pinned: r.pinned,
    createdAt: r.created_at.toISOString(), totalReturn: r.summary.metrics.totalReturn, maxDrawdown: r.summary.metrics.maxDrawdown,
    sharpe: r.summary.metrics.sharpe, trades: r.summary.metrics.trades, buyHold: r.summary.metrics.buyHold, luck: r.summary.luck }));
}

export async function getRun(v: Viewer, id: string): Promise<BacktestRun> {
  const u = requireUser(v);
  const [r] = await sql()<RunRow[]>`select * from backtest_runs where id = ${id} and user_id = ${u.id}`;
  if (!r) throw new DataError("not_found", "No such backtest");
  return toRun(r);
}

export async function pinRun(v: Viewer, id: string, pinned: boolean) {
  const u = requireUser(v);
  const [r] = await sql()`update backtest_runs set pinned = ${pinned} where id = ${id} and user_id = ${u.id} returning id`;
  if (!r) throw new DataError("not_found", "No such backtest");
}

export async function deleteRun(v: Viewer, id: string) {
  const u = requireUser(v);
  const [r] = await sql()`delete from backtest_runs where id = ${id} and user_id = ${u.id} returning id`;
  if (!r) throw new DataError("not_found", "No such backtest");
}

/** Two to four runs on one time axis, each rebased to 1 at its own start. */
export async function compareRuns(v: Viewer, ids: string[]): Promise<BacktestRun[]> {
  const u = requireUser(v);
  if (ids.length < 2 || ids.length > 4) throw new DataError("invalid", "Pick two to four runs to compare");
  const rows = await sql()<RunRow[]>`select * from backtest_runs where user_id = ${u.id} and id in ${sql()(ids)}`;
  if (rows.length !== ids.length) throw new DataError("not_found", "One of those runs no longer exists");
  return ids.map((id) => toRun(rows.find((r) => r.id === id)!));
}

/** Bars for drawing a run's trades on the price chart. */
export async function runBars(v: Viewer, id: string) {
  const run = await getRun(v, id);
  await loadAsset(run.slug, ["1d", "1w"]);
  const from = run.equity.strategy[0]?.ts ?? 0;
  return closedBars(run.slug, run.timeframe).filter((b) => b.ts >= from);
}

// ---------------------------------------------------------------- strategies

export type StrategySpecInput = Omit<LabInput, "strategyId" | "ranges">;
export type SavedStrategy = { id: string; name: string; notes: string; spec: StrategySpecInput; version: number; updatedAt: string;
  versions: { version: number; createdAt: string; spec: StrategySpecInput }[] };
type StrategyRow = { id: string; name: string; notes: string; spec: StrategySpecInput; version: number; updated_at: Date };

export async function listStrategies(v: Viewer): Promise<Omit<SavedStrategy, "versions">[]> {
  const u = requireUser(v);
  return (await sql()<StrategyRow[]>`select id, name, notes, spec, version, updated_at from strategies where user_id = ${u.id} order by updated_at desc`)
    .map((r) => ({ id: r.id, name: r.name, notes: r.notes, spec: r.spec, version: r.version, updatedAt: r.updated_at.toISOString() }));
}

export async function getStrategy(v: Viewer, id: string): Promise<SavedStrategy> {
  const u = requireUser(v);
  const [r] = await sql()<StrategyRow[]>`select id, name, notes, spec, version, updated_at from strategies where id = ${id} and user_id = ${u.id}`;
  if (!r) throw new DataError("not_found", "No such strategy");
  const versions = await sql()<{ version: number; created_at: Date; spec: StrategySpecInput }[]>`
    select version, created_at, spec from strategy_versions where strategy_id = ${id} order by version desc`;
  return { id: r.id, name: r.name, notes: r.notes, spec: r.spec, version: r.version, updatedAt: r.updated_at.toISOString(),
    versions: versions.map((x) => ({ version: x.version, createdAt: x.created_at.toISOString(), spec: x.spec })) };
}

const nameTaken = (e: unknown) => (e as { code?: string })?.code === "23505";

/** Creates a strategy, or saves a new version of an existing one (the old version stays in its history). */
export async function saveStrategy(v: Viewer, i: { id?: string | null; name: string; notes: string; spec: StrategySpecInput }): Promise<{ id: string; version: number }> {
  const u = requireUser(v);
  validate({ ...i.spec, strategyId: null, ranges: null });
  try {
    return await sql().begin(async (tx) => {
      if (i.id) {
        const [r] = await tx<{ id: string; version: number }[]>`update strategies set name = ${i.name.trim()}, notes = ${i.notes}, spec = ${tx.json(i.spec as never)},
          version = version + 1, updated_at = now() where id = ${i.id} and user_id = ${u.id} returning id, version`;
        if (!r) throw new DataError("not_found", "No such strategy");
        await tx`insert into strategy_versions (strategy_id, version, spec) values (${r.id}, ${r.version}, ${tx.json(i.spec as never)})`;
        return r;
      }
      await tx`select 1 from users where id = ${u.id} for update`;
      const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from strategies where user_id = ${u.id}`;
      if (n >= MAX_STRATEGIES) throw new DataError("limit", `You can keep up to ${MAX_STRATEGIES} strategies`);
      const [r] = await tx<{ id: string; version: number }[]>`insert into strategies (user_id, name, notes, spec) values (${u.id}, ${i.name.trim()}, ${i.notes}, ${tx.json(i.spec as never)})
        returning id, version`;
      await tx`insert into strategy_versions (strategy_id, version, spec) values (${r.id}, 1, ${tx.json(i.spec as never)})`;
      return r;
    }) as { id: string; version: number };
  } catch (e) {
    if (nameTaken(e)) throw new DataError("conflict", "You already have a strategy with that name");
    throw e;
  }
}

export async function deleteStrategy(v: Viewer, id: string) {
  const u = requireUser(v);
  const [r] = await sql()`delete from strategies where id = ${id} and user_id = ${u.id} returning id`;
  if (!r) throw new DataError("not_found", "No such strategy");
}
