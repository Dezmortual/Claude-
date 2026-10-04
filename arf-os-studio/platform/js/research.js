// Backtest plans, segments, parameter selection, walk-forward, robustness suite, gates and the
// composite evidence score (spec §12, §16). Pure functions; the workflow decides who may see what.

import { runBacktest, buyAndHold, RUNNER_VERSION } from "./runner.js";
import { computeMetrics, objective, METRICS_VERSION } from "./metrics.js";
import { parameterGrid, neighbours, paramKey, defaults } from "./sdl.js";
import { rng, quantile, clamp, hashObject, mean } from "./util.js";

export const POLICIES = {
  discovery: {
    id: "discovery", name: "Discovery (default)", version: "1.0.0",
    minTrades: 100, minTradesHard: 30, oosProfitFactor: 1.1, maxDrawdown: 30, positiveSegmentsPct: 60,
    maxTopTradeShare: 25, neighbourSurvivalPct: 50, requireTradingViewParity: false, requireForward: false,
    forwardMinTrades: 10, forwardMinDays: 14, gridCap: 500, wfFolds: 4, wfGridCap: 200, minTradesSelection: 20
  },
  strict: {
    id: "strict", name: "Strict promotion", version: "1.0.0",
    minTrades: 200, minTradesHard: 60, oosProfitFactor: 1.25, maxDrawdown: 20, positiveSegmentsPct: 70,
    maxTopTradeShare: 15, neighbourSurvivalPct: 70, requireTradingViewParity: true, requireForward: true,
    forwardMinTrades: 30, forwardMinDays: 60, gridCap: 500, wfFolds: 5, wfGridCap: 200, minTradesSelection: 40
  }
};

/* ---------------- Segments (spec §12.2–12.3) ---------------- */
export function buildSegments(n, sdl, split = [0.6, 0.2, 0.2]) {
  const emb = sdl.segments?.embargoBars ?? 0;
  const devEnd = Math.floor(n * split[0]);
  const valEnd = Math.floor(n * (split[0] + split[1]));
  return {
    development: { start: 0, end: devEnd, protected: false },
    validation: { start: Math.min(devEnd + emb, valEnd - 1), end: valEnd, protected: false },
    holdout: { start: Math.min(valEnd + emb, n - 1), end: n, protected: true },
    embargoBars: emb, split
  };
}

function walkForwardFolds(region, folds, mode, emb) {
  const W = Math.floor(region.end * 0.4);
  const T = Math.floor((region.end - W) / folds);
  const out = [];
  for (let k = 0; k < folds; k++) {
    const trainStart = mode === "anchored_walk_forward" ? 0 : k * T;
    const trainEnd = W + k * T;
    out.push({ train: { start: trainStart, end: trainEnd }, test: { start: trainEnd + emb, end: k === folds - 1 ? region.end : trainEnd + T } });
  }
  return out.filter(f => f.test.end - f.test.start > 10);
}

/* ---------------- Parameter search with a predeclared selection rule ---------------- */
// Rule: "neighbourhood_plateau" — each combination's in-sample objective is averaged with its
// one-step neighbours that were tested; combinations below minTradesSelection are ineligible.
export function search(sdl, bars, seg, policy, cache, cap) {
  const grid = parameterGrid(sdl, cap ?? policy.gridCap);
  const rows = [];
  for (const p of grid) {
    const r = runBacktest(sdl, bars, p, { start: seg.start, end: seg.end, cache, recordEquity: true });
    const m = computeMetrics(r);
    rows.push({ params: p, key: paramKey(p), obj: objective(m, policy.minTradesSelection * 2), m: slim(m) });
  }
  const byKey = new Map(rows.map(r => [r.key, r]));
  for (const r of rows) {
    const nb = neighbours(sdl, r.params).map(p => byKey.get(paramKey(p))).filter(Boolean);
    const vals = [r.obj, ...nb.map(x => x.obj)].filter(Number.isFinite);
    r.plateau = vals.length ? mean(vals) : -Infinity;
    r.eligible = r.m.tradeCount >= policy.minTradesSelection;
  }
  const eligible = rows.filter(r => r.eligible && Number.isFinite(r.plateau));
  eligible.sort((a, b) => b.plateau - a.plateau);
  const chosen = eligible[0] || null;
  return {
    rule: "neighbourhood_plateau", objective: "(PF−1) × min(1, trades/2·minSel) × 1/(1+|DD|/25)",
    tried: rows.length, eligible: eligible.length, selected: chosen ? chosen.params : null,
    selectedKey: chosen ? chosen.key : null, rows
  };
}
function slim(m) {
  return { tradeCount: m.tradeCount, netProfit: m.netProfit, totalReturn: m.totalReturn, profitFactor: m.profitFactor, maxDrawdown: m.maxDrawdown, winRate: m.winRate, sharpe: m.sharpe };
}

