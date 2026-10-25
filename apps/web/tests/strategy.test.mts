// Unit checks for strategy backtests. Run: npm run test:unit
import assert from "node:assert/strict";
import type { Bar } from "../src/lib/indicators/formula";
import { deflatedSharpe, fill, grid, normCdf, normInv, placeholders, runStrategy, sweep, type StrategySpec } from "../src/lib/indicators/strategy";
import { TEMPLATES } from "../src/lib/indicators/templates";
import { check } from "../src/lib/indicators/formula";

let passed = 0;
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log("  ok", name); };
const day = 86_400_000, t0 = Date.UTC(2024, 0, 1);
const mk = (cs: number[], o?: (i: number) => number): Bar[] => cs.map((c, i) => ({ ts: t0 + i * day, o: o ? o(i) : c, h: c * 1.01, l: c * 0.99, c, v: 1 }));
const spec = (s: Partial<StrategySpec>): StrategySpec => ({ entry: "1", exit: null, side: "long", params: {}, stopPct: null, takePct: null, maxBars: null, feePct: 0, slippagePct: 0, ...s });
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

ok("placeholders are found and filled; a missing one is an error", () => {
  assert.deepEqual(placeholders("sma(close, {fast}) > sma(close, {slow})", "x > {fast}"), ["fast", "slow"]);
  assert.equal(fill("sma(close, {n})", { n: 20 }), "sma(close, 20)");
  assert.throws(() => fill("sma(close, {n})", {}), /Give \{n\} a value/);
});

ok("every template is valid once filled with its defaults", () => {
  for (const t of TEMPLATES) {
    const p = Object.fromEntries(t.params.map((x) => [x.name, x.value]));
    assert.equal(check(fill(t.entry, p)), null, t.key);
    if (t.exit) assert.equal(check(fill(t.exit, p)), null, t.key);
    assert.deepEqual(placeholders(t.entry, t.exit).sort(), t.params.map((x) => x.name).sort(), t.key);
  }
});

ok("no look-ahead: a signal at a close fills at the next open", () => {
  // Opens are close + 1, so a fill at the open is distinguishable from a fill at the close.
  const bars = mk([10, 10, 10, 20, 20], (i) => [10, 10, 11, 21, 21][i]);
  const r = runStrategy(bars, spec({ entry: "close > 15" }));
  assert.equal(r.trades.length, 1);
  assert.equal(r.trades[0].entryTs, bars[4].ts); // signal at bar 3's close, filled at bar 4's open
  assert.equal(r.trades[0].entryPrice, 21);
  assert.equal(r.trades[0].reason, "end");
});

ok("buy and hold with no costs matches the price change", () => {
  const bars = mk([100, 100, 110, 121]);
  const r = runStrategy(bars, spec({ entry: "1" }));
  near(r.metrics.totalReturn, 21); // in at bar 1's open (100), out at the last close (121)
  near(r.metrics.buyHold, 21);
});

ok("fees and slippage come off both ways", () => {
  const bars = mk([100, 100, 100, 100]);
  const r = runStrategy(bars, spec({ entry: "1", feePct: 0.1, slippagePct: 0.05 }));
  // Flat prices: the whole loss is costs, a little over 2 × (0.1% + 0.05%).
  assert.ok(r.metrics.totalReturn < -0.29 && r.metrics.totalReturn > -0.31, String(r.metrics.totalReturn));
  assert.ok(r.metrics.costsPct > 0.29);
});

ok("a stop fills at its price, or at the open when the bar gaps through it", () => {
  const bars = mk([100, 100, 100, 100, 100]);
  bars[2] = { ...bars[2], l: 94 };                      // touches a 5% stop
  let r = runStrategy(bars, spec({ entry: "1", stopPct: 5 }));
  assert.equal(r.trades[0].reason, "stop"); near(r.trades[0].exitPrice, 95);
  const gap = mk([100, 100, 100]); gap[2] = { ...gap[2], o: 90, l: 89, h: 91, c: 90 };
  r = runStrategy(gap, spec({ entry: "1", stopPct: 5 }));
  near(r.trades[0].exitPrice, 90);
});

ok("a bar that touches both the stop and the target counts as the stop", () => {
  const bars = mk([100, 100, 100]); bars[2] = { ...bars[2], h: 120, l: 80 };
  const r = runStrategy(bars, spec({ entry: "1", stopPct: 5, takePct: 10 }));
  assert.equal(r.trades[0].reason, "stop");
});

ok("short trades gain when price falls", () => {
  const r = runStrategy(mk([100, 100, 90, 80]), spec({ entry: "1", side: "short" }));
  near(r.metrics.totalReturn, 20);
});

ok("an exit rule closes at the next open; a time limit closes after n bars", () => {
  const bars = mk([10, 10, 20, 20, 10, 10, 10]);
  let r = runStrategy(bars, spec({ entry: "close > 15", exit: "close < 15" }));
  assert.equal(r.trades[0].reason, "rule"); assert.equal(r.trades[0].exitTs, bars[5].ts);
  r = runStrategy(mk(Array(10).fill(10)), spec({ entry: "1", maxBars: 3 }));
  assert.equal(r.trades[0].reason, "time"); assert.equal(r.trades[0].bars, 3);
});

ok("warm-up bars feed indicators but are never traded", () => {
  const bars = mk(Array.from({ length: 60 }, (_, i) => 100 + i));
  const r = runStrategy(bars, spec({ entry: "close > sma(close, 20)" }), 30);
  assert.ok(r.trades[0].entryTs >= bars[31].ts);
  assert.equal(r.equity[0].ts, bars[30].ts);
});

ok("the normal helpers agree with known values", () => {
  near(normCdf(0), 0.5, 1e-7); near(normCdf(1.96), 0.975, 1e-3); near(normInv(0.975), 1.96, 1e-3); near(normInv(0.5), 0, 1e-9);
});

ok("more tries make the luck test stricter", () => {
  const perBar = { sharpe: 0.08, skew: 0, kurt: 3, n: 750 };
  const one = deflatedSharpe(perBar, 1)!, many = deflatedSharpe(perBar, 100, 0.0016)!;
  assert.ok(one > 0.95, String(one)); assert.ok(many < one, `${many} < ${one}`);
});

ok("grids are capped", () => {
  assert.equal(grid([{ name: "a", from: 1, to: 3, step: 1 }, { name: "b", from: 0, to: 1, step: 0.5 }]).length, 9);
  assert.throws(() => grid([{ name: "a", from: 1, to: 100, step: 1 }, { name: "b", from: 1, to: 100, step: 1 }]), /combinations/);
});

ok("a walk-forward sweep picks settings on the past only and counts every try", () => {
  const bars = mk(Array.from({ length: 600 }, (_, i) => 100 + 20 * Math.sin(i / 25) + i * 0.05));
  const s = sweep(bars, spec({ entry: "crosses_above(sma(close, {f}), sma(close, 50))", exit: "crosses_below(sma(close, {f}), sma(close, 50))" }),
    [{ name: "f", from: 5, to: 25, step: 10 }], 60);
  assert.equal(s.rows.length, 3); assert.equal(s.folds.length, 3); assert.equal(s.tried, 3 * 4);
  for (const f of s.folds) assert.ok(f.testFrom > f.trainFrom);
  assert.ok(s.outOfSample && s.outOfSample.equity[0].ts === s.folds[0].testFrom);
});

console.log(`${passed} passed`);
