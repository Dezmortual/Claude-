// Compact, lossless-to-8-decimals packing of a bar series for snapshots: times as steps from the previous bar,
// prices as whole numbers at the series' decimal precision, the close as a change from the previous close and the
// open, high and low relative to it. Small integers gzip far better than full decimals.
import type { Bar } from "./types";

type Packed = { d: number; s: number; t0: number; dt: number[]; c: number[]; o: number[]; h: number[]; l: number[]; v: number[] };

const decimalsOf = (x: number) => { for (let d = 0; d <= 8; d++) if (Math.abs(Math.round(x * 10 ** d) - x * 10 ** d) < 1e-6) return d; return 8; };

export function pack(bars: Bar[]): Packed {
  if (!bars.length) return { d: 0, s: 1, t0: 0, dt: [], c: [], o: [], h: [], l: [], v: [] };
  let d = 0;
  for (const b of bars) for (const x of [b.o, b.h, b.l, b.c]) d = Math.max(d, decimalsOf(x));
  const k = 10 ** d, q = (x: number) => Math.round(x * k);
  const gaps = bars.slice(1).map((b, i) => b.ts - bars[i].ts).filter((g) => g > 0);
  const s = gaps.length ? Math.min(...gaps) : 1;
  const out: Packed = { d, s, t0: bars[0].ts, dt: [], c: [], o: [], h: [], l: [], v: [] };
  let pc = 0, pt = bars[0].ts;
  for (const b of bars) {
    const c = q(b.c), o = q(b.o), h = q(b.h), l = q(b.l);
    out.dt.push(Math.round((b.ts - pt) / s)); pt = b.ts;
    out.c.push(c - pc); pc = c;
    out.o.push(o - c); out.h.push(h - Math.max(o, c)); out.l.push(Math.min(o, c) - l);
    out.v.push(Number(b.v.toPrecision(6)));
  }
  return out;
}

export function unpack(p: Packed): Bar[] {
  const k = 10 ** p.d, out: Bar[] = [];
  let c = 0, t = p.t0;
  for (let i = 0; i < p.c.length; i++) {
    t += p.dt[i] * p.s; c += p.c[i];
    const o = c + p.o[i], top = Math.max(o, c), bottom = Math.min(o, c);
    out.push({ ts: t, o: o / k, h: (top + p.h[i]) / k, l: (bottom - p.l[i]) / k, c: c / k, v: p.v[i] });
  }
  return out;
}
