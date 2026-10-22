// Unit checks for signal history and alert damping (F5). Run: npm run test:unit
import assert from "node:assert/strict";
import { heldTwoBars, pulse, recentVerdicts, signalChanges, signalHistory } from "../src/lib/data/indicators";
import type { Bar } from "../src/lib/data/types";

let passed = 0;
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log("  ok", name); };
const H = 3_600_000;
const series = (f: (i: number) => number, n = 320): Bar[] => Array.from({ length: n }, (_, i) => { const c = f(i); return { ts: i * H, o: c, h: c * 1.002, l: c * 0.998, c, v: 1 }; });

ok("recentVerdicts ends with the current reading", () => {
  const b = series((i) => 100 + 10 * Math.sin(i / 20));
  assert.equal(recentVerdicts("1h", b, 3).at(-1), pulse("1h", b).verdict);
  assert.equal(recentVerdicts("1h", b, 3)[1], pulse("1h", b.slice(0, -1)).verdict);
});
ok("a steady uptrend holds its reading and doesn't flip", () => {
  const h = signalHistory("1h", series((i) => 100 + i * 0.5));
  assert.equal(h.changes, 0);
  assert.equal(h.heldBars, 25); // the whole 24-hour window plus the current bar
  assert.equal(h.window, "24 hours");
});
ok("a choppy series counts its flips", () => {
  const h = signalHistory("1h", series((i) => 100 + 4 * Math.sin(i / 2)));
  assert.ok(h.changes >= 4, `changes ${h.changes}`);
  assert.ok(h.heldBars >= 1 && h.heldBars <= 25);
});
ok("damping: a reading on one bar doesn't fire, the same reading on two bars does", () => {
  const up = (i: number) => 100 + i * 0.5;
  const oneBar = series((i) => (i < 319 ? up(i) : 60));
  assert.deepEqual(recentVerdicts("1h", oneBar, 2), ["strong_buy", "sell"]);
  assert.equal(heldTwoBars("1h", oneBar, "sell"), false);
  const twoBars = series((i) => (i < 318 ? up(i) : 60));
  assert.equal(recentVerdicts("1h", twoBars, 2).at(-1), recentVerdicts("1h", twoBars, 2)[0]);
  assert.equal(heldTwoBars("1h", twoBars, recentVerdicts("1h", twoBars, 1)[0]), true);
  assert.equal(heldTwoBars("1h", series(up), "strong_buy"), true);
});
ok("signal changes: newest first, real moves after, worst move against never positive", () => {
  const D = 86_400_000;
  const b: Bar[] = Array.from({ length: 500 }, (_, i) => { const c = 100 + 15 * Math.sin(i / 25); return { ts: i * D, o: c, h: c * 1.01, l: c * 0.99, c, v: 1 }; });
  const ch = signalChanges("1d", b, 200);
  assert.ok(ch.length >= 4, `changes ${ch.length}`);
  for (let k = 1; k < ch.length; k++) assert.ok(Date.parse(ch[k - 1].at) > Date.parse(ch[k].at), "newest first");
  for (const c of ch) {
    assert.notEqual(c.verdict, c.from);
    const i = b.findIndex((x) => x.ts + D === Date.parse(c.at));
    assert.equal(c.price, b[i].c);
    const dir = c.verdict.endsWith("buy") ? 1 : c.verdict.endsWith("sell") ? -1 : 0;
    if (c.after1d !== null) assert.ok(Math.abs(c.after1d - ((b[i + 1].c / b[i].c - 1) * 100) * (dir || 1)) < 1e-9, "after 1 day");
    if (c.after7d !== null) assert.ok(Math.abs(c.after7d - ((b[i + 7].c / b[i].c - 1) * 100) * (dir || 1)) < 1e-9, "after 7 days");
    if (c.worst7d !== null) assert.ok(c.worst7d <= 0 && dir !== 0);
  }
  const recent = signalChanges("1d", b.slice(0, -3), 200)[0];
  if (recent && Date.parse(recent.at) > b.at(-4)!.ts - 6 * D) assert.equal(recent.after7d, null, "the future isn't known yet");
});
console.log(`${passed} passed`);