/* ---------------- Stage A–D: smoke, baseline, search, validation, walk-forward ---------------- */
export async function runBacktestStage(sdl, bars, policyId = "discovery", progress = () => {}) {
  const policy = POLICIES[policyId] || POLICIES.discovery;
  const cache = new Map();
  const n = bars.c.length;
  const segs = buildSegments(n, sdl);
  const plan = {
    runner: RUNNER_VERSION, metrics: METRICS_VERSION, policy: policy.id, policyVersion: policy.version,
    segments: segs, selectionRule: "neighbourhood_plateau", gridCap: policy.gridCap,
    selectionMode: sdl.segments.selectionMode, initialCapital: 10_000
  };
  progress("Stage A — smoke test");
  const smoke = smokeTest(sdl, bars, cache);
  delete smoke.run;
  progress("Stage B — baseline on development segment");
  const baseRun = runBacktest(sdl, bars, defaults(sdl), { ...segs.development, cache });
  const baseline = { params: defaults(sdl), metrics: computeMetrics(baseRun) };
  progress("Stage C — in-sample parameter search");
  const sr = search(sdl, bars, segs.development, policy, cache);
  const selected = sr.selected || defaults(sdl);
  progress("Stage D — validation segment with frozen parameters");
  const devRun = runBacktest(sdl, bars, selected, { ...segs.development, cache });
  const valRun = runBacktest(sdl, bars, selected, { ...segs.validation, cache });
  progress("Walk-forward analysis");
  const wf = walkForward(sdl, bars, segs, policy, cache);
  const result = {
    plan, smoke, baseline,
    search: { ...sr, rows: sr.rows.map(r => ({ params: r.params, obj: r.obj, plateau: r.plateau, eligible: r.eligible, m: r.m })) },
    selectedParams: selected, selectionFellBack: !sr.selected,
    development: pack(devRun), validation: pack(valRun), walkForward: wf,
    benchmark: { development: buyAndHold(sdl, bars, segs.development.start, segs.development.end), validation: buyAndHold(sdl, bars, segs.validation.start, segs.validation.end) }
  };
  result.reproHash = await hashObject(valRun.trades.map(t => [t.entryTime, t.exitTime, +t.net.toFixed(6)]));
  return result;
}
function pack(run) {
  return { window: run.window, start: run.start, end: run.end, trades: run.trades, equity: run.equity, metrics: computeMetrics(run), conflicts: run.conflicts, initialCapital: run.initialCapital };
}

