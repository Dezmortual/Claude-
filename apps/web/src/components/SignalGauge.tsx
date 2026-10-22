import type { Verdict } from "@/lib/data";
import { SIGNAL_LABEL } from "@/lib/format";
import { cx } from "./ui";

type Counts = { buy: number; neutral: number; sell: number };

// Zones follow the verdict rule in indicators.ts: score = (buys - sells) / 20, strong beyond ±0.5, neutral within ±0.1.
const ZONES = [
  { from: -1, to: -0.5, cls: "stroke-signal-strong-sell", label: "Strong sell" },
  { from: -0.5, to: -0.1, cls: "stroke-signal-sell", label: "Sell" },
  { from: -0.1, to: 0.1, cls: "stroke-flat", label: "Neutral" },
  { from: 0.1, to: 0.5, cls: "stroke-signal-buy", label: "Buy" },
  { from: 0.5, to: 1, cls: "stroke-signal-strong-buy", label: "Strong buy" },
] as const;

const C = 110, R = 84; // centre x and arc radius in the 220 x 128 viewBox
const angle = (s: number) => Math.PI * (1 - (s + 1) / 2); // score -1 points left, +1 right
// Rounded so the server and the browser print identical coordinates (their Math.cos can differ in the last digit).
const r2 = (v: number) => Math.round(v * 100) / 100;
const at = (s: number, r: number) => [r2(C + r * Math.cos(angle(s))), r2(112 - r * Math.sin(angle(s)))] as const;

function arc(from: number, to: number) {
  const gap = 0.012; // a hairline between zones
  const [x1, y1] = at(from + gap, R), [x2, y2] = at(to - gap, R);
  return `M${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2}`;
}

const VERDICT_TEXT: Record<Verdict, string> = {
  strong_buy: "text-signal-strong-buy", buy: "text-signal-buy", neutral: "text-muted", sell: "text-signal-sell",
  strong_sell: "text-signal-strong-sell", unavailable: "text-muted",
};

/** A half-dial for one timeframe's twenty indicator readings. The needle sits at (buys - sells) / 20 and swings when
 *  the timeframe changes. The figure is described in text for screen readers; the counts below are plain text too. */
export function SignalGauge({ verdict, ma, osc, label }: { verdict: Verdict; ma: Counts; osc: Counts; label: string }) {
  const n = { buy: ma.buy + osc.buy, neutral: ma.neutral + osc.neutral, sell: ma.sell + osc.sell };
  const total = n.buy + n.neutral + n.sell || 1;
  const score = (n.buy - n.sell) / total;
  const deg = Math.round(90 * score * 10) / 10; // 0 = straight up
  return (
    <figure className="grid justify-items-center gap-3 rounded-lg border bg-surface p-5 shadow-card"
      aria-label={`${label}: ${SIGNAL_LABEL[verdict]}. ${n.sell} sell, ${n.neutral} neutral, ${n.buy} buy readings.`}>
      <figcaption className="text-2xs uppercase tracking-wide text-subtle">Overall reading · {label}</figcaption>
      <svg aria-hidden viewBox="0 0 220 128" className="w-full max-w-xs overflow-visible">
        {ZONES.map((z) => <path key={z.label} d={arc(z.from, z.to)} fill="none" strokeWidth={14} className={z.cls} />)}
        {([[-0.3, "Sell"], [0, "Neutral"], [0.3, "Buy"]] as const).map(([s, t]) => {
          const [x, y] = at(s, R + 14);
          return <text key={t} x={x} y={y} textAnchor={s < 0 ? "end" : s > 0 ? "start" : "middle"} fontSize={9} className="fill-text-muted">{t}</text>;
        })}
        {/* The strong zones are labelled under the dial's ends, where there is room. */}
        <text x={C - R} y={127} textAnchor="middle" fontSize={9} className="fill-text-muted">Strong sell</text>
        <text x={C + R} y={127} textAnchor="middle" fontSize={9} className="fill-text-muted">Strong buy</text>
        <g style={{ transform: `rotate(${deg}deg)`, transformOrigin: `${C}px 112px` }} className="transition-transform duration-700 ease-out motion-reduce:transition-none">
          <path d={`M${C - 3.5} 112 L${C} ${112 - R + 18} L${C + 3.5} 112 Z`} className="fill-text" />
        </g>
        <circle cx={C} cy={112} r={7} className="fill-surface stroke-text" strokeWidth={3} />
      </svg>
      <p className={cx("text-xl font-semibold", VERDICT_TEXT[verdict])}>{SIGNAL_LABEL[verdict]}</p>
      <dl className="grid w-full max-w-xs grid-cols-3 text-center">
        {([["Sell", n.sell, "text-down"], ["Neutral", n.neutral, "text-muted"], ["Buy", n.buy, "text-up"]] as const).map(([t, v, c]) => (
          <div key={t}><dd className={cx("tabular text-xl font-semibold", c)}>{v}</dd><dt className="text-sm text-muted">{t}</dt></div>
        ))}
      </dl>
    </figure>
  );
}
