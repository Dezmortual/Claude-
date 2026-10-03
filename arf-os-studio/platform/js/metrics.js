// Independent metric calculations (spec §12.5). Every function works from the trade ledger and
// equity series alone, so the same code scores runner output and ingested TradingView exports.

import { mean, stdev, sum, median } from "./util.js";

export const METRICS_VERSION = "arf-metrics/1.0.0";
const DAY = 86_400_000;

export function drawdownSeries(equity) {
  let peak = -Infinity;
  return equity.map(([t, e]) => { peak = Math.max(peak, e); return [t, peak > 0 ? ((e - peak) / peak) * 100 : 0]; });
}

// Equity from a trade ledger when no bar-level curve exists (e.g. TradingView exports).
export function equityFromTrades(trades, initialCapital) {
  let e = initialCapital;
  const out = trades.length ? [[trades[0].entryTime, e]] : [];
  for (const tr of [...trades].sort((a, b) => a.exitTime - b.exitTime)) { e += tr.net; out.push([tr.exitTime, e]); }
  return out;
}

function dailyReturns(equity) {
  if (equity.length < 2) return [];
  const byDay = new Map();
  for (const [t, e] of equity) byDay.set(Math.floor(t / DAY), e);
  const days = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  const r = [];
  for (let i = 1; i < days.length; i++) {
    // carry the last value across missing days so weekends/gaps count as zero-return days
    for (let d = days[i - 1][0] + 1; d < days[i][0]; d++) r.push(0);
    r.push(days[i][1] / days[i - 1][1] - 1);
  }
  return r;
}

export function monthlyReturns(equity) {
  const out = [];
  let curKey = null, startE = null, lastE = null;
  for (const [t, e] of equity) {
    const d = new Date(t), key = d.getUTCFullYear() * 100 + d.getUTCMonth() + 1;
    if (key !== curKey) {
      if (curKey !== null) out.push({ month: curKey, ret: (lastE / startE - 1) * 100 });
      curKey = key; startE = lastE ?? e;
    }
    lastE = e;
  }
  if (curKey !== null) out.push({ month: curKey, ret: (lastE / startE - 1) * 100 });
  return out;
}

export function computeMetrics(result, { periodsPerYear = 365 } = {}) {
  const trades = result.trades || [];
  const cap = result.initialCapital;
  const equity = result.equity && result.equity.length ? result.equity : equityFromTrades(trades, cap);
  const nets = trades.map(t => t.net);
  const wins = nets.filter(x => x > 0), losses = nets.filter(x => x <= 0);
  const grossProfit = sum(wins), grossLoss = -sum(losses);
  const netProfit = sum(nets);
  const finalEq = equity.length ? equity[equity.length - 1][1] : cap;
  const dd = drawdownSeries(equity);
  let maxDD = 0, longestDD = 0, curStart = null;
  for (const [t, v] of dd) {
    maxDD = Math.min(maxDD, v);
    if (v < 0 && curStart === null) curStart = t;
    if (v === 0 && curStart !== null) { longestDD = Math.max(longestDD, t - curStart); curStart = null; }
  }
  if (curStart !== null && dd.length) longestDD = Math.max(longestDD, dd[dd.length - 1][0] - curStart);
  const spanMs = equity.length > 1 ? equity[equity.length - 1][0] - equity[0][0] : 0;
  const years = spanMs / (365.25 * DAY);
  const totalReturn = (finalEq / cap - 1) * 100;
  const cagr = years >= 0.5 && finalEq > 0 ? (Math.pow(finalEq / cap, 1 / years) - 1) * 100 : NaN;
  const dr = dailyReturns(equity);
  const sd = stdev(dr), dsd = Math.sqrt(mean(dr.map(x => Math.min(0, x) ** 2)));
  const sharpe = dr.length > 20 && sd > 0 ? (mean(dr) / sd) * Math.sqrt(periodsPerYear) : NaN;
  const sortino = dr.length > 20 && dsd > 0 ? (mean(dr) / dsd) * Math.sqrt(periodsPerYear) : NaN;
  const months = monthlyReturns(equity);
  const sortedNets = [...nets].sort((a, b) => b - a);
  let maxConsLoss = 0, maxConsWin = 0, cl = 0, cw = 0;
  for (const x of nets) { if (x > 0) { cw++; cl = 0; } else { cl++; cw = 0; } maxConsLoss = Math.max(maxConsLoss, cl); maxConsWin = Math.max(maxConsWin, cw); }
  const fees = sum(trades.map(t => t.fees || 0));
  const longs = trades.filter(t => t.dir === "long"), shorts = trades.filter(t => t.dir === "short");
  const barsInMarket = sum(trades.map(t => t.bars || 0));
  const totalBars = result.end !== undefined ? result.end - result.start : NaN;
  return {
    version: METRICS_VERSION,
    tradeCount: trades.length,
    netProfit, totalReturn, cagr,
    grossProfit, grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : NaN,
    winRate: trades.length ? (wins.length / trades.length) * 100 : NaN,
    avgWin: wins.length ? mean(wins) : NaN,
    avgLoss: losses.length ? mean(losses) : NaN,
    payoff: wins.length && losses.length ? mean(wins) / Math.abs(mean(losses)) : NaN,
    expectancy: trades.length ? netProfit / trades.length : NaN,
    maxDrawdown: maxDD,
    longestDrawdownDays: longestDD / DAY,
    sharpe, sortino,
    calmar: maxDD < 0 && !Number.isNaN(cagr) ? cagr / Math.abs(maxDD) : NaN,
    returnOverDD: maxDD < 0 ? totalReturn / Math.abs(maxDD) : NaN,
    positiveMonthsPct: months.length ? (months.filter(m => m.ret > 0).length / months.length) * 100 : NaN,
    medianMonthly: months.length ? median(months.map(m => m.ret)) : NaN,
    worstMonth: months.length ? Math.min(...months.map(m => m.ret)) : NaN,
    maxConsecutiveLosses: maxConsLoss, maxConsecutiveWins: maxConsWin,
    avgBarsHeld: trades.length ? barsInMarket / trades.length : NaN,
    exposurePct: totalBars > 0 ? (barsInMarket / totalBars) * 100 : NaN,
    feesTotal: fees,
    commissionShareOfGross: grossProfit > 0 ? (fees / grossProfit) * 100 : NaN,
    topTradeShare: netProfit > 0 && sortedNets.length ? (sortedNets[0] / netProfit) * 100 : NaN,
    longCount: longs.length, shortCount: shorts.length,
    longNet: sum(longs.map(t => t.net)), shortNet: sum(shorts.map(t => t.net)),
    boundaryTrades: trades.filter(t => t.boundary).length,
    years
  };
}

// Objective used for in-sample selection; declared in the plan before the search runs.
export function objective(m, minTrades) {
  if (!m.tradeCount) return -Infinity;
  const pf = Number.isFinite(m.profitFactor) ? m.profitFactor : 3;
  const samplePenalty = Math.min(1, m.tradeCount / minTrades);
  const ddPenalty = 1 / (1 + Math.abs(m.maxDrawdown) / 25);
  return (pf - 1) * samplePenalty * ddPenalty;
}