export function smokeTest(sdl, bars, cache) {
  const checks = [];
  const n = bars.c.length, end = Math.min(n, Math.max(2000, Math.floor(n / 3)));
  const r1 = runBacktest(sdl, bars, defaults(sdl), { start: 0, end, cache });
  const r2 = runBacktest(sdl, bars, defaults(sdl), { start: 0, end, cache: new Map() });
  const same = r1.trades.length === r2.trades.length && r1.trades.every((t, i) => t.net === r2.trades[i].net && t.entryTime === r2.trades[i].entryTime);
  checks.push({ name: "Deterministic rerun", pass: same });
  checks.push({ name: "Warm-up respected", pass: r1.trades.every(t => t.entryIdx > r1.warmupBars), detail: `warm-up ${r1.warmupBars} bars` });
  checks.push({ name: "No NaN in equity", pass: r1.equity.every(([, e]) => Number.isFinite(e)) });
  const slip = (sdl.costs.slippageTicks || 0) * sdl.costs.tickSize * 1.0001 + 1e-9;
  const impossible = r1.trades.filter(t => t.entryPrice < bars.l[t.entryIdx] - slip || t.entryPrice > bars.h[t.entryIdx] + slip || t.exitPrice < bars.l[t.exitIdx] - slip || t.exitPrice > bars.h[t.exitIdx] + slip);
  checks.push({ name: "Fills inside bar range (± slippage)", pass: impossible.length === 0, detail: impossible.length ? `${impossible.length} impossible fills` : "" });
  const wrongSide = r1.trades.filter(t => (t.dir === "long" ? t.stop >= t.entryPrice || (t.target !== null && t.target <= t.entryPrice) : t.stop <= t.entryPrice || (t.target !== null && t.target >= t.entryPrice)));
  checks.push({ name: "Stop and target on the correct side", pass: wrongSide.length === 0 });
  const dirs = new Set(r1.trades.map(t => t.dir));
  checks.push({ name: "Produces trades", pass: r1.trades.length > 0, detail: `${r1.trades.length} trades in first ${end} bars; directions ${[...dirs].join("/") || "none"}` });
  return { pass: checks.every(c => c.pass), checks, run: r1 };
}

export function walkForward(sdl, bars, segs, policy, cache) {
  const mode = sdl.segments.selectionMode === "fixed" ? "rolling_walk_forward" : sdl.segments.selectionMode;
  const region = { start: 0, end: segs.validation.end };
  const folds = walkForwardFolds(region, policy.wfFolds, mode, segs.embargoBars);
  const out = [];
  const oosTrades = [];
  for (const f of folds) {
    const sr = search(sdl, bars, f.train, policy, cache, policy.wfGridCap);
    const p = sr.selected || defaults(sdl);
    const tr = runBacktest(sdl, bars, p, { ...f.test, cache });
    const m = computeMetrics(tr);
    out.push({ train: f.train, test: f.test, params: p, fellBack: !sr.selected, from: tr.window.from, to: tr.window.to, metrics: slim(m) });
    oosTrades.push(...tr.trades);
  }
  // Stitch OOS trades into one equity, compounding each trade's return on entry equity.
  let e = 10_000;
  const eq = [];
  for (const t of oosTrades) { e *= 1 + t.ret; eq.push([t.exitTime, e]); }
  const agg = computeMetrics({ trades: oosTrades.map(t => ({ ...t })), equity: eq.length ? [[oosTrades[0].entryTime, 10_000], ...eq] : [], initialCapital: 10_000 });
  return { mode, folds: out, oos: slim(agg), oosTradeCount: oosTrades.length, positiveFoldsPct: out.length ? (out.filter(f => f.metrics.netProfit > 0).length / out.length) * 100 : NaN };
}

/* ---------------- Stage E + robustness suite (spec §7.7) ---------------- */
export function runHoldout(sdl, bars, params) {
  const segs = buildSegments(bars.c.length, sdl);
  const r = runBacktest(sdl, bars, params, { ...segs.holdout });
  return { ...pack(r), benchmark: buyAndHold(sdl, bars, segs.holdout.start, segs.holdout.end) };
}

