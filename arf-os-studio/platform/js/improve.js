// Strategy improver: tries explicit, explainable changes (filters, stops, targets, direction, hours)
// round by round until the user's goals are met. No AI. Guarding against curve-fitting:
//  - candidates are ranked on the development segment only;
//  - a change is accepted only if it also holds up on the validation segment;
//  - the protected holdout is never evaluated here;
//  - every variant tried is counted and reported, and any improved version still needs a forward test.

import { runBacktest } from "./runner.js";
import { computeMetrics } from "./metrics.js";
import { buildSegments } from "./research.js";
import { validateSDL } from "./sdl.js";

export const IMPROVER_VERSION = "dezquant-improve/1.0.0";

// metric, comparison and the preset targets the UI offers.
export const GOALS = {
  pf: { label: "Profit factor", metric: "profitFactor", dir: 1, presets: [1.3, 1.5, 2], fmt: v => `≥ ${v}` },
  dd: { label: "Max drawdown", metric: "maxDrawdown", dir: 1, presets: [-25, -15, -10], fmt: v => `≤ ${Math.abs(v)}%` },
  wr: { label: "Win rate", metric: "winRate", dir: 1, presets: [45, 55, 65], fmt: v => `≥ ${v}%` },
  trades: { label: "Trades per segment", metric: "tradeCount", dir: 1, presets: [30, 60, 100], fmt: v => `≥ ${v}` },
  ret: { label: "Return per segment", metric: "totalReturn", dir: 1, presets: [5, 15, 30], fmt: v => `≥ ${v}%` }
};
const meets = (m, g) => { const x = m[GOALS[g.key].metric]; return Number.isFinite(x) ? x >= g.value : g.key === "pf" && x === Infinity; };

// Score for ranking: how many goals are met, then how close the unmet ones are (each capped at 1).
function score(m, goals) {
  if (!m || !(m.tradeCount >= 5)) return -1;
  let s = 0;
  for (const g of goals) {
    const x = m[GOALS[g.key].metric], t = g.value;
    if (meets(m, g)) { s += 1; continue; }
    if (!Number.isFinite(x)) continue;
    // partial credit: ratio of achieved to target, on a scale that works for negatives (drawdown)
    const span = Math.max(Math.abs(t), 1);
    s += Math.max(0, 1 - Math.abs(t - x) / span) * 0.8;
  }
  return s;
}

/* ---------------- Variant generation ---------------- */
const clone = x => structuredClone(x);
const uid = (sdl, base) => { let id = base, n = 2; const ids = new Set((sdl.indicators || []).map(i => i.id).concat((sdl.parameters || []).map(p => p.key))); while (ids.has(id)) id = base + "_" + n++; return id; };
const findInd = (sdl, type, fields) => (sdl.indicators || []).find(i => i.type === type && Object.entries(fields).every(([k, v]) => i[k] === v));
function ensureInd(sdl, type, fields, base) {
  const have = findInd(sdl, type, fields);
  if (have) return have.id;
  const id = uid(sdl, base);
  sdl.indicators.push({ id, type, ...fields });
  return id;
}
const andEntry = (sdl, dir, expr) => { const k = dir === "long" ? "longEntry" : "shortEntry"; if (sdl.signals[k]) sdl.signals[k] = `(${sdl.signals[k]}) AND (${expr})`; };
const paramOf = (sdl, key) => (sdl.parameters || []).find(p => p.key === key);
// Scale a numeric risk setting, whether it's a parameter or a fixed value; returns false if absent.
function scaleRisk(sdl, params, part, f) {
  if (!part) return false;
  if (part.valueParameter) {
    const p = paramOf(sdl, part.valueParameter); if (!p) return false;
    const cur = params[p.key] ?? p.default, next = +(cur * f).toFixed(3);
    params[p.key] = next; p.default = next; p.min = Math.min(p.min, next); p.max = Math.max(p.max, next);
    return true;
  }
  if (typeof part.value === "number") { part.value = +(part.value * f).toFixed(3); return true; }
  return false;
}

