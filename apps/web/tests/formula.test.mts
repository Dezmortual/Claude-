// Unit checks for the indicator formula language and backtest. Run: npm run test:unit
import assert from "node:assert/strict";
import { check, evaluate, signalBars, type Bar } from "../src/lib/indicators/formula";
import { backtest } from "../src/lib/indicators/backtest";
import { PRESETS } from "../src/lib/indicators/presets";
import { rsi, emaSeries } from "../src/lib/data/indicators";

let passed = 0;
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log("  ok", name); };
const bars: Bar[] = Array.from({ length: 400 }, (_, i) => {
  const c = 100 + 10 * Math.sin(i / 15) + i * 0.05;
  return { ts: Date.UTC(2025, 0, 1) + i * 86_400_000, o: c - 0.3, h: c + 1, l: c - 1, c, v: 1000 + i };
});
const close = bars.map((b) => b.c);
const near = (a: number | null, b: number, eps = 1e-9) => assert.ok(a !== null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);

ok("arithmetic and precedence", () => near(evaluate("1 + 2 * 3 - (4 - 2) / 2", bars).at(-1)!, 6));
ok("comparisons and logic give 1 or 0", () => {
  assert.equal(evaluate("close > 0 and not (close < 0)", bars).at(-1), 1);
  assert.equal(evaluate("close < 0 or 1 == 2", bars).at(-1), 0);
});
ok("sma matches a hand computation", () => near(evaluate("sma(close, 20)", bars).at(-1)!, close.slice(-20).reduce((a, b) => a + b, 0) / 20));
ok("sma is null until the window fills", () => { const s = evaluate("sma(close, 20)", bars); assert.equal(s[18], null); assert.notEqual(s[19], null); });
ok("rsi agrees with the app's indicator table", () => near(evaluate("rsi(close, 14)", bars).at(-1)!, rsi(close, 14)!, 1e-6));
ok("ema converges to the app's ema", () => near(evaluate("ema(close, 10)", bars).at(-1)!, emaSeries(close, 10).at(-1)!, 1e-6));
ok("prev, change and division by zero", () => {
  near(evaluate("prev(close, 3)", bars).at(-1)!, close.at(-4)!);
  near(evaluate("change(close)", bars).at(-1)!, close.at(-1)! - close.at(-2)!);
  assert.equal(evaluate("close / 0", bars).at(-1), null);
});
ok("crosses_above fires once per cross", () => {
  const s = evaluate("crosses_above(close, sma(close, 30))", bars);
  const idx = signalBars(s);
  assert.ok(idx.length > 3);
  for (const i of idx) assert.ok(close[i] > evaluate("sma(close, 30)", bars)[i]! && close[i - 1] <= evaluate("sma(close, 30)", bars)[i - 1]!);
});
ok("bad formulas say where", () => {
  assert.match(check("sma(close)")!.message, /sma takes 2 values/);
  assert.match(check("sma(close, x)")!.message, /Unknown name/);
  assert.match(check("sma(close, close)")!.message, /whole number/);
  assert.match(check("fetch(close)")!.message, /Unknown function/);
  assert.match(check("close +")!.message, /ends too early/);
  assert.match(check("close; drop table")!.message, /Unexpected ";"/);
  assert.match(check("constructor")!.message, /Unknown name/);
  assert.match(check("(".repeat(40) + "1" + ")".repeat(40))!.message, /nested too deeply/);
  assert.equal(check("x".repeat(301))!.message.includes("300"), true);
  assert.equal(check("bb_upper(close, 20, 2) > close"), null);
});
ok("every preset is valid and evaluates", () => {
  for (const p of PRESETS) for (const f of [...p.lines, p.buyRule, p.sellRule]) if (f) {
    assert.equal(check(f), null, `${p.name}: ${f}`);
    assert.ok(evaluate(f, bars).some((v) => v !== null), `${p.name}: ${f} has values`);
  }
});
ok("backtest counts signals and forward moves", () => {
  const r = backtest(bars, { buy: "crosses_above(close, sma(close, 30))", sell: null });
  assert.ok(r.buy && r.buy.signals > 3 && r.sell === null);
  const one = r.buy!.after[0];
  assert.ok(one.n <= r.buy!.signals && one.right >= 0 && one.right <= 1);
  assert.equal(r.base.length, 3);
});
console.log(`${passed} passed`);