export function robustnessSuite(sdl, bars, params, policy, progress = () => {}) {
  policy = POLICIES[policy] || policy || POLICIES.discovery;
  const cache = new Map();
  const segs = buildSegments(bars.c.length, sdl);
  const region = { start: 0, end: segs.validation.end };
  const tests = [];
  const add = (name, pass, value, detail, soft = true) => tests.push({ name, pass, value, detail, soft });
  const net = o => computeMetrics(runBacktest(sdl, bars, params, { ...region, cache, ...o })).netProfit;
  const base = runBacktest(sdl, bars, params, { ...region, cache });
  const bm = computeMetrics(base);

  progress("Cost and execution sensitivity");
  const c2 = net({ costMult: 2 }), s2 = net({ slipMult: 2 }), d1 = net({ entryDelay: 1 }), adv = net({ pathMode: "adverse" });
  add("Commission ×2", c2 > 0, c2, "net profit on dev+validation");
  add("Slippage ×2", s2 > 0, s2, "net profit on dev+validation");
  add("Entry delayed 1 bar", d1 > 0, d1, "net profit on dev+validation");
  add("Adverse intrabar path", adv > 0, adv, "net profit when every bar moves against the position first and trailing stops cannot lock in intrabar extremes");
  const missed = [];
  for (let s = 1; s <= 40; s++) missed.push(net({ skipProb: 0.1, seed: s }));
  add("10% missed trades (40 sims)", quantile(missed, 0.1) > 0, quantile(missed, 0.1), `p10 net; median ${quantile(missed, 0.5).toFixed(0)}`);

  progress("Parameter neighbourhood on validation");
  const nb = neighbours(sdl, params);
  const nbRes = nb.map(p => ({ params: p, m: computeMetrics(runBacktest(sdl, bars, p, { ...segs.validation, cache })) }));
  // No tunable parameters means nothing to perturb: the test is "not run", never a free pass.
  const survival = nb.length ? (nbRes.filter(x => x.m.netProfit > 0 && x.m.profitFactor > 1).length / nb.length) * 100 : null;
  add("Neighbour survival (validation)", survival === null ? null : survival >= policy.neighbourSurvivalPct, survival, nb.length ? `${nb.length} one-step neighbours, PF>1 and net>0` : "not run: the strategy has no tunable parameters");

  progress("Start-date perturbation");
  const shifts = [0.05, 0.1, 0.2].map(f => {
    const st = Math.floor(segs.development.end * f);
    return { shift: f, net: computeMetrics(runBacktest(sdl, bars, params, { start: st, end: region.end, cache })).netProfit };
  });
  add("Start-date perturbation", shifts.every(s => s.net > 0), Math.min(...shifts.map(s => s.net)), shifts.map(s => `+${s.shift * 100}%: ${s.net.toFixed(0)}`).join(", "));

  progress("Segment stability");
  const K = 6, L = Math.floor(region.end / K), segRes = [];
  for (let k = 0; k < K; k++) {
    const r = runBacktest(sdl, bars, params, { start: k * L, end: k === K - 1 ? region.end : (k + 1) * L, cache });
    const m = computeMetrics(r);
    segRes.push({ k, from: r.window.from, to: r.window.to, net: m.netProfit, pf: m.profitFactor, dd: m.maxDrawdown, trades: m.tradeCount });
  }
  const posPct = (segRes.filter(s => s.net > 0).length / K) * 100;
  add("Positive segments", posPct >= policy.positiveSegmentsPct, posPct, `${K} equal calendar segments over dev+validation`);

  progress("Direction breakdown");
  const dirs = sdl.strategy.directions;
  let longOnly = null, shortOnly = null;
  if (dirs.includes("long")) longOnly = computeMetrics(runBacktest(sdl, bars, params, { ...region, cache, directions: ["long"] }));
  if (dirs.includes("short")) shortOnly = computeMetrics(runBacktest(sdl, bars, params, { ...region, cache, directions: ["short"] }));
  if (dirs.length === 2) add("Both directions profitable", longOnly.netProfit > 0 && shortOnly.netProfit > 0, null, `long ${longOnly.netProfit.toFixed(0)}, short ${shortOnly.netProfit.toFixed(0)}`);

  progress("Concentration");
  const nets = base.trades.map(t => t.net).sort((a, b) => b - a);
  const total = nets.reduce((s, x) => s + x, 0);
  const top1 = total - (nets[0] || 0);
  const k5 = Math.max(1, Math.ceil(nets.length * 0.05));
  const top5 = total - nets.slice(0, k5).reduce((s, x) => s + x, 0);
  add("Top trade share of net", !(bm.topTradeShare > policy.maxTopTradeShare), bm.topTradeShare, `limit ${policy.maxTopTradeShare}%`);
  add("Net after removing top trade", top1 > 0, top1, "");
  add("Net after removing top 5% of trades", top5 > 0, top5, `${k5} trades removed`);

  progress("Monte Carlo trade-order resampling");
  const rets = base.trades.map(t => t.ret);
  const r = rng(42), mcDD = [], mcFinal = [];
  for (let s = 0; s < 1000 && rets.length; s++) {
    let e = 1, peak = 1, dd = 0;
    for (let i = 0; i < rets.length; i++) { e *= 1 + rets[Math.floor(r() * rets.length)]; peak = Math.max(peak, e); dd = Math.min(dd, e / peak - 1); }
    mcDD.push(dd * 100); mcFinal.push((e - 1) * 100);
  }
  const fan = mcFan(rets, 200, 7);
  add("Monte Carlo p95 drawdown", quantile(mcDD, 0.05) > -policy.maxDrawdown * 1.5, quantile(mcDD, 0.05), `bootstrap of ${rets.length} trade returns, 1000 paths`);
  add("Monte Carlo p10 return > 0", quantile(mcFinal, 0.1) > 0, quantile(mcFinal, 0.1), "");

  const bench = buyAndHold(sdl, bars, region.start, region.end);
  add("Beats buy-and-hold (dev+validation)", bm.totalReturn > bench, bm.totalReturn, `buy-and-hold ${bench.toFixed(1)}%`);

  return {
    params, region, baseMetrics: bm, tests, neighbours: nbRes.map(x => ({ params: x.params, net: x.m.netProfit, pf: x.m.profitFactor })),
    neighbourSurvival: survival, segments: segRes, positiveSegmentsPct: posPct, startShifts: shifts,
    longOnly: longOnly && slim(longOnly), shortOnly: shortOnly && slim(shortOnly),
    monteCarlo: { ddP50: quantile(mcDD, 0.5), ddP95: quantile(mcDD, 0.05), retP10: quantile(mcFinal, 0.1), retP50: quantile(mcFinal, 0.5), retP90: quantile(mcFinal, 0.9), fan },
    missedTrades: { p10: quantile(missed, 0.1), p50: quantile(missed, 0.5) }, sensitivity: { commission2x: c2, slippage2x: s2, delay1: d1, adversePath: adv },
    benchmark: bench
  };
}

