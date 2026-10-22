import { cx } from "./ui";

/** A small closing-price line with a soft area under it. Decorative: the card around it states the numbers in text. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 30 - ((v - lo) / span) * 26] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const up = values.at(-1)! >= values[0];
  return (
    <svg aria-hidden viewBox="0 0 100 32" preserveAspectRatio="none" className={cx("h-10 w-full", up ? "text-up" : "text-down", className)}>
      <path d={`${line} L100 32 L0 32 Z`} fill="currentColor" fillOpacity={0.1} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
