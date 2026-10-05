import test from "node:test";
import assert from "node:assert/strict";
import { syntheticBars } from "../js/synthetic.js";
import { validateSDL, SDL_TEMPLATE, parseExpression, compile, parameterGrid, gridSize } from "../js/sdl.js";
import { runBacktest } from "../js/runner.js";
import { computeMetrics } from "../js/metrics.js";
import { ema, rsi, sma, atr } from "../js/indicators.js";
import { runBacktestStage, robustnessSuite, runHoldout, evaluateEvidence } from "../js/research.js";
import { integrityReport } from "../js/data.js";
import { lintPine, fixPineConstants } from "../js/pine-lint.js";
import { parseTradingViewTrades, parity } from "../js/tv.js";

const bars = syntheticBars({ n: 3000, seed: 3 });
const sdl = structuredClone(SDL_TEMPLATE);

test("template SDL validates", () => {
  const v = validateSDL(sdl);
  assert.equal(v.ok, true, v.errors.join("\n"));
});

test("SDL validation catches errors", () => {
  const bad = structuredClone(sdl);
  bad.signals.longEntry = "crosses_above(fast, nope)";
  bad.execution.pyramiding = 2;
  bad.parameters[0].default = 999;
  const v = validateSDL(bad);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => e.includes("nope")));
  assert.ok(v.errors.some(e => e.includes("pyramiding")));
  assert.ok(v.errors.some(e => e.includes("default outside")));
});

test("expression grammar", () => {
  const close = [1, 2, 3, 2, 5];
  const f = compile(parseExpression("close > close[1] AND NOT (close == 3)"), n => (n === "close" ? close : NaN));
  assert.deepEqual([0, 1, 2, 3, 4].map(f), [false, true, false, false, true]);
  assert.throws(() => parseExpression("close[-1]"));
  assert.throws(() => parseExpression("close >"));
});

test("indicators match reference values", () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.deepEqual([...sma(x, 3)].slice(2, 4), [2, 3]);
  const e = ema(x, 3); // seeded with sma(3)=2 at index 2, alpha .5
  assert.equal(e[2], 2); assert.equal(e[3], 3); assert.equal(e[4], 4);
  const r = rsi(x, 3); assert.equal(r[9], 100);
  const a = atr({ h: [2, 3, 4, 5], l: [1, 1, 2, 3], c: [1.5, 2.5, 3.5, 4.5] }, 2);
  assert.ok(Number.isNaN(a[0])); assert.equal(a[1], 1.5);
});

test("grid sampling respects cap and includes defaults", () => {
  assert.equal(gridSize(sdl), 7 * 6 * 5 * 5);
  const g = parameterGrid(sdl, 100);
  assert.equal(g.length, 100);
  assert.deepEqual(g[0], { fast_length: 20, slow_length: 100, stop_atr: 2, target_r: 2 });
});

test("runner produces consistent ledger and equity", () => {
  const r = runBacktest(sdl, bars, {}, {});
  assert.ok(r.trades.length > 10);
  const net = r.trades.reduce((s, t) => s + t.net, 0);
  assert.ok(Math.abs(r.finalEquity - (10000 + net)) < 1e-6);
  for (const t of r.trades) {
    assert.ok(t.entryIdx > r.warmupBars);
    assert.ok(t.exitIdx >= t.entryIdx);
    if (t.dir === "long") assert.ok(t.stop < t.entryPrice);
  }
  // no overlapping positions
  for (let i = 1; i < r.trades.length; i++) assert.ok(r.trades[i].entryIdx >= r.trades[i - 1].exitIdx);
  const m = computeMetrics(r);
  assert.equal(m.tradeCount, r.trades.length);
  assert.ok(m.maxDrawdown <= 0);
});

test("higher costs never improve results", () => {
  const a = runBacktest(sdl, bars, {}, {}), b = runBacktest(sdl, bars, {}, { costMult: 3 });
  assert.ok(b.finalEquity <= a.finalEquity);
});

