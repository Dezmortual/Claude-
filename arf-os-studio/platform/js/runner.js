// ARF-OS research runner: a deterministic, Pine-compatible bar-close backtester for SDL strategies.
//
// Execution model (spec §11.2): signals are evaluated on confirmed bar close; market orders fill at
// the next bar's open with adverse slippage; pyramiding 0; one stop and one target per trade, placed
// from the fill price. Intrabar order uses TradingView's broker-emulator assumption: if the high is
// closer to the open than the low, price went open→high→low→close, otherwise open→low→high→close.
// Stops are market orders (slipped); targets are limits (not slipped).

import { compile, parseExpression, paramValue, longestLookback } from "./sdl.js";
import { computeIndicator, source } from "./indicators.js";
import { rng } from "./util.js";

export const RUNNER_VERSION = "arf-runner/1.0.0";

export function prepare(sdl, bars, params, cache) {
  const val = spec => paramValue(spec, params, sdl);
  const series = {};
  for (const ind of sdl.indicators || []) series[ind.id] = computeIndicator(ind, bars, val, cache);
  const hours = cache && cache.get("__hour") || bars.t.map(t => new Date(t).getUTCHours());
  const dows = cache && cache.get("__dow") || bars.t.map(t => new Date(t).getUTCDay() + 1); // Pine: 1 = Sunday
  if (cache) { cache.set("__hour", hours); cache.set("__dow", dows); }
  const resolve = name => {
    if (name in series) return series[name];
    if (["open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4"].includes(name)) {
      const k = "__src_" + name;
      if (cache && cache.has(k)) return cache.get(k);
      const s = source(bars, name); if (cache) cache.set(k, s); return s;
    }
    if (name === "hour") return hours;
    if (name === "dayofweek") return dows;
    if (name === "bar_index") return i => i;
    const p = (sdl.parameters || []).find(x => x.key === name);
    if (p) return params && name in params ? params[name] : p.default;
    throw new Error("Unknown name " + name);
  };
  const sig = {};
  for (const k of ["longEntry", "shortEntry", "longExit", "shortExit"]) {
    const e = sdl.signals && sdl.signals[k];
    if (e) sig[k] = compile(parseExpression(e), resolve);
  }
  return { series, sig, val };
}

/**
 * @param {object} sdl validated SDL
 * @param {{t:number[],o,h,l,c,v}} bars
 * @param {object} params parameter values (missing keys use defaults)
 * @param {object} opts start/end bar indices [start, end), initialCapital, costMult, slipMult,
 *   entryDelay, skipProb, seed, directions, cache, recordEquity
 */
