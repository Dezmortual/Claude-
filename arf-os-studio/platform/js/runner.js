// ARF-OS research runner: a deterministic, Pine-compatible bar-close backtester for SDL strategies.
//
// Execution model (spec §11.2): signals are evaluated on confirmed bar close; market orders fill at
// the next bar's open with adverse slippage (or at the signal bar's close when the SDL declares
// processOnClose, matching Pine's process_orders_on_close); pyramiding 0; one stop, one optional
// target and an optional trailing stop per trade, placed from the fill price. Intrabar order uses
// TradingView's broker-emulator assumption: if the high is closer to the open than the low, price
// went open→high→low→close, otherwise open→low→high→close (opts.pathMode "adverse" forces the
// unfavourable path and stops trails from ratcheting to intrabar extremes, for stress tests). Stops and trails are market orders (slipped); targets are
// limits (not slipped).

import { compile, parseExpression, paramValue, longestLookback } from "./sdl.js";
import { computeIndicator, source } from "./indicators.js";
import { rng } from "./util.js";

export const RUNNER_VERSION = "arf-runner/1.1.0";

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
  const onClose = !!(sdl.execution && sdl.execution.processOnClose);
  const adversePath = opts.pathMode === "adverse";
  // Trailing stop (Pine trail_points / trail_offset): arms once price reaches the activation level,
  // then trails the best price by the offset. ATR-based levels use the ATR of the previous bar,
  // like a strategy.exit() re-issued on every bar.
  const ts = sdl.risk.trailingStop || null;
  const tsPart = part => part && { type: part.type, v: part.valueParameter ? val(part.valueParameter) : part.value, atr: part.type === "atr_multiple" ? series[part.atrIndicator] : null };
  const tsAct = ts && tsPart(ts.activation), tsOff = ts && tsPart(ts.offset);
  const tsDist = (part, i, entry) => (part.type === "percent" ? entry * (part.v / 100) : (part.atr[i - 1] ?? part.atr[i]) * part.v);
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
  const openPos = (i, dir, signalIdx, reason, fillBase = o[i]) => {
    const price = fillBase + dir * slip;
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
    pos = { dir, qty, entryPrice: price, entryIdx: i, entryFee, stop: price - dir * dist, target, reason, mae: 0, mfe: 0, equityAtEntry: cash + entryFee, trailActive: false, peak: price, onCloseEntry: fillBase !== o[i] };
  };

  const first = Math.max(start, 1);
  for (let i = first; i < end; i++) {
    // 1. Fill orders queued at a previous close.
    if (pending && pending.fillIdx === i) {
      const p = pending; pending = null;
      if (p.exit && pos) closePos(i, o[i] - pos.dir * slip, p.exit);
      if (p.entry && !pos) openPos(i, p.entry, p.signalIdx, p.reason);
    }
    // 2. Stop / trail / target inside the bar, walking the assumed intrabar path.
    if (pos && !(pos.onCloseEntry && i === pos.entryIdx)) {
      const d = pos.dir, tgt = pos.target, entry = pos.entryPrice;
      const act = ts ? entry + d * tsDist(tsAct, i, entry) : null, off = ts ? tsDist(tsOff, i, entry) : null;
      const stopLevel = () => (pos.trailActive ? (d > 0 ? Math.max(pos.stop, pos.peak - off) : Math.min(pos.stop, pos.peak + off)) : pos.stop);
      const beyond = (p, lvl) => (d > 0 ? p <= lvl : p >= lvl);
      const reach = (p, lvl) => (d > 0 ? p >= lvl : p <= lvl);
      const sl0 = stopLevel();
      if (i !== pos.entryIdx && beyond(o[i], sl0)) closePos(i, o[i] - d * slip, pos.trailActive && sl0 !== pos.stop ? "trail_gap" : "stop_gap");
      else if (i !== pos.entryIdx && tgt !== null && reach(o[i], tgt)) closePos(i, o[i], "target_gap");
      else {
        const favFirst = adversePath ? false : (Math.abs(h[i] - o[i]) < Math.abs(l[i] - o[i])) === (d > 0);
        const fav = d > 0 ? h[i] : l[i], adv = d > 0 ? l[i] : h[i];
        const path = favFirst ? [fav, adv, c[i]] : [adv, fav, c[i]];
        let prev = o[i];
        for (const p of path) {
          if (!pos) break;
          if (reach(p, prev) && p !== prev) {
            // favourable leg: target first, then arm / ratchet the trail
            if (tgt !== null && reach(p, tgt)) { closePos(i, tgt, "target"); break; }
            // Adverse mode: a trail arms at its activation level and never ratchets to an intrabar
            // extreme (noise would hit a tight trail first); it only ratchets on closes, below.
            if (ts && !pos.trailActive && reach(p, act)) { pos.trailActive = true; pos.peak = adversePath ? act : p; }
            else if (!adversePath && pos.trailActive && reach(p, pos.peak)) pos.peak = p;
          } else {
            const lvl = stopLevel();
            if (beyond(p, lvl)) { closePos(i, lvl - d * slip, pos.trailActive && lvl !== pos.stop ? "trail" : "stop"); break; }
          }
          prev = p;
        }
        if (pos && adversePath && pos.trailActive && reach(c[i], pos.peak)) pos.peak = c[i];
      }
    }
    if (pos && !(pos.onCloseEntry && i === pos.entryIdx)) {
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
      const now = onClose && delay === 0; // process_orders_on_close: fill at this bar's close
      if (pos) {
        const exitSig = pos.dir > 0 ? (sig.longExit && sig.longExit(i)) : (sig.shortExit && sig.shortExit(i));
        const opposite = pos.dir > 0 ? S && !L : L && !S;
        if (opposite && allowRev && now) { const nd = -pos.dir; closePos(i, c[i] - pos.dir * slip, "reversal"); openPos(i, nd, i, nd > 0 ? "long_entry" : "short_entry", c[i]); }
        else if (opposite && allowRev && fill < end) pending = { fillIdx: fill, exit: "reversal", entry: -pos.dir, signalIdx: i, reason: pos.dir > 0 ? "short_entry" : "long_entry" };
        else if (exitSig && now) closePos(i, c[i] - pos.dir * slip, "exit_signal");
        else if (exitSig && fill < end) pending = { fillIdx: i + 1, exit: "exit_signal" };
      } else if (L && S) conflicts++;
      else if (L || S) {
        if (rand && rand() < opts.skipProb) skipped++;
        else if (now) openPos(i, L ? 1 : -1, i, L ? "long_entry" : "short_entry", c[i]);
        else if (fill < end) pending = { fillIdx: fill, entry: L ? 1 : -1, signalIdx: i, reason: L ? "long_entry" : "short_entry" };
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