test("full backtest stage, robustness and evidence", async () => {
  const bt = await runBacktestStage(sdl, bars, "discovery");
  assert.ok(bt.smoke.checks.length >= 5);
  assert.ok(bt.search.tried > 0);
  assert.ok(bt.walkForward.folds.length >= 3);
  const rob = robustnessSuite(sdl, bars, bt.selectedParams, "discovery");
  assert.ok(rob.tests.length > 10);
  const ho = runHoldout(sdl, bars, bt.selectedParams);
  const ds = { integrity: integrityReport(bars, "240") };
  const ev = evaluateEvidence({ dataset: ds, backtest: bt, robustness: rob, holdout: ho, sdl }, "discovery");
  assert.ok(["A", "B", "C", "D", "F"].includes(ev.grade));
  assert.ok(ev.score >= 0 && ev.score <= 100);
  assert.ok(ev.gates.length >= 10);
});

test("grade caps: adverse-path dependence, untested neighbours, implausible PF", async () => {
  const bt = await runBacktestStage(sdl, bars, "discovery");
  const rob = robustnessSuite(sdl, bars, bt.selectedParams, "discovery");
  const ho = runHoldout(sdl, bars, bt.selectedParams);
  const ds = { integrity: integrityReport(bars, "240") };
  const rank = g => "ABCDF".indexOf(g);
  // Profit mostly from intrabar ordering: grade can be at most C.
  const r1 = structuredClone(rob);
  r1.baseMetrics.netProfit = 4000; r1.sensitivity.adversePath = 600;
  const e1 = evaluateEvidence({ dataset: ds, backtest: bt, robustness: r1, holdout: ho, sdl }, "discovery");
  assert.ok(rank(e1.grade) >= rank("C"), e1.grade);
  assert.ok(e1.caps.some(c => /adverse intrabar/.test(c.why)));
  assert.ok(e1.softConcerns.some(c => /15% of the profit survives/.test(c)));
  // Profit gone under the adverse path: at most D.
  const r2 = structuredClone(rob); r2.baseMetrics.netProfit = 4000; r2.sensitivity.adversePath = -10;
  assert.ok(rank(evaluateEvidence({ dataset: ds, backtest: bt, robustness: r2, holdout: ho, sdl }, "discovery").grade) >= rank("D"));
  // No tunable parameters: the neighbour gate is "not tested", not a pass, and earns half credit.
  const r3 = structuredClone(rob); r3.neighbourSurvival = null;
  const e3 = evaluateEvidence({ dataset: ds, backtest: bt, robustness: r3, holdout: ho, sdl }, "discovery");
  const g3 = e3.gates.find(g => g.name.startsWith("Neighbour survival"));
  assert.equal(g3.pass, null); assert.equal(g3.required, false);
  assert.equal(e3.parts.parameterStability, 5);
  // Validation PF of 40 is flagged and caps the grade at B.
  const b4 = structuredClone(bt); b4.validation.metrics.profitFactor = 40; b4.validation.metrics.tradeCount = 50;
  const e4 = evaluateEvidence({ dataset: ds, backtest: b4, robustness: rob, holdout: ho, sdl }, "discovery");
  assert.ok(rank(e4.grade) >= rank("B"));
  assert.ok(e4.softConcerns.some(c => /Implausibly high profit factor on validation/.test(c)));
});

test("integrity report flags duplicates and gaps", () => {
  const b = syntheticBars({ n: 800 });
  b.t[100] = b.t[99];
  b.t.splice(300, 50); b.o.splice(300, 50); b.h.splice(300, 50); b.l.splice(300, 50); b.c.splice(300, 50); b.v.splice(300, 50);
  const r = integrityReport(b, "240");
  assert.ok(r.errors.some(e => e.includes("duplicate")));
  assert.ok(r.missing >= 50);
});

