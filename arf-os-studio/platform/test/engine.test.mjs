import test from "node:test";
import assert from "node:assert/strict";
import { syntheticBars } from "../js/synthetic.js";
import { validateSDL, SDL_TEMPLATE, parseExpression, compile, parameterGrid, gridSize } from "../js/sdl.js";
import { runBacktest } from "../js/runner.js";
import { computeMetrics } from "../js/metrics.js";
import { ema, rsi, sma, atr } from "../js/indicators.js";
import { runBacktestStage, robustnessSuite, runHoldout, evaluateEvidence } from "../js/research.js";
import { integrityReport } from "../js/data.js";
import { lintPine } from "../js/pine-lint.js";
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