export function variants(sdl0, params0) {
  const out = [];
  const add = (id, label, why, fn) => {
    const sdl = clone(sdl0), params = { ...params0 };
    if (fn(sdl, params) === false) return;
    if (validateSDL(sdl).ok) out.push({ id, label, why, sdl, params });
  };
  const dirs = sdl0.strategy.directions;
  const intraday = !/^1?[DW]$/.test(String(sdl0.market?.timeframe || ""));
  for (const len of [200, 50]) add(`trend${len}`, `Trade with the trend (EMA ${len})`, `Only buy above, and only sell below, the ${len}-bar average: skips counter-trend trades.`, s => {
    if (s.signals.longEntry && /ema_trend|ema200/.test(s.signals.longEntry)) return false;
    const id = ensureInd(s, "ema", { source: "close", length: len }, `ema_trend${len}`);
    andEntry(s, "long", `close > ${id}`); andEntry(s, "short", `close < ${id}`);
  });
  for (const lvl of [20, 25]) add(`adx${lvl}`, `Only when trending (ADX > ${lvl})`, `Skips choppy, sideways markets where trend signals whipsaw.`, s => {
    const id = ensureInd(s, "adx", { length: 14 }, "adx14");
    andEntry(s, "long", `${id} > ${lvl}`); andEntry(s, "short", `${id} > ${lvl}`);
  });
  if (intraday) {
    add("hours_ldn_ny", "London and New York hours only", "Only opens trades 07:00–20:00 UTC, when volume and follow-through are highest.", s => { andEntry(s, "long", "hour >= 7 AND hour < 20"); andEntry(s, "short", "hour >= 7 AND hour < 20"); });
    add("hours_ny", "New York overlap only", "Only opens trades 12:00–17:00 UTC, the busiest hours for gold, indices and USD pairs.", s => { andEntry(s, "long", "hour >= 12 AND hour < 17"); andEntry(s, "short", "hour >= 12 AND hour < 17"); });
  }
  add("no_monday_friday_late", "Skip weekends' edges", "Avoids Monday before 06:00 UTC and Friday after 18:00 UTC, when gaps and thin liquidity hit stops.", s => {
    if (!intraday) return false;
    const e = "NOT ((dayofweek == 2 AND hour < 6) OR (dayofweek == 6 AND hour >= 18))";
    andEntry(s, "long", e); andEntry(s, "short", e);
  });
  if (dirs.length === 2) {
    add("long_only", "Long trades only", "Drops the short side, which often fights a market's long-term drift.", s => { s.strategy.directions = ["long"]; s.signals.shortEntry = ""; });
    add("short_only", "Short trades only", "Keeps only the short side.", s => { s.strategy.directions = ["short"]; s.signals.longEntry = ""; });
  }
  for (const [f, w] of [[1.5, "much wider"], [1.25, "wider"], [0.75, "tighter"]]) add(`stop_x${f}`, `Stop ${w} (×${f})`, f > 1 ? "Gives trades more room so normal noise stops them out less often." : "Cuts losers sooner.", (s, p) => scaleRisk(s, p, s.risk.stopLoss, f));
  const tp = sdl0.risk.takeProfit || { type: "none" };
  if (tp.type === "none") for (const r of [2, 3]) add(`target_${r}r`, `Add a ${r}R profit target`, `Takes profit at ${r}× the amount risked instead of waiting for an exit signal.`, s => { s.risk.takeProfit = { type: "risk_multiple", value: r }; });
  else for (const [f, w] of [[1.5, "further"], [0.75, "closer"]]) add(`target_x${f}`, `Profit target ${w} (×${f})`, f > 1 ? "Lets winners run further." : "Banks profit sooner, usually raising the win rate.", (s, p) => scaleRisk(s, p, s.risk.takeProfit, f));
  if (!sdl0.risk.trailingStop) add("trail_atr", "Add an ATR trailing stop", "Once a trade is 1.5 ATR in profit, trails the stop 1 ATR behind price to lock gains.", s => {
    const atr = ensureInd(s, "atr", { length: 14 }, "atr14");
    s.risk.trailingStop = { activation: { type: "atr_multiple", value: 1.5, atrIndicator: atr }, offset: { type: "atr_multiple", value: 1, atrIndicator: atr } };
  });
  else add("no_trail", "Remove the trailing stop", "Tight trails can turn winners into small exits; this tests without it.", s => { delete s.risk.trailingStop; });
  if (sdl0.execution?.allowReversal) add("no_reversal", "Don't flip on opposite signals", "Closes only by stop, target or exit signal, instead of reversing straight into the other direction.", s => { s.execution.allowReversal = false; });
  return out;
}

