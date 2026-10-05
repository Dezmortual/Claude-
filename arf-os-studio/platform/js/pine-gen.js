// Free, deterministic SDL → Pine Script v6 generator. No AI involved.
//
// It mirrors the research runner (runner.js) so TradingView reproduces the backtest as closely as
// Pine allows: signals on confirmed bar closes, market orders on the next bar's open (or the signal
// bar's close with process_orders_on_close), one position at a time, reversals on an opposite
// signal when the SDL allows them, an ATR stop sized from the signal bar's ATR or a percent stop
// from the fill, an R-multiple or percent target, and an optional trailing stop. hour/dayofweek and
// the daily VWAP use UTC, like the runner.

import { parseExpression } from "./sdl.js";

export const PINE_GEN_VERSION = "dezquant-pinegen/1.0.0";

// Pine keywords and built-in variables an SDL id must not shadow.
const RESERVED = new Set(("and or not if else for while switch var varip true false na import export method type enum " +
  "open high low close volume time hl2 hlc3 ohlc4 hlcc4 bar_index hour minute second dayofweek dayofmonth month year " +
  "timeframe syminfo strategy ta math str array map matrix color line label box table plot input request alert " +
  // names the generated script itself uses
  "startDate endDate inWindow longEntry shortEntry longExit shortExit goLong goShort sigAtr alertBase dist d0 stopPrice targetPrice").split(" "));

const pineStr = s => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const num = x => (Number.isInteger(x) ? String(x) : String(+x.toFixed(10)));