test("pine lint", () => {
  const bad = `//@version=5\nindicator("x")\nh = request.security(syminfo.tickerid, "D", high, lookahead=barmerge.lookahead_on)\nplot(close, offset=-2)`;
  const r = lintPine(bad);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => f.rule === "lookahead_on" && f.severity === "error"));
  assert.ok(r.findings.some(f => f.rule === "negative-offset"));
  const good = `//@version=6
// ARF-OS Strategy ID: x
strategy("ok", overlay=true, initial_capital=10000, currency=currency.USD, commission_type=strategy.commission.percent, commission_value=0.06, slippage=2, default_qty_type=strategy.percent_of_equity, default_qty_value=10, pyramiding=0, margin_long=100, margin_short=100, calc_on_every_tick=false, process_orders_on_close=false)
fast_length = input.int(20, "Fast", minval=10, maxval=40)
slow_length = input.int(100, "Slow", minval=60, maxval=160)
stop_atr = input.float(2.0, "Stop ATR", minval=1, maxval=3)
target_r = input.float(2.0, "Target R", minval=1, maxval=3)
startTime = input.time(timestamp("2020-01-01"), "Start")
f = ta.ema(close, fast_length)
s = ta.ema(close, slow_length)
a = ta.atr(14)
if barstate.isconfirmed and ta.crossover(f, s) and time >= startTime
    strategy.entry("L", strategy.long)
if barstate.isconfirmed and ta.crossunder(f, s)
    strategy.entry("S", strategy.short)
strategy.exit("XL", from_entry="L", stop=strategy.position_avg_price - a * stop_atr, limit=strategy.position_avg_price + a * stop_atr * target_r)
strategy.exit("XS", from_entry="S", stop=strategy.position_avg_price + a * stop_atr, limit=strategy.position_avg_price - a * stop_atr * target_r)
alert('{"deploymentId":"x","strategyVersionId":"y"}', alert.freq_once_per_bar_close)`;
  const g = lintPine(good, sdl);
  assert.equal(g.pass, true, JSON.stringify(g.findings.filter(f => f.severity === "error")));
});

test("tradingview csv parse and parity", () => {
  const r = runBacktest(sdl, bars, {}, {});
  const iso = t => new Date(t).toISOString().slice(0, 16).replace("T", " ");
  let csv = "Trade #,Type,Signal,Date/Time,Price USDT,Contracts,Profit USDT\n";
  r.trades.forEach((t, i) => {
    csv += `${i + 1},Exit ${t.dir},x,${iso(t.exitTime)},${t.exitPrice},${t.qty},${t.net}\n`;
    csv += `${i + 1},Entry ${t.dir},x,${iso(t.entryTime)},${t.entryPrice},${t.qty},${t.net}\n`;
  });
  const p = parseTradingViewTrades(csv);
  assert.equal(p.trades.length, r.trades.length);
  const res = parity(r.trades, p.trades, { tfMs: 4 * 3600000, tickSize: 0.01, slippageTicks: 2 });
  assert.equal(res.status, "PASS", JSON.stringify(res.checks));
});

// ---- Trailing stop, fill-on-close, daily VWAP ----
import { vwapDaily } from "../js/indicators.js";
function flatBars(n, start = Date.UTC(2024, 0, 1), tf = 4 * 3600000) {
  const b = { t: [], o: [], h: [], l: [], c: [], v: [] };
  for (let i = 0; i < n; i++) { b.t.push(start + i * tf); b.o.push(100); b.h.push(100.1); b.l.push(99.9); b.c.push(100); b.v.push(10); }
  return b;
}
function trailSDL(extra = {}) {
  const s = structuredClone(SDL_TEMPLATE);
  s.strategy.directions = ["long"];
  s.indicators = [{ id: "atr14", type: "atr", length: 14 }];
  s.signals = { longEntry: "bar_index == 300", shortEntry: "", longExit: "", shortExit: "" };
  s.parameters = [];
  s.costs = { commissionType: "percent", commissionValue: 0, slippageTicks: 0, tickSize: 0.01 };
  s.risk = { sizingModel: "percent_of_equity", sizePercent: 100, leverage: 1, stopLoss: { type: "percent", value: 3 }, takeProfit: { type: "none" }, oneStopOneTarget: true,
    trailingStop: { activation: { type: "percent", value: 0.5 }, offset: { type: "percent", value: 0.2 } } };
  s.segments = { warmupBars: 50, selectionMode: "fixed", embargoBars: 0 };
  return Object.assign(s, extra);
}

