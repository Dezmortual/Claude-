// Unit checks for portfolio analytics. Run: npm run test:unit
import assert from "node:assert/strict";
import { drawdowns, monteCarlo, navSeries, periodReturns, rebalance, riskOf, type Closes, type Entry } from "../src/lib/portfolio/analytics";

let passed = 0;
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log("  ok", name); };
const DAY = 86_400_000, t0 = Date.UTC(2026, 0, 1);
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const series = (cs: number[]) => cs.map((c, i) => ({ ts: t0 + i * DAY, c }));

ok("money added isn't counted as gain", () => {
  const closes: Closes = new Map([["x", series([100, 100, 110, 110])]]);
  const e: Entry[] = [{ slug: "x", kind: "buy", qty: 1, price: 100, amount: null, at: t0 },
    { slug: "x", kind: "buy", qty: 9, price: 110, amount: null, at: t0 + 3 * DAY }];
  const nav = navSeries(e, closes, t0, t0 + 3 * DAY);
  near(nav.at(-1)!.value, 1100);
  near(nav.at(-1)!.index, 1.1); // only the 10% move on the first coin; the second buy is money in
});

ok("selling takes money out; dividends and fees count as return", () => {
  const closes: Closes = new Map([["x", series([100, 100, 100])]]);
  const e: Entry[] = [{ slug: "x", kind: "buy", qty: 10, price: 100, amount: null, at: t0 },
    { slug: "x", kind: "dividend", qty: 0, price: null, amount: 10, at: t0 + DAY },
    { slug: "x", kind: "sell", qty: 5, price: 100, amount: null, at: t0 + 2 * DAY }];
  const nav = navSeries(e, closes, t0, t0 + 2 * DAY);
  near(nav[1].index, 1.01); near(nav[2].index, 1.01); near(nav[2].value, 500);
});

ok("a buy fee lowers the first day's return", () => {
  const nav = navSeries([{ slug: "x", kind: "buy", qty: 1, price: 100, amount: 1, at: t0 }], new Map([["x", series([100])]]), t0, t0);
  near(nav[0].ret, 100 / 101 - 1);
});

ok("undated holdings start at the given start, valued at that day's close", () => {
  const nav = navSeries([{ slug: "x", kind: "buy", qty: 2, price: null, amount: null, at: null }], new Map([["x", series([50, 60])]]), t0, t0 + DAY);
  near(nav[0].value, 100); near(nav[1].index, 1.2);
});

ok("weekends carry Friday's close", () => {
  const closes: Closes = new Map([["x", [{ ts: t0, c: 100 }, { ts: t0 + 3 * DAY, c: 120 }]]]);
  const nav = navSeries([{ slug: "x", kind: "buy", qty: 1, price: 100, amount: null, at: t0 }], closes, t0, t0 + 3 * DAY);
  assert.deepEqual(nav.map((p) => p.value), [100, 100, 100, 120]);
});

ok("drawdown and period returns", () => {
  const pts = [1, 1.2, 0.9, 1.0].map((index, i) => ({ ts: t0 + i * 20 * DAY, index }));
  near(drawdowns(pts).worst, -25);
  const p = periodReturns(pts);
  assert.equal(p.months.length, 3); near(p.years[0].pct, 0);
});

ok("risk: a holding that moves with the benchmark has beta 1; VaR is a loss", () => {
  const cs = Array.from({ length: 400 }, (_, i) => 100 * Math.exp(0.02 * Math.sin(i) + i * 0.0005));
  const closes: Closes = new Map([["x", series(cs)]]);
  const r = riskOf(new Map([["x", 1]]), closes, series(cs), t0 + 399 * DAY);
  near(r.beta!, 1, 1e-9); assert.ok(r.var95 > 0 && r.cvar95 >= r.var95); near(r.contributions[0].share, 1, 1e-9);
  assert.equal(r.correlation.m[0][0], 1);
});

ok("the simulation is repeatable and its percentiles are ordered", () => {
  const rets = Array.from({ length: 365 }, (_, i) => 0.01 * Math.sin(i * 1.7));
  const a = monteCarlo(rets)!, b = monteCarlo(rets)!;
  assert.deepEqual(a, b);
  for (const h of a) assert.ok(h.p5 <= h.p25 && h.p25 <= h.p50 && h.p50 <= h.p75 && h.p75 <= h.p95);
});

ok("rebalance trades move each holding to its target", () => {
  const r = rebalance(new Map([["a", { value: 800, price: 10 }], ["b", { value: 200, price: 20 }]]), new Map([["a", 50], ["b", 50]]), 1000);
  const a = r.trades.find((t) => t.slug === "a")!;
  near(a.trade, -300); near(a.qty!, -30); near(r.turnover, 300); near(r.turnoverPct, 30);
});
console.log(`${passed} passed`);
