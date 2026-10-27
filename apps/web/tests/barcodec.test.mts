// Unit checks for the snapshot packing. Run: npm run test:unit
import assert from "node:assert/strict";
import { pack, unpack } from "../src/lib/data/barcodec";
import type { Bar } from "../src/lib/data/types";

let passed = 0;
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log("  ok", name); };
const close = (a: Bar[], b: Bar[]) => { assert.equal(a.length, b.length); a.forEach((x, i) => {
  assert.equal(x.ts, b[i].ts); for (const k of ["o", "h", "l", "c"] as const) assert.ok(Math.abs(x[k] - b[i][k]) <= Math.abs(x[k]) * 1e-12 + 1e-9, `${k} ${x[k]} ${b[i][k]}`);
  assert.ok(Math.abs(x.v - b[i].v) <= Math.abs(x.v) * 1e-5); }); };

ok("round trip: crypto prices, a weekend gap and fractional volume", () => {
  const bars: Bar[] = [0, 1, 2, 5, 6].map((d, i) => ({ ts: 1_700_000_000_000 + d * 86_400_000, o: 67234.12 + i, h: 67500.5 + i, l: 66900.01 + i, c: 67300.99 - i, v: 1234.56789 + i }));
  close(unpack(pack(bars)), bars);
});
ok("round trip: forex at five decimals and an empty series", () => {
  const bars: Bar[] = [1.08325, 1.08401, 1.07999].map((c, i) => ({ ts: 1e12 + i * 300_000, o: c - 0.0001, h: c + 0.0002, l: c - 0.0003, c, v: 0 }));
  close(unpack(pack(bars)), bars);
  assert.deepEqual(unpack(pack([])), []);
});
console.log(`${passed} passed`);
