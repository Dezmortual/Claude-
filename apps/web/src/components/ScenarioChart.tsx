// ScenarioChart: server-rendered SVG fan of bear / base / bull paths. The yearly table below it is the accessible alternative.
import type { Scenarios } from "@/lib/data";
import { price as fmtPrice } from "@/lib/format";

export function ScenarioChart({ s, now, unit, name }: { s: Scenarios; now: number; unit: string; name: string }) {
  const W = 800, H = 260, P = { l: 8, r: 96, t: 16, b: 28 };
  const pts = [{ year: s.years[0].year - 1, bear: now, base: now, bull: now }, ...s.years];
  const max = Math.max(...pts.map((p) => p.bull)), min = Math.min(...pts.map((p) => p.bear));
  const lg = (v: number) => Math.log(Math.max(v, 1e-12));
  const x = (i: number) => P.l + (i / (pts.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (lg(v) - lg(min)) / (lg(max) - lg(min) || 1)) * (H - P.t - P.b);
  const line = (k: "bear" | "base" | "bull") => pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(" ");
  const fan = `${line("bull")} ${pts.map((_, i) => pts.length - 1 - i).map((i) => `L${x(i).toFixed(1)} ${y(pts[i].bear).toFixed(1)}`).join(" ")} Z`;
  const last = pts.at(-1)!;
  const label = (k: "bear" | "base" | "bull", cls: string, text: string) => (
    <text x={W - P.r + 6} y={y(last[k]) + 4} className={`text-2xs ${cls}`} fill="currentColor">{text} {fmtPrice(last[k], unit)}</text>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
      aria-label={`${name} scenarios to ${last.year} on a log scale: bear ${fmtPrice(last.bear, unit)}, base ${fmtPrice(last.base, unit)}, bull ${fmtPrice(last.bull, unit)}.`}>
      <path d={fan} className="fill-chart-band" />
      <path d={line("bear")} className="stroke-down" fill="none" strokeWidth="2" />
      <path d={line("bull")} className="stroke-up" fill="none" strokeWidth="2" />
      <path d={line("base")} className="stroke-chart-line" fill="none" strokeWidth="2" strokeDasharray="6 5" />
      <g className="text-down">{label("bear", "", "Bear")}</g>
      <g className="text-fg">{label("base", "", "Base")}</g>
      <g className="text-up">{label("bull", "", "Bull")}</g>
      {pts.map((p, i) => (i % 2 === 0 || i === pts.length - 1) && (
        <text key={p.year} x={x(i)} y={H - 8} textAnchor="middle" className="fill-text-subtle text-2xs">{i === 0 ? "Now" : p.year}</text>
      ))}
    </svg>
  );
}