test("trailing stop arms, ratchets and exits on the close leg or next bar", () => {
  const b = flatBars(400);
  // bar 301: entry at open 100; low first (99.9) then high 101 arms the trail (peak 101, stop 100.8); close 100.9 stays above
  Object.assign(b, {}); b.o[301] = 100; b.h[301] = 101; b.l[301] = 99.9; b.c[301] = 100.9;
  // bar 302: high first (101) then low 100.5 crosses the 100.8 trail
  b.o[302] = 100.9; b.h[302] = 101; b.l[302] = 100.5; b.c[302] = 100.6;
  const sdl = trailSDL();
  assert.equal(validateSDL(sdl).ok, true, validateSDL(sdl).errors.join("; "));
  const r = runBacktest(sdl, b, {}, {});
  assert.equal(r.trades.length, 1);
  const t = r.trades[0];
  assert.equal(t.entryPrice, 100);
  assert.equal(t.exitIdx, 302);
  assert.equal(t.reason, "trail");
  assert.ok(Math.abs(t.exitPrice - 100.8) < 1e-9, "exit at peak - offset, got " + t.exitPrice);
});

test("trail hit on the same bar's close leg", () => {
  const b = flatBars(400);
  b.o[301] = 100; b.h[301] = 101; b.l[301] = 99.9; b.c[301] = 100.6; // h → c falls through 100.8
  const r = runBacktest(trailSDL(), b, {}, {});
  assert.equal(r.trades[0].exitIdx, 301);
  assert.equal(r.trades[0].reason, "trail");
});

test("adverse path mode removes favourable intrabar ordering", () => {
  const b = flatBars(400);
  b.o[301] = 100; b.h[301] = 101; b.l[301] = 96.5; b.c[301] = 100; // stop 97 and arming both inside the bar
  const tv = runBacktest(trailSDL(), b, {}, {}).trades[0];
  const adv = runBacktest(trailSDL(), b, {}, { pathMode: "adverse" }).trades[0];
  assert.equal(adv.reason, "stop");
  assert.ok(adv.net < tv.net || tv.reason === "stop");
});

test("processOnClose fills at the signal bar's close", () => {
  const b = flatBars(400);
  b.c[300] = 100.05;
  const sdl = trailSDL({ execution: { entryOrder: "market_next_bar", pyramiding: 0, allowReversal: true, processOnClose: true, calcOnEveryTick: false } });
  const v = validateSDL(sdl);
  assert.equal(v.ok, true);
  assert.ok(v.warnings.some(w => w.includes("processOnClose")));
  const r = runBacktest(sdl, b, {}, {});
  assert.equal(r.trades[0].entryIdx, 300);
  assert.equal(r.trades[0].entryPrice, 100.05);
});

test("daily VWAP resets at the UTC day boundary", () => {
  const day = 86400000, t0 = Date.UTC(2024, 0, 1);
  const bars = { t: [t0, t0 + 3600e3, t0 + day, t0 + day + 3600e3], v: [1, 3, 2, 2] };
  const out = vwapDaily(bars, [10, 20, 30, 40]);
  assert.deepEqual([...out], [10, 17.5, 30, 35]);
});

test("architect coercion fills descriptive fields but never invents logic", async () => {
  const { coerceArchitect, byId } = await import("../js/agents.js");
  const { validate } = await import("../js/schema.js");
  const partial = { sdl: { strategy: { name: "MACD-CCI ctrl" }, indicators: [{ id: "atr14", type: "atr", length: 14 }], signals: { longEntry: "close > close[1]", shortEntry: "close < close[1]" },
    risk: { sizingModel: "percent_of_equity", sizePercent: 100, leverage: 1, stopLoss: { type: "atr_multiple", value: 2, atrIndicator: "atr14" }, takeProfit: { type: "none" } }, parameters: [] }, summary: "MACD cross with CCI filter" };
  const out = coerceArchitect(partial);
  assert.deepEqual(out.sdl.strategy.directions, ["long", "short"]);
  assert.ok(out.sdl.strategy.thesis && out.sdl.strategy.family);
  assert.equal(validate(byId.architect.schema, out).ok, true, JSON.stringify(validate(byId.architect.schema, out).errors));
  const v = validateSDL(out.sdl);
  assert.equal(v.ok, true, v.errors.join("; "));
  // No signals -> no directions invented
  const empty = coerceArchitect({ sdl: { strategy: {}, signals: {} } });
  assert.deepEqual(empty.sdl.strategy.directions, []);
  assert.equal(validateSDL(empty.sdl).ok, false);
});