function mcFan(rets, paths, seed) {
  if (!rets.length) return [];
  const r = rng(seed), cols = rets.length, all = [];
  for (let s = 0; s < paths; s++) { let e = 100; const row = []; for (let i = 0; i < cols; i++) { e *= 1 + rets[Math.floor(r() * cols)]; row.push(e); } all.push(row); }
  const out = [];
  for (let i = 0; i < cols; i++) {
    const col = all.map(row => row[i]);
    out.push({ i: i + 1, p05: quantile(col, 0.05), p25: quantile(col, 0.25), p50: quantile(col, 0.5), p75: quantile(col, 0.75), p95: quantile(col, 0.95) });
  }
  return out;
}

/* ---------------- Gates, hard fails and evidence score (spec §12.6, §12.7, §16) ---------------- */
export function evaluateEvidence(ev, policyId = "discovery") {
  const policy = POLICIES[policyId] || POLICIES.discovery;
  const hard = [], soft = [], gates = [];
  const { dataset, lint, backtest, robustness, holdout, parity, forward, contaminated, sdl } = ev;
  const gate = (name, pass, detail, required = true) => gates.push({ name, pass: pass === null ? null : !!pass, detail, required });

  // Hard fails (§16.1)
  if (dataset && dataset.integrity && dataset.integrity.errors.length) hard.push("Data integrity unresolved: " + dataset.integrity.errors.join("; "));
  if (lint && lint.findings.some(f => f.severity === "error" && f.category === "repaint")) hard.push("Repainting/lookahead construct in Pine source");
  if (backtest && backtest.smoke && !backtest.smoke.checks.find(c => c.name === "Deterministic rerun").pass) hard.push("Trade ledger cannot be reproduced");
  if (backtest && backtest.smoke && !backtest.smoke.checks.find(c => c.name.startsWith("Fills inside")).pass) hard.push("Strategy depends on impossible fills");
  if (sdl && !(sdl.costs.commissionValue > 0) && !(sdl.costs.slippageTicks > 0)) hard.push("Costs omitted");
  if (parity && parity.status === "FAIL" && !parity.explanation) hard.push("TradingView/local parity outside tolerance without explanation");
  if (ev.sourceMismatch) hard.push("Code and tested source do not match");
  const oosTrades = (backtest ? backtest.validation.metrics.tradeCount + backtest.walkForward.oosTradeCount : 0) + (holdout && !contaminated ? holdout.metrics.tradeCount : 0);
  const allTrades = (backtest ? backtest.development.metrics.tradeCount : 0) + oosTrades;
  if (backtest && allTrades < policy.minTradesHard) hard.push(`Sample too small: ${allTrades} trades (< ${policy.minTradesHard})`);

  // Gate checklist (§12.6)
  gate(`≥ ${policy.minTrades} closed trades across evidence`, backtest ? allTrades >= policy.minTrades : null, `${allTrades} trades`);
  gate("Positive final holdout net result", holdout ? (contaminated ? null : holdout.metrics.netProfit > 0) : null, holdout ? (contaminated ? "holdout contaminated — excluded" : holdout.metrics.netProfit.toFixed(2)) : "not run");
  const oosPF = backtest ? backtest.walkForward.oos.profitFactor : NaN;
  gate(`Out-of-sample PF > ${policy.oosProfitFactor} (walk-forward)`, backtest ? oosPF > policy.oosProfitFactor : null, Number.isFinite(oosPF) ? oosPF.toFixed(2) : String(oosPF));
  gate(`Validation PF > ${policy.oosProfitFactor}`, backtest ? backtest.validation.metrics.profitFactor > policy.oosProfitFactor : null, backtest ? fmt2(backtest.validation.metrics.profitFactor) : "");
  const worstDD = Math.min(backtest ? backtest.development.metrics.maxDrawdown : 0, backtest ? backtest.validation.metrics.maxDrawdown : 0, holdout ? holdout.metrics.maxDrawdown : 0);
  gate(`Max drawdown < ${policy.maxDrawdown}%`, backtest ? -worstDD < policy.maxDrawdown : null, worstDD.toFixed(1) + "%");
  gate(`≥ ${policy.positiveSegmentsPct}% positive segments`, robustness ? robustness.positiveSegmentsPct >= policy.positiveSegmentsPct : null, robustness ? robustness.positiveSegmentsPct.toFixed(0) + "%" : "not run");
  gate(`No trade > ${policy.maxTopTradeShare}% of net profit`, robustness ? !(robustness.baseMetrics.topTradeShare > policy.maxTopTradeShare) : null, robustness ? fmt2(robustness.baseMetrics.topTradeShare) + "%" : "");
  const nbs = robustness ? robustness.neighbourSurvival : null, nbTested = typeof nbs === "number";
  gate(`Neighbour survival ≥ ${policy.neighbourSurvivalPct}%`, nbTested ? nbs >= policy.neighbourSurvivalPct : null, nbTested ? nbs.toFixed(0) + "%" : robustness ? "not tested (no tunable parameters)" : "", !robustness || nbTested);
  // Share of the normal dev+validation profit that survives when every bar moves against the position first.
  const advNet = robustness ? robustness.sensitivity.adversePath : undefined, baseNet = robustness ? robustness.baseMetrics.netProfit : 0;
  const advKeep = advNet !== undefined && baseNet > 0 ? advNet / baseNet : null;
  gate("Realistic costs included", sdl ? sdl.costs.commissionValue > 0 && sdl.costs.slippageTicks > 0 : null, sdl ? `${sdl.costs.commissionValue}% + ${sdl.costs.slippageTicks} ticks` : "");
  gate("No unresolved repainting defect", lint ? !lint.findings.some(f => f.category === "repaint" && f.severity === "error") : null, lint ? `${lint.findings.length} lint findings` : "Pine not linted");
  gate("TradingView parity verified", parity ? parity.status === "PASS" || (parity.status === "FAIL" && !!parity.explanation) : null, parity ? parity.status : "not verified", policy.requireTradingViewParity);
  gate("Forward-test evidence", forward ? forward.trades >= policy.forwardMinTrades && forward.days >= policy.forwardMinDays : null, forward ? `${forward.trades} trades / ${forward.days.toFixed(0)} days` : "none", policy.requireForward || !!contaminated);

  // Soft concerns (§16.2)
  if (nbTested && nbs < policy.neighbourSurvivalPct) soft.push("High parameter sensitivity");
  if (robustness && !nbTested) soft.push("Parameter stability not tested: the strategy has no tunable parameters");
  if (robustness && robustness.baseMetrics.topTradeShare > policy.maxTopTradeShare) soft.push("High profit concentration");
  if (robustness && robustness.baseMetrics.longestDrawdownDays > 365) soft.push("Long stagnation (> 1 year under water)");
  if (robustness && robustness.longOnly && robustness.shortOnly && (robustness.longOnly.netProfit > 0) !== (robustness.shortOnly.netProfit > 0)) soft.push("Inconsistent long/short performance");
  if (backtest && backtest.search.tried > 100) soft.push(`Multiple-testing burden: ${backtest.search.tried} combinations tried in-sample`);
  if (allTrades < policy.minTrades) soft.push(`Low sample: ${allTrades} trades (< ${policy.minTrades})`);
  if (contaminated) soft.push("Final holdout contaminated by an earlier version; forward evidence required");
  if (!parity) soft.push("No TradingView parity check yet");
  if (backtest && backtest.selectionFellBack) soft.push("No parameter set met the selection rule; defaults were used");
  if (sdl && sdl.execution && sdl.execution.processOnClose) soft.push("Orders fill at the signal bar's close (process_orders_on_close): optimistic versus live execution");
  if (advKeep !== null && advKeep <= 0) soft.push("Profit disappears under an adverse intrabar path: the edge depends on the backtester's guess of price order inside bars");
  else if (advKeep !== null && advKeep < 0.5) soft.push(`Only ${(advKeep * 100).toFixed(0)}% of the profit survives an adverse intrabar path: most of the edge depends on the backtester's guess of price order inside bars`);
  const pfs = [backtest && [backtest.validation.metrics, "validation"], holdout && !contaminated && [holdout.metrics, "final holdout"]].filter(x => x && x[0].tradeCount >= 20 && x[0].profitFactor > 5);
  for (const [m, name] of pfs) soft.push(`Implausibly high profit factor on ${name} (${fmt2(m.profitFactor)}): real edges are rarely above 3; check fills, stops and look-ahead before trusting it`);

  // Composite score (§12.7)
  const parts = {};
  parts.dataIntegrity = dataset && dataset.integrity ? (dataset.integrity.errors.length ? 0 : dataset.integrity.warnings.length ? 6 : 10) : 0;
  parts.causality = lint ? Math.max(0, 15 - 5 * lint.findings.filter(f => f.category === "repaint").length - 2 * lint.findings.filter(f => f.severity === "warning" && f.category !== "repaint").length) : 8;
  parts.reproducibility = (backtest && backtest.smoke.checks[0].pass ? 5 : 0) + (parity ? (parity.status === "PASS" ? 5 : parity.explanation ? 2 : 0) : 0);
  const pfScore = pf => clamp(((Number.isFinite(pf) ? pf : 2) - 1) / 0.5, 0, 1);
  const oosParts = [];
  if (backtest) { oosParts.push(pfScore(backtest.walkForward.oos.profitFactor)); oosParts.push(pfScore(backtest.validation.metrics.profitFactor)); }
  if (holdout && !contaminated) oosParts.push(pfScore(holdout.metrics.profitFactor));
  parts.outOfSample = oosParts.length ? 15 * mean(oosParts) : 0;
  parts.segmentStability = robustness ? 15 * clamp((robustness.positiveSegmentsPct - 40) / 40, 0, 1) : 0;
  parts.parameterStability = robustness ? (nbTested ? 10 * nbs / 100 : 5) : 0; // untested earns half: unknown, not proven
  parts.costExecution = robustness ? (robustness.sensitivity.commission2x > 0 ? 3 : 0) + (robustness.sensitivity.slippage2x > 0 ? 2 : 0) + (robustness.sensitivity.delay1 > 0 ? 2 : 0) + (advNet === undefined ? 3 : advKeep === null ? (advNet > 0 ? 3 : 0) : 3 * clamp((advKeep - 0.25) / 0.5, 0, 1)) : 0;
  parts.concentration = robustness ? (robustness.baseMetrics.topTradeShare <= policy.maxTopTradeShare ? 3 : 0) + (robustness.tests.find(t => t.name.startsWith("Net after removing top 5%")).pass ? 2 : 0) : 0;
  parts.crossMarket = ev.transfer ? (ev.transfer.profitFactor > 1 ? 5 : 0) : robustness ? (robustness.longOnly && robustness.shortOnly ? ((robustness.longOnly.netProfit > 0) + (robustness.shortOnly.netProfit > 0)) * 1.25 : 1.5) : 0;
  parts.forward = forward ? 5 * clamp(forward.trades / policy.forwardMinTrades, 0, 1) * (forward.drift && forward.drift.flag ? 0.3 : 1) : 0;
  const score = Object.values(parts).reduce((s, x) => s + x, 0);
  let grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 45 ? "C" : "D";
  const requiredFailed = gates.filter(g => g.required && g.pass === false).map(g => g.name);
  // Caps: a high score cannot outrank a specific red flag. Each cap lists why the grade is limited.
  const caps = [], ORDER = "ABCD";
  const cap = (max, why) => { caps.push({ max, why }); if (ORDER.indexOf(grade) < ORDER.indexOf(max)) grade = max; };
  if (advKeep !== null && advKeep <= 0) cap("D", "profit disappears under an adverse intrabar path");
  else if (advKeep !== null && advKeep < 0.5) cap("C", `only ${(advKeep * 100).toFixed(0)}% of profit survives an adverse intrabar path`);
  if (pfs.length) cap("B", "implausibly high profit factor");
  if (requiredFailed.length >= 2) cap("C", `${requiredFailed.length} required checks failed`);
  else if (requiredFailed.length === 1) cap("B", `required check failed: ${requiredFailed[0]}`);
  if (hard.length) grade = "F";
  const requiredMissing = gates.filter(g => g.required && g.pass === null).map(g => g.name);
  return { policy: policy.id, policyVersion: policy.version, score: Math.round(score * 10) / 10, parts, grade, caps, hardFails: hard, softConcerns: soft, gates, requiredFailed, requiredMissing, oosTrades, allTrades };
}
const fmt2 = x => (Number.isFinite(x) ? x.toFixed(2) : String(x));