/* ---------------- Evaluation and the improvement loop ---------------- */
export function evaluate(sdl, bars, params) {
  const segs = buildSegments(bars.c.length, sdl);
  const run = seg => { try { return computeMetrics(runBacktest(sdl, bars, params, { ...seg, recordEquity: true })); } catch (_) { return null; } };
  return { development: run(segs.development), validation: run(segs.validation) };
}
const slim = m => m && { tradeCount: m.tradeCount, profitFactor: m.profitFactor, winRate: m.winRate, maxDrawdown: m.maxDrawdown, totalReturn: m.totalReturn, netProfit: m.netProfit };

/**
 * goals: [{ key: "pf"|"dd"|"wr"|"trades"|"ret", value }]
 * Returns { rounds: [...], best: { sdl, params, changes, dev, val }, tried, goalsMet }.
 */
export function improve(sdl0, bars, params0, goals, { maxRounds = 4, progress = () => {} } = {}) {
  let cur = { sdl: clone(sdl0), params: { ...params0 }, changes: [] };
  const base = evaluate(cur.sdl, bars, cur.params);
  cur.dev = base.development; cur.val = base.validation;
  // A change can't "meet the goals" by trading almost never: each segment must keep a fair sample.
  const minDev = Math.max(15, Math.floor(0.4 * (base.development?.tradeCount || 0))), minVal = Math.max(8, Math.floor(0.4 * (base.validation?.tradeCount || 0)));
  const enough = x => (x.dev?.tradeCount || 0) >= minDev && (x.val?.tradeCount || 0) >= minVal;
  const allMet = x => enough(x) && goals.every(g => x.dev && x.val && meets(x.dev, g) && meets(x.val, g));
  const rounds = [];
  let tried = 0;
  const used = new Set();
  for (let r = 1; r <= maxRounds && !allMet(cur); r++) {
    progress(`Round ${r}: trying changes`);
    const cands = variants(cur.sdl, cur.params).filter(v => !used.has(v.id));
    const rows = [];
    for (const v of cands) {
      const e = evaluate(v.sdl, bars, v.params); tried++;
      const row = { ...v, dev: e.development, val: e.validation, devScore: score(e.development, goals), valScore: score(e.validation, goals) };
      row.tooFew = !enough(row);
      rows.push(row);
    }
    rows.sort((a, b) => b.devScore - a.devScore);
    const curDev = score(cur.dev, goals), curVal = score(cur.val, goals);
    // Accept the best development improvement that does not get worse on validation.
    const pick = rows.find(x => !x.tooFew && x.devScore > curDev + 1e-9 && x.valScore >= curVal - 1e-9);
    rounds.push({ round: r, from: cur.changes.map(c => c.label), candidates: rows.map(x => ({ id: x.id, label: x.label, why: x.why, dev: slim(x.dev), val: slim(x.val), devScore: +x.devScore.toFixed(3), valScore: +x.valScore.toFixed(3), tooFew: x.tooFew, picked: x === pick })), picked: pick ? pick.label : null });
    if (!pick) break;
    used.add(pick.id);
    cur = { sdl: pick.sdl, params: pick.params, changes: [...cur.changes, { id: pick.id, label: pick.label, why: pick.why }], dev: pick.dev, val: pick.val };
  }
  return {
    version: IMPROVER_VERSION, goals, tried, rounds, minTrades: { development: minDev, validation: minVal },
    baseline: { dev: slim(base.development), val: slim(base.validation) },
    best: { sdl: cur.sdl, params: cur.params, changes: cur.changes, dev: slim(cur.dev), val: slim(cur.val) },
    goalsMet: goals.map(g => ({ ...g, dev: !!(cur.dev && meets(cur.dev, g)), val: !!(cur.val && meets(cur.val, g)) })),
    allMet: allMet(cur)
  };
}