export function runBacktest(sdl, bars, params = {}, opts = {}) {
  const n = bars.c.length;
  const start = Math.max(0, opts.start ?? 0), end = Math.min(n, opts.end ?? n);
  const capital = opts.initialCapital ?? 10_000;
  const comm = ((sdl.costs.commissionValue || 0) / 100) * (opts.costMult ?? 1);
  const slip = (sdl.costs.slippageTicks || 0) * (sdl.costs.tickSize || 0) * (opts.slipMult ?? 1);
  const dirs = opts.directions || sdl.strategy.directions;
  const delay = opts.entryDelay || 0;
  const rand = opts.skipProb ? rng(opts.seed ?? 1) : null;
  const allowRev = !!(sdl.execution && sdl.execution.allowReversal);
  const { series, sig, val } = prepare(sdl, bars, params, opts.cache);
  const warm = Math.max(sdl.segments?.warmupBars ?? 0, longestLookback(sdl, params));
  const sizeFrac = (sdl.risk.sizePercent / 100) * (sdl.risk.leverage || 1);
  const sl = sdl.risk.stopLoss, tp = sdl.risk.takeProfit;
  const slVal = sl.valueParameter ? val(sl.valueParameter) : sl.value;
  const tpVal = tp.type === "none" ? null : tp.valueParameter ? val(tp.valueParameter) : tp.value;
  const atrSeries = sl.type === "atr_multiple" ? series[sl.atrIndicator] : null;
  const { o, h, l, c, t } = bars;

  let cash = capital, pos = null, pending = null, tradeNo = 0, conflicts = 0, skipped = 0;
  const trades = [], equity = opts.recordEquity === false ? null : [];

  const closePos = (i, price, reason, boundary = false) => {
    const fee = pos.qty * price * comm;
    const gross = pos.dir * (price - pos.entryPrice) * pos.qty;
    const net = gross - pos.entryFee - fee;
    cash += gross - fee; // entry fee was already deducted when the position opened
    trades.push({
      id: ++tradeNo, dir: pos.dir > 0 ? "long" : "short",
      entryIdx: pos.entryIdx, entryTime: t[pos.entryIdx], entryPrice: pos.entryPrice,
      exitIdx: i, exitTime: t[i], exitPrice: price, qty: pos.qty,
      gross, fees: pos.entryFee + fee, net, ret: net / pos.equityAtEntry,
      reason, entryReason: pos.reason, boundary,
      bars: i - pos.entryIdx, mae: pos.mae, mfe: pos.mfe, stop: pos.stop, target: pos.target
    });
    pos = null;
  };
  const openPos = (i, dir, signalIdx, reason) => {
    const price = o[i] + dir * slip;
    let dist;
    if (sl.type === "atr_multiple") dist = atrSeries[signalIdx] * slVal;
    else dist = price * (slVal / 100);
    if (!(dist > 0) || !(price > 0)) return;
    const qty = (cash * sizeFrac) / price;
    if (!(qty > 0)) return;
    const entryFee = qty * price * comm;
    cash -= entryFee;
    let target = null;
    if (tp.type === "risk_multiple") target = price + dir * dist * tpVal;
    else if (tp.type === "percent") target = price * (1 + dir * tpVal / 100);
    pos = { dir, qty, entryPrice: price, entryIdx: i, entryFee, stop: price - dir * dist, target, reason, mae: 0, mfe: 0, equityAtEntry: cash + entryFee };
  };

  const first = Math.max(start, 1);
  for (let i = first; i < end; i++) {
    // 1. Fill orders queued at a previous close.
    if (pending && pending.fillIdx === i) {
      const p = pending; pending = null;
      if (p.exit && pos) closePos(i, o[i] - pos.dir * slip, p.exit);
      if (p.entry && !pos) openPos(i, p.entry, p.signalIdx, p.reason);
    }
    // 2. Stop / target inside the bar.
    if (pos) {
      const d = pos.dir, stop = pos.stop, tgt = pos.target;
      const hitStopAtOpen = d > 0 ? o[i] <= stop : o[i] >= stop;
      const hitTgtAtOpen = tgt !== null && (d > 0 ? o[i] >= tgt : o[i] <= tgt);
      if (i !== pos.entryIdx && hitStopAtOpen) closePos(i, o[i] - d * slip, "stop_gap");
      else if (i !== pos.entryIdx && hitTgtAtOpen) closePos(i, o[i], "target_gap");
      else {
        const highFirst = Math.abs(h[i] - o[i]) < Math.abs(l[i] - o[i]);
        const stopHit = d > 0 ? l[i] <= stop : h[i] >= stop;
        const tgtHit = tgt !== null && (d > 0 ? h[i] >= tgt : l[i] <= tgt);
        // For a long, the target is on the high side; for a short, on the low side.
        const tgtFirst = d > 0 ? highFirst : !highFirst;
        if (stopHit && tgtHit) { if (tgtFirst) closePos(i, tgt, "target"); else closePos(i, stop - d * slip, "stop"); }
        else if (tgtHit) closePos(i, tgt, "target");
        else if (stopHit) closePos(i, stop - d * slip, "stop");
      }
    }
    if (pos) {
      const adverse = pos.dir > 0 ? (l[i] - pos.entryPrice) / pos.entryPrice : (pos.entryPrice - h[i]) / pos.entryPrice;
      const favour = pos.dir > 0 ? (h[i] - pos.entryPrice) / pos.entryPrice : (pos.entryPrice - l[i]) / pos.entryPrice;
      pos.mae = Math.min(pos.mae, adverse); pos.mfe = Math.max(pos.mfe, favour);
    }
    // 3. Window end: flatten at the last close.
    if (i === end - 1) {
      if (pos) closePos(i, c[i], "segment_end", true);
      if (equity) equity.push([t[i], cash]);
      break;
    }
    // 4. Evaluate signals on the confirmed close of bar i.
    if (i >= warm && !pending) {
      const L = dirs.includes("long") && sig.longEntry ? !!sig.longEntry(i) : false;
      const S = dirs.includes("short") && sig.shortEntry ? !!sig.shortEntry(i) : false;
      const fill = i + 1 + delay;
      if (pos) {
        const exitSig = pos.dir > 0 ? (sig.longExit && sig.longExit(i)) : (sig.shortExit && sig.shortExit(i));
        const opposite = pos.dir > 0 ? S && !L : L && !S;
        if (opposite && allowRev && fill < end) pending = { fillIdx: fill, exit: "reversal", entry: -pos.dir, signalIdx: i, reason: pos.dir > 0 ? "short_entry" : "long_entry" };
        else if (exitSig && fill < end) pending = { fillIdx: i + 1, exit: "exit_signal" };
      } else if (L && S) conflicts++;
      else if ((L || S) && fill < end) {
        if (rand && rand() < opts.skipProb) skipped++;
        else pending = { fillIdx: fill, entry: L ? 1 : -1, signalIdx: i, reason: L ? "long_entry" : "short_entry" };
      }
    }
    if (equity) equity.push([t[i], cash + (pos ? pos.dir * (c[i] - pos.entryPrice) * pos.qty : 0)]);
  }
  return {
    runner: RUNNER_VERSION, start, end, initialCapital: capital, finalEquity: cash,
    trades, equity, warmupBars: warm, conflicts, skipped,
    window: { from: t[start], to: t[end - 1] }
  };
}

// Buy-and-hold benchmark over the same window, with one round-trip commission.
export function buyAndHold(sdl, bars, start, end) {
  const comm = (sdl.costs.commissionValue || 0) / 100;
  const p0 = bars.o[Math.min(start + 1, end - 1)], p1 = bars.c[end - 1];
  return ((p1 * (1 - comm)) / (p0 * (1 + comm)) - 1) * 100;
}