test("architect coercion maps flat and Pine-style trailing stops", async () => {
  const { coerceArchitect } = await import("../js/agents.js");
  const base = () => ({ sdl: { strategy: { name: "x" }, indicators: [{ id: "atr14", type: "atr", length: 14 }], signals: { longEntry: "close > close[1]" },
    risk: { sizingModel: "percent_of_equity", sizePercent: 100, leverage: 1, stopLoss: { type: "percent", value: 3 }, takeProfit: { type: "none" } }, parameters: [] } });
  const a = base(); a.sdl.risk.trailingStop = { type: "atr_multiple", value: 0.015, atrIndicator: "atr14" };
  let s = coerceArchitect(a).sdl;
  assert.deepEqual(s.risk.trailingStop, { activation: { type: "atr_multiple", value: 0.015, atrIndicator: "atr14" }, offset: { type: "atr_multiple", value: 0.015, atrIndicator: "atr14" } });
  assert.equal(validateSDL(s).ok, true, validateSDL(s).errors.join("; "));
  const b = base(); b.sdl.risk.trailingStop = { type: "percent", trail_points: 0.5, trail_offset: 0.2 };
  s = coerceArchitect(b).sdl;
  assert.equal(s.risk.trailingStop.activation.value, 0.5); assert.equal(s.risk.trailingStop.offset.value, 0.2);
  assert.equal(validateSDL(s).ok, true);
});

// ---- Free Pine converter ----
import fs from "node:fs";
import { convertPineToSDL } from "../js/pine-convert.js";
const pine = f => fs.readFileSync(new URL(`./pine/${f}.pine`, import.meta.url), "utf8");

test("free converter: MACD-CCI with CCI sign, MACD tuple and ATR trail", () => {
  const { sdl, notes } = convertPineToSDL(pine("macd_cci"));
  assert.equal(validateSDL(sdl).ok, true, validateSDL(sdl).errors.join("; "));
  assert.equal(sdl.signals.longEntry, "crosses_above(macdline, signalline) AND close > close_mean");
  assert.equal(sdl.execution.processOnClose, true);
  assert.equal(sdl.costs.commissionValue, 0.05);
  assert.deepEqual(sdl.risk.trailingStop.activation, { type: "atr_multiple", value: 0.015, atrIndicator: "atr" });
  assert.ok(notes.some(n => /no stop-loss/.test(n)));
});

test("free converter: inputs, else-if, ATR stop and R-multiple target", () => {
  const { sdl, skipped } = convertPineToSDL(pine("ema_atr"));
  assert.equal(validateSDL(sdl).ok, true);
  assert.deepEqual(skipped, []);
  assert.deepEqual(sdl.risk.stopLoss, { type: "atr_multiple", valueParameter: "atrmult", atrIndicator: "a" });
  assert.deepEqual(sdl.risk.takeProfit, { type: "risk_multiple", value: 2 });
  assert.ok(sdl.parameters.find(p => p.key === "slowlen" && p.min === 50 && p.max === 250));
  assert.equal(sdl.costs.slippageTicks, 2);
  assert.equal(sdl.risk.sizePercent, 25);
});

test("free converter: strategy.close exits and percent stop", () => {
  const { sdl } = convertPineToSDL(pine("rsi"));
  assert.equal(sdl.signals.longExit, "r > 70");
  assert.deepEqual(sdl.risk.stopLoss, { type: "percent", value: 3 });
  assert.deepEqual(sdl.strategy.directions, ["long"]);
});

test("free converter refuses bar-by-bar state instead of inventing entries", () => {
  assert.throws(() => convertPineToSDL(pine("r08")), /bar-by-bar state/);
});

test("input.time defaults are made constant for TradingView (CE10123)", () => {
  const src = `//@version=6\nstrategy("x")\na = input.time(timestamp(2020, 1, 1, 0, 0), "Start")\nb = input.time(defval = timestamp("GMT+3", 2099, 12, 31, 23, 59), title = "End")\nc = input.time(timestamp("2020-01-01T00:00:00"), "OK")\nd = input.time(timestamp(startY, 1, 1), "Bad")`;
  assert.equal(lintPine(src).findings.filter(f => f.rule === "input-time-const").length, 3);
  const r = fixPineConstants(src);
  assert.match(r.source, /input\.time\(timestamp\("01 Jan 2020 00:00 \+0000"\), "Start"\)/);
  assert.match(r.source, /defval = timestamp\("31 Dec 2099 23:59 \+0300"\)/);
  assert.match(r.source, /timestamp\("2020-01-01T00:00:00"\)/);
  assert.equal(r.fixes.length, 2);
  // A variable argument cannot be fixed mechanically, so Pine QA still rejects it.
  assert.deepEqual(lintPine(r.source).findings.filter(f => f.rule === "input-time-const").map(f => f.line), [6]);
});

