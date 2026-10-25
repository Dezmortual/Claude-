// EquityChart: server-rendered SVG of growth curves (each starting at 1) with the first curve's drawdown below.
// The metrics table next to it is the accessible alternative; the label sums up the end values.
import { cx } from "./ui";

export type Curve = { label: string; points: { ts: number; v: number }[]; tone: "line" | "hold" | "ind-1" | "ind-2" | "ind-3"; dashed?: boolean };
const STROKE = { line: "stroke-chart-line", hold: "stroke-text-subtle", "ind-1": "stroke-chart-ind-1", "ind-2": "stroke-chart-ind-2", "ind-3": "stroke-chart-ind-3" } as const;
export const SWATCH = { line: "bg-chart-line", hold: "bg-text-subtle", "ind-1": "bg-chart-ind-1", "ind-2": "bg-chart-ind-2", "ind-3": "bg-chart-ind-3" } as const;

const pctOf = (v: number) => `${v >= 1 ? "+" : "−"}${Math.abs((v - 1) * 100).toFixed(1)}%`;
const year = (ts: number) => new Date(ts).toISOString().slice(0, 7);

export function EquityChart({ curves, title }: { curves: Curve[]; title: string }) {
  const W = 800, H = 240, DD = 70, P = { l: 52, r: 12, t: 12, b: 22 };
  const all = curves.flatMap((c) => c.points);
  if (all.length < 2) return <p className="text-sm text-muted">Not enough points to draw.</p>;
  const t0 = Math.min(...all.map((p) => p.ts)), t1 = Math.max(...all.map((p) => p.ts));
  const lo = Math.min(...all.map((p) => p.v), 1), hi = Math.max(...all.map((p) => p.v), 1);
  const x = (ts: number) => P.l + ((ts - t0) / (t1 - t0 || 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo || 1)) * (H - P.t - P.b);
  const path = (pts: { ts: number; v: number }[], f: (v: number) => number) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.ts).toFixed(1)} ${f(p.v).toFixed(1)}`).join(" ");
  // Drawdown of the first curve: how far below its own peak it was, 0 at the top of the strip.
  let peak = -Infinity;
  const dd = curves[0].points.map((p) => { peak = Math.max(peak, p.v); return { ts: p.ts, v: p.v / peak - 1 }; });
  const worst = Math.min(...dd.map((p) => p.v), -0.01);
  const yd = (v: number) => H + 8 + (v / worst) * (DD - 16);
  const ticks = [lo, 1, hi].filter((v, i, a) => a.findIndex((w) => Math.abs(w - v) < (hi - lo) * 0.08) === i);
  const summary = curves.map((c) => `${c.label} ${pctOf(c.points.at(-1)!.v)}`).join(", ");
  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H + DD}`} className="h-auto w-full" role="img" aria-label={`${title}: ${summary}. Worst drop of ${curves[0].label}: ${(worst * 100).toFixed(1)}%.`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className="stroke-chart-grid" strokeWidth={1} />
            <text x={P.l - 6} y={y(v) + 4} textAnchor="end" className="fill-text-subtle text-2xs">{pctOf(v)}</text>
          </g>
        ))}
        {[...curves].reverse().map((c) => (
          <path key={c.label} d={path(c.points, y)} fill="none" strokeWidth={2} className={STROKE[c.tone]} strokeDasharray={c.dashed ? "5 4" : undefined} />
        ))}
        <text x={P.l} y={H - 4} className="fill-text-subtle text-2xs">{year(t0)}</text>
        <text x={W - P.r} y={H - 4} textAnchor="end" className="fill-text-subtle text-2xs">{year(t1)}</text>
        <path d={`${path(dd, yd)} L${x(dd.at(-1)!.ts)} ${yd(0)} L${x(dd[0].ts)} ${yd(0)} Z`} className="fill-down-soft stroke-down" strokeWidth={1} />
        <text x={P.l - 6} y={yd(0) + 4} textAnchor="end" className="fill-text-subtle text-2xs">0%</text>
        <text x={P.l - 6} y={yd(worst) + 4} textAnchor="end" className="fill-text-subtle text-2xs">{(worst * 100).toFixed(0)}%</text>
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {curves.map((c) => (
          <span key={c.label} className="inline-flex items-center gap-2">
            <span aria-hidden className={cx("inline-block h-1 w-4 rounded-full", SWATCH[c.tone])} />{c.label} {pctOf(c.points.at(-1)!.v)}
          </span>
        ))}
        <span>Shaded strip: how far {curves[0].label.toLowerCase()} sat below its best so far</span>
      </figcaption>
    </figure>
  );
}
