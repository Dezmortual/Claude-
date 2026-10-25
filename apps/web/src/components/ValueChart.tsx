// ValueChart: server-rendered SVG line of a series' values over time, with its axis in the series' own unit.
// The table of recent values beside it is the accessible alternative.
import { cx } from "./ui";

export const fmtValue = (v: number, unit: string) => {
  const digits = Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 100 ? 1 : 2;
  const n = v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: unit === "%" || unit === "points" ? 2 : 0 });
  return unit === "%" || unit === "% a year" || unit.startsWith("% of") ? `${n}%` : n;
};

export function ValueChart({ points, unit, title, zeroLine }: { points: { ts: number; v: number }[]; unit: string; title: string; zeroLine?: boolean }) {
  if (points.length < 2) return <p className="text-sm text-muted">Not enough values to draw.</p>;
  const W = 800, H = 260, P = { l: 64, r: 12, t: 12, b: 24 };
  const t0 = points[0].ts, t1 = points.at(-1)!.ts;
  let lo = Math.min(...points.map((p) => p.v)), hi = Math.max(...points.map((p) => p.v));
  if (zeroLine) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const pad = (hi - lo) * 0.05 || 1;
  lo -= pad; hi += pad;
  const x = (ts: number) => P.l + ((ts - t0) / (t1 - t0 || 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.ts).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const ticks = [0, 0.5, 1].map((k) => lo + pad + k * (hi - lo - 2 * pad));
  const yr = (ts: number) => new Date(ts).getUTCFullYear();
  const last = points.at(-1)!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
      aria-label={`${title}: from ${fmtValue(points[0].v, unit)} in ${yr(t0)} to ${fmtValue(last.v, unit)} in ${yr(t1)}, between ${fmtValue(lo + pad, unit)} and ${fmtValue(hi - pad, unit)}.`}>
      {ticks.map((v) => (
        <g key={v}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className="stroke-chart-grid" strokeWidth={1} />
          <text x={P.l - 6} y={y(v) + 4} textAnchor="end" className="fill-text-subtle text-2xs">{fmtValue(v, unit)}</text></g>
      ))}
      {zeroLine && lo < 0 && <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} className="stroke-text-subtle" strokeDasharray="4 4" strokeWidth={1} />}
      <path d={d} fill="none" strokeWidth={2} className={cx("stroke-chart-line")} />
      <circle cx={x(last.ts)} cy={y(last.v)} r={3} className="fill-chart-line" />
      <text x={P.l} y={H - 6} className="fill-text-subtle text-2xs">{yr(t0)}</text>
      <text x={W - P.r} y={H - 6} textAnchor="end" className="fill-text-subtle text-2xs">{yr(t1)}</text>
    </svg>
  );
}