test("free converter: indicator() signals become a strategy with an ATR stop and R target", async () => {
  const fs = await import("node:fs");
  const { convertPineToSDL } = await import("../js/pine-convert.js");
  const pine = fs.readFileSync(new URL("./pine/ema_cross_indicator.pine", import.meta.url), "utf8");
  let err = null;
  try { convertPineToSDL(pine); } catch (e) { err = e; }
  assert.equal(err?.code, "pick_signals");
  assert.deepEqual(err.candidates.map(c => c.label), ["Buy", "Sell", "Overbought"]);
  const both = convertPineToSDL(pine, { signals: { buy: "Buy", sell: "Sell", mode: "both", stopAtr: 1.5, targetR: 2 } }).sdl;
  assert.equal(validateSDL(both).ok, true);
  assert.deepEqual(both.strategy.directions, ["long", "short"]);
  assert.match(both.signals.longEntry, /crosses_above\(fast, slow\)/);
  assert.equal(both.risk.stopLoss.valueParameter, "stop_atr");
  assert.equal(both.risk.takeProfit.valueParameter, "target_r");
  const longOnly = convertPineToSDL(pine, { signals: { buy: "Buy", sell: "Sell", mode: "long", stopAtr: 2, targetR: 0 } }).sdl;
  assert.deepEqual(longOnly.strategy.directions, ["long"]);
  assert.match(longOnly.signals.longExit, /crosses_below/);
  assert.equal(longOnly.risk.takeProfit.type, "none");
  const r = runBacktest(both, bars, Object.fromEntries(both.parameters.map(p => [p.key, p.default])));
  assert.ok(computeMetrics(r).tradeCount > 0);
});

test("free Pine generator: every example and an indicator strategy pass Pine QA", async () => {
  const { generatePine } = await import("../js/pine-gen.js");
  const { EXAMPLES } = await import("../js/examples.js");
  for (const ex of [{ id: "template", sdl }, ...EXAMPLES]) {
    const { source } = generatePine(ex.sdl, { ids: { strategyVersionId: "v1" } });
    const l = lintPine(source, ex.sdl);
    assert.equal(l.errors, 0, ex.id + ": " + l.findings.filter(f => f.severity === "error").map(f => f.message).join("; "));
    assert.match(source, /^\/\/@version=6/);
    assert.match(source, /input\.time\(timestamp\("01 Jan 2000 00:00 \+0000"\)/);
    for (const p of ex.sdl.parameters) assert.match(source, new RegExp(`input\\.(int|float)\\(${p.default}`));
  }
  const longOnly = { ...structuredClone(sdl), strategy: { ...sdl.strategy, directions: ["long"] } };
  const g = generatePine(longOnly).source;
  assert.ok(!/strategy\.entry\("Short"/.test(g), "long-only strategy must not place short entries");
  // rising(x, 2) means two consecutive higher values, as in the runner.
  const r = structuredClone(sdl); r.signals.longEntry = "rising(close, 2)";
  assert.match(generatePine(r).source, /close > close\[1\] and close\[1\] > close\[2\]/);
});

test("realistic costs: slippage is about half a typical spread, in the dataset's ticks", async () => {
  const { realisticCosts, costsLookUnrealistic } = await import("../js/data.js");
  assert.equal(realisticCosts("XAUUSD", 0.01, 4150, { commissionValue: 0.05 }).slippageTicks, 10);
  assert.equal(realisticCosts("OANDA:XAUUSD", 0.01, 4150, {}).commissionValue, 0.01);
  assert.equal(realisticCosts("EURUSD", 0.00001, 1.1, {}).slippageTicks, 6);
  assert.equal(realisticCosts("BTCUSDT", 0.01, 65000, { commissionValue: 0.1 }).slippageTicks, 650);
  assert.ok(costsLookUnrealistic({ costs: { slippageTicks: 0, commissionValue: 0.05 } }));
  assert.ok(!costsLookUnrealistic({ costs: { slippageTicks: 2, commissionValue: 0.05 } }));
});