export function generatePine(sdl, { ids = {} } = {}) {
  const notes = [];
  const names = new Map(); // SDL id → Pine identifier
  const pineName = id => {
    if (names.has(id)) return names.get(id);
    let n = String(id).replace(/[^A-Za-z0-9_]/g, "_");
    if (/^[0-9]/.test(n)) n = "_" + n;
    if (RESERVED.has(n)) n += "_";
    names.set(id, n);
    return n;
  };
  const params = new Map((sdl.parameters || []).map(p => [p.key, p]));
  for (const p of params.values()) pineName(p.key);

  // A number, a {parameter} reference or a parameter key string → Pine expression.
  const val = (spec, { int = false } = {}) => {
    let key = null;
    if (spec && typeof spec === "object" && spec.parameter) key = spec.parameter;
    else if (typeof spec === "string" && params.has(spec)) key = spec;
    if (key) { const p = params.get(key); const n = pineName(key); return int && p.type !== "int" ? `int(${n})` : n; }
    const x = typeof spec === "string" ? +spec : spec;
    if (typeof x !== "number" || Number.isNaN(x)) throw new Error(`Unsupported value ${JSON.stringify(spec)}`);
    return int ? String(Math.round(x)) : num(x);
  };
  const SRC = new Set(["open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4"]);
  const src = s => { if (!SRC.has(s)) throw new Error(`Unsupported source "${s}"`); return s; };

  /* ---- Indicators ---- */
  const indLines = [];
  for (const ind of sdl.indicators || []) {
    const n = pineName(ind.id), L = () => val(ind.length, { int: true });
    switch (ind.type) {
      case "ema": case "sma": case "rma": case "wma": case "rsi": case "highest": case "lowest": case "stdev": case "roc":
        indLines.push(`${n} = ta.${ind.type}(${src(ind.source)}, ${L()})`); break;
      case "atr": indLines.push(`${n} = ta.atr(${L()})`); break;
      case "bb_upper": case "bb_lower":
        indLines.push(`${n} = ta.sma(${src(ind.source)}, ${L()}) ${ind.type === "bb_upper" ? "+" : "-"} ${val(ind.mult)} * ta.stdev(${src(ind.source)}, ${L()})`); break;
      case "zscore": indLines.push(`${n} = (${src(ind.source)} - ta.sma(${src(ind.source)}, ${L()})) / ta.stdev(${src(ind.source)}, ${L()})`); break;
      case "macd": indLines.push(`${n} = ta.ema(${src(ind.source)}, ${val(ind.fast, { int: true })}) - ta.ema(${src(ind.source)}, ${val(ind.slow, { int: true })})`); break;
      case "macd_signal": indLines.push(`${n} = ta.ema(ta.ema(${src(ind.source)}, ${val(ind.fast, { int: true })}) - ta.ema(${src(ind.source)}, ${val(ind.slow, { int: true })}), ${val(ind.signal, { int: true })})`); break;
      case "adx": indLines.push(`[${n}_diPlus, ${n}_diMinus, ${n}] = ta.dmi(${L()}, ${L()})`); break;
      case "volume_sma": indLines.push(`${n} = ta.sma(volume, ${L()})`); break;
      case "vwap_daily": indLines.push(`${n} = ta.vwap(${src(ind.source || "hlc3")}, ta.change(dayofmonth(time, "UTC")) != 0)`); break;
      default: throw new Error(`Indicator type "${ind.type}" has no Pine translation`);
    }
  }

  /* ---- Signal expressions ---- */
  const helpers = []; let hN = 0;
  const hoist = code => { const h = `_h${++hN}`; helpers.push(`${h} = ${code}`); return h; };
  const isBool = n => ["cmp", "logic", "not"].includes(n.k) || (n.k === "num" && n.bool) || (n.k === "call" && ["crosses_above", "crosses_below", "rising", "falling"].includes(n.fn));
  const asBool = n => (isBool(n) ? tr(n) : `(${tr(n)} != 0)`);
  const series = n => (n.k === "id" ? tr(n) : hoist(tr(n))); // something history can be taken from
  const tr = n => {
    switch (n.k) {
      case "num": return n.bool ? (n.v ? "true" : "false") : num(n.v);
      case "id":
        if (SRC.has(n.v) || n.v === "bar_index") return n.v;
        if (n.v === "hour") return `hour(time, "UTC")`;
        if (n.v === "dayofweek") return `dayofweek(time, "UTC")`;
        return pineName(n.v);
      case "lag": return `${series(n.e)}[${n.n}]`;
      case "neg": return `-(${tr(n.e)})`;
      case "not": return `not ${asBool(n.e)}`;
      case "arith": return `(${tr(n.l)} ${n.op} ${tr(n.r)})`;
      case "cmp": return `(${tr(n.l)} ${n.op} ${tr(n.r)})`;
      case "logic": return `(${asBool(n.l)} ${n.op === "AND" ? "and" : "or"} ${asBool(n.r)})`;
      case "call": {
        const a = n.args;
        if (n.fn === "crosses_above") return `ta.crossover(${tr(a[0])}, ${tr(a[1])})`;
        if (n.fn === "crosses_below") return `ta.crossunder(${tr(a[0])}, ${tr(a[1])})`;
        if (n.fn === "abs") return `math.abs(${tr(a[0])})`;
        if (n.fn === "min" || n.fn === "max") return `math.${n.fn}(${tr(a[0])}, ${tr(a[1])})`;
        if (n.fn === "rising" || n.fn === "falling") {
          // The runner's rising(x, n) means n consecutive higher values (not ta.rising's "above every earlier value").
          const s = series(a[0]), k = a[1].v, op = n.fn === "rising" ? ">" : "<";
          return "(" + Array.from({ length: k }, (_, j) => `${j ? `${s}[${j}]` : s} ${op} ${s}[${j + 1}]`).join(" and ") + ")";
        }
        throw new Error(`Function ${n.fn}() has no Pine translation`);
      }
    }
    throw new Error("Unsupported expression");
  };
  const sigs = {};
  for (const k of ["longEntry", "shortEntry", "longExit", "shortExit"]) {
    const e = sdl.signals && sdl.signals[k];
    sigs[k] = e && String(e).trim() ? asBool(parseExpression(e)) : "false";
  }

  /* ---- Risk ---- */
  const dirs = sdl.strategy.directions || [];
  const canLong = dirs.includes("long"), canShort = dirs.includes("short");
  const r = sdl.risk, sl = r.stopLoss, tp = r.takeProfit || { type: "none" }, ts = r.trailingStop || null;
  const lev = r.leverage || 1;
  const pv = part => (part.valueParameter ? val(part.valueParameter) : val(part.value));
  const atrOf = part => {
    const id = part.atrIndicator;
    if (!id || !(sdl.indicators || []).some(i => i.id === id && i.type === "atr")) throw new Error(`ATR indicator "${id}" not found`);
    return pineName(id);
  };
  // `base` is the entry price: the fill (strategy.position_avg_price) once known, the signal close before.
  const stopDist = base => (sl.type === "atr_multiple" ? `sigAtr * ${pv(sl)}` : `${base} * ${pv(sl)} / 100`);
  const tpLine = (dir, base, d) => (tp.type === "risk_multiple" ? `${base} ${dir > 0 ? "+" : "-"} ${d} * ${pv(tp)}` : tp.type === "percent" ? `${base} * (1 ${dir > 0 ? "+" : "-"} ${pv(tp)} / 100)` : "na");
  const tsTicks = (part, base) => `math.max(1, math.round(${part.type === "atr_multiple" ? `${atrOf(part)} * ${pv(part)}` : `${base} * ${pv(part)} / 100`} / syminfo.mintick))`;
  const trailArgs = base => (ts ? `, trail_points = ${tsTicks(ts.activation, base)}, trail_offset = ${tsTicks(ts.offset, base)}` : "");
  const onClose = !!(sdl.execution && sdl.execution.processOnClose);
  const allowRev = !!(sdl.execution && sdl.execution.allowReversal);
  if (tp.type === "percent" && ts) notes.push("Percent target and trailing stop are combined in one strategy.exit().");
  if ((sdl.indicators || []).some(i => i.type === "vwap_daily")) notes.push("VWAP resets at 00:00 UTC, like the research runner (TradingView's own VWAP anchor follows the exchange session).");
  if ((sdl.segments?.warmupBars || 0) > 0) notes.push(`The research runner skips the first ${sdl.segments.warmupBars}+ warm-up bars; use the Start date input to compare the same period.`);

  /* ---- Source ---- */
  const L = [];
  L.push("//@version=6");
  L.push(`// ARF-OS Strategy ID: ${ids.strategyId || "manual"}`);
  L.push(`// Strategy Version ID: ${ids.strategyVersionId || "draft"}`);
  L.push(`// SDL Hash: ${ids.sdlHash || "n/a"}`);
  L.push(`// Parent Version ID: ${ids.parentVersionId || "none"} | Campaign ID: ${ids.campaignId || "none"}`);
  L.push(`// Pine Version 6 | Generated by DezQuant free Pine generator (${PINE_GEN_VERSION}), no AI | Human reviewed: false`);
  L.push(`// Market: ${(sdl.market?.symbols || []).join(", ") || "any"} · ${sdl.market?.timeframe || ""}`);
  L.push(`strategy(${pineStr(sdl.strategy.name)}, overlay = true, initial_capital = 10000, currency = currency.USD,`);
  L.push(`     commission_type = strategy.commission.percent, commission_value = ${num(sdl.costs.commissionValue || 0)}, slippage = ${Math.round(sdl.costs.slippageTicks || 0)},`);
  L.push(`     default_qty_type = strategy.percent_of_equity, default_qty_value = ${num(r.sizePercent * lev)}, margin_long = ${num(100 / lev)}, margin_short = ${num(100 / lev)},`);
  L.push(`     pyramiding = 0, calc_on_every_tick = false, process_orders_on_close = ${onClose}, calc_on_order_fills = false)`);
  L.push("");
  L.push("// ─── Inputs ───");
  for (const p of params.values()) {
    const fn = p.type === "int" ? "input.int" : "input.float";
    const f = x => (p.type === "int" ? String(Math.round(x)) : num(x));
    L.push(`${pineName(p.key)} = ${fn}(${f(p.default)}, ${pineStr(p.key)}, minval = ${f(p.min)}, maxval = ${f(p.max)}, step = ${f(p.step)}, group = "Parameters")`);
  }
  L.push(`startDate = input.time(timestamp("01 Jan 2000 00:00 +0000"), "Start", group = "Date window")`);
  L.push(`endDate = input.time(timestamp("31 Dec 2099 23:59 +0000"), "End", group = "Date window")`);
  L.push("inWindow = time >= startDate and time <= endDate");
  L.push("");
  L.push("// ─── Indicators ───");
  L.push(...indLines);
  L.push("");
  L.push("// ─── Signals (evaluated on confirmed bar closes) ───");
  L.push(...helpers);
  L.push(`longEntry = ${canLong ? sigs.longEntry : "false"}`);
  L.push(`shortEntry = ${canShort ? sigs.shortEntry : "false"}`);
  L.push(`longExit = ${sigs.longExit}`);
  L.push(`shortExit = ${sigs.shortExit}`);
  L.push("goLong = longEntry and not shortEntry");
  L.push("goShort = shortEntry and not longEntry");
  L.push("");
  L.push("// ─── Orders ───");
  L.push("var float sigAtr = na");
  L.push(`alertBase = '{"schema":"arf.signal.v1","deploymentId":"{{DEPLOYMENT_ID}}","strategyVersionId":"${ids.strategyVersionId || "draft"}","symbol":"' + syminfo.ticker + '","timeframe":"' + timeframe.period + '","barTime":' + str.tostring(time) + ',"price":' + str.tostring(close)`);
  L.push("if barstate.isconfirmed and inWindow");
  const enter = (dir, indent) => {
    const id = dir > 0 ? "Long" : "Short";
    const out = [];
    if (sl.type === "atr_multiple") out.push(`${indent}sigAtr := ${atrOf(sl)}`);
    out.push(`${indent}strategy.entry(${pineStr(id)}, strategy.${dir > 0 ? "long" : "short"})`);
    // Place the stop/target with the entry (estimated from this close) so it protects the fill bar;
    // from the next bar on it is re-issued from the actual fill price below.
    out.push(`${indent}d0 = ${stopDist("close")}`);
    out.push(`${indent}strategy.exit(${pineStr(id + " exit")}, from_entry = ${pineStr(id)}, stop = close ${dir > 0 ? "-" : "+"} d0, limit = ${tpLine(dir, "close", "d0")}${trailArgs("close")})`);
    out.push(`${indent}alert(alertBase + ',"eventType":"${dir > 0 ? "long_entry" : "short_entry"}"}', alert.freq_once_per_bar_close)`);
    return out;
  };
  // Only directions the SDL allows get order code at all.
  L.push("    if strategy.position_size == 0");
  if (canLong) { L.push("        if goLong"); L.push(...enter(1, "            ")); }
  if (canShort) { L.push(`        ${canLong ? "else if" : "if"} goShort`); L.push(...enter(-1, "            ")); }
  if (canLong) {
    L.push("    else if strategy.position_size > 0");
    if (allowRev && canShort) { L.push("        if goShort"); L.push(...enter(-1, "            ")); L.push("        else if longExit"); }
    else L.push("        if longExit");
    L.push(`            strategy.close("Long")`);
    L.push(`            alert(alertBase + ',"eventType":"long_exit"}', alert.freq_once_per_bar_close)`);
  }
  if (canShort) {
    L.push("    else if strategy.position_size < 0");
    if (allowRev && canLong) { L.push("        if goLong"); L.push(...enter(1, "            ")); L.push("        else if shortExit"); }
    else L.push("        if shortExit");
    L.push(`            strategy.close("Short")`);
    L.push(`            alert(alertBase + ',"eventType":"short_exit"}', alert.freq_once_per_bar_close)`);
  }
  L.push("");
  L.push("// ─── Stop, target and trailing stop, from the fill price ───");
  L.push(`float dist = strategy.position_size != 0 ? ${stopDist("strategy.position_avg_price")} : na`);
  L.push("float stopPrice = strategy.position_size > 0 ? strategy.position_avg_price - dist : strategy.position_size < 0 ? strategy.position_avg_price + dist : na");
  L.push(`float targetPrice = strategy.position_size > 0 ? ${tpLine(1, "strategy.position_avg_price", "dist")} : strategy.position_size < 0 ? ${tpLine(-1, "strategy.position_avg_price", "dist")} : na`);
  const trail = trailArgs("strategy.position_avg_price");
  if (canLong) L.push("if strategy.position_size > 0");
  if (canLong) L.push(`    strategy.exit("Long exit", from_entry = "Long", stop = stopPrice, limit = targetPrice${trail})`);
  if (canShort) L.push("if strategy.position_size < 0");
  if (canShort) L.push(`    strategy.exit("Short exit", from_entry = "Short", stop = stopPrice, limit = targetPrice${trail})`);
  L.push("");
  L.push(`plot(stopPrice, "Stop", color = color.new(color.red, 0), style = plot.style_linebr)`);
  L.push(`plot(targetPrice, "Target", color = color.new(color.green, 0), style = plot.style_linebr)`);
  return { source: L.join("\n") + "\n", notes };
}
