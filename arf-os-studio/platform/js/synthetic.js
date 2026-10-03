// Synthetic OHLCV generator for tests and the practice arena only. Never used as production evidence.
import { rng } from "./util.js";

export function syntheticBars({ n = 4000, tfMs = 4 * 3_600_000, start = Date.UTC(2020, 0, 1), seed = 1, drift = 0, vol = 0.012, regimeLen = 400, price = 100 } = {}) {
  const r = rng(seed), b = { t: [], o: [], h: [], l: [], c: [], v: [] };
  const gauss = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  let p = price, mu = drift;
  for (let i = 0; i < n; i++) {
    if (i % regimeLen === 0) mu = drift + (r() - 0.5) * vol * 0.5;
    const o = p;
    const steps = 4; let hi = o, lo = o, x = o;
    for (let k = 0; k < steps; k++) { x *= Math.exp(mu / steps + (vol / Math.sqrt(steps)) * gauss()); hi = Math.max(hi, x); lo = Math.min(lo, x); }
    const round = y => Math.round(y * 100) / 100;
    b.t.push(start + i * tfMs); b.o.push(round(o)); b.h.push(round(hi)); b.l.push(round(lo)); b.c.push(round(x)); b.v.push(Math.round(1000 + r() * 1000));
    p = round(x);
  }
  return b;
}
