// One economic series as a card: the latest reading, its change, and three years as a sparkline.
import Link from "next/link";
import type { MacroSeries } from "@/lib/data";
import { Sparkline } from "./Sparkline";
import { fmtValue } from "./ValueChart";
import { cx } from "./ui";

const when = (ts: number, freq: string) => new Date(ts).toLocaleDateString("en-GB", { timeZone: "UTC", ...(freq === "daily" || freq === "weekly" ? { day: "numeric" } : {}), month: "short", year: "numeric" });

/** What a reader wants first: the yearly rate for index-like series, the level and its year's change for the rest. */
export function headline(s: MacroSeries) {
  if (!s.latest) return { value: "—", sub: "No values" };
  if (s.yoyPoints?.length) {
    const y = s.yoyPoints.at(-1)!, before = s.yoyPoints.at(-2);
    return { value: `${y.v >= 0 ? "+" : "−"}${Math.abs(y.v).toFixed(1)}%`, sub: `over the year to ${when(y.ts, s.def.freq)}${before ? ` (before: ${before.v >= 0 ? "+" : "−"}${Math.abs(before.v).toFixed(1)}%)` : ""}` };
  }
  const d = s.yearAgo ? s.latest.v - s.yearAgo.v : null;
  const unitWord = s.def.unit === "%" ? " points" : "";
  return { value: fmtValue(s.latest.v, s.def.unit), sub: `${when(s.latest.ts, s.def.freq)}${d === null ? "" : ` · ${d >= 0 ? "up" : "down"} ${fmtValue(Math.abs(d), s.def.unit === "%" ? "" : s.def.unit)}${unitWord} on a year ago`}` };
}

export function MacroCard({ s }: { s: MacroSeries }) {
  const h = headline(s);
  const spark = (s.yoyPoints ?? s.points).map((p) => p.v);
  return (
    <Link href={`/macro/${s.def.id}`} prefetch={false} className="group flex h-full flex-col gap-2 rounded-lg border bg-surface p-4 shadow-card hover:shadow-premium">
      <span className="text-sm font-semibold group-hover:underline">{s.def.name}</span>
      <span className="tabular text-xl">{h.value}</span>
      <span className={cx("text-xs text-muted", s.stale && "text-warning")}>{h.sub}{s.stale ? " · source not answering, last copy shown" : ""}</span>
      <Sparkline values={spark} />
    </Link>
  );
}
