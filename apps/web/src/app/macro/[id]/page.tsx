import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headline } from "@/components/MacroCard";
import { ValueChart, fmtValue } from "@/components/ValueChart";
import { PinSeries } from "@/components/client/PinSeries";
import { Banner, Card, Label, Section, cx } from "@/components/ui";
import { DataError, macroPins, macroSeries } from "@/lib/data";
import { viewer } from "@/lib/session";

export const metadata = { title: "Economic series" };
const RANGES = [["5y", 5], ["10y", 10], ["max", 0]] as const;

export default async function Series({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; range?: string }> }) {
  const v = await viewer();
  const { id } = await params;
  if (!v.user) redirect(`/sign-in?next=/macro/${id}`);
  const sp = await searchParams;
  const s = await macroSeries(v, id).catch((e) => { if (e instanceof DataError) notFound(); throw e; });
  const pins = await macroPins(v);
  const view = sp.view === "level" || !s.yoyPoints ? "level" : "yoy";
  const years = RANGES.find(([k]) => k === sp.range)?.[1] ?? 10;
  const from = years ? Date.now() - years * 365.25 * 86_400_000 : -Infinity;
  const pts = (view === "yoy" ? s.yoyPoints! : s.points).filter((p) => p.ts >= from);
  const unit = view === "yoy" ? "%" : s.def.unit;
  const h = headline(s);
  const link = (patch: Record<string, string>) => `?${new URLSearchParams({ view, range: sp.range ?? "10y", ...patch })}`;
  const recent = [...pts].slice(-12).reverse();
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Label><Link href="/macro" className="hover:underline">Economy</Link></Label>
        <h1 className="text-xl md:text-display">{s.def.name}</h1>
        <p className="max-w-prose text-muted">{s.def.about}</p>
        <p className="tabular text-2xl">{h.value} <span className="text-sm text-muted">{h.sub}</span></p>
        <PinSeries id={s.def.id} name={s.def.name} pinned={pins.includes(s.def.id)} />
      </div>
      {s.stale && <Banner tone="warning">FRED isn&apos;t answering, so this is the copy from {new Date(s.fetchedAt).toISOString().slice(0, 16).replace("T", " ")} UTC.</Banner>}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2 text-sm">
          {s.yoyPoints && (
            <nav aria-label="Show as" className="flex gap-1">
              {(["yoy", "level"] as const).map((k) => <Link key={k} href={link({ view: k })} aria-current={view === k ? "page" : undefined}
                className={cx("rounded-md px-3 py-1 font-semibold", view === k ? "bg-accent text-on-accent" : "hover:bg-surface-sunken")}>{k === "yoy" ? "Change over a year" : "Level"}</Link>)}
            </nav>
          )}
          <nav aria-label="Period" className="flex gap-1">
            {RANGES.map(([k]) => <Link key={k} href={link({ range: k })} aria-current={(sp.range ?? "10y") === k ? "page" : undefined}
              className={cx("rounded-md px-3 py-1 font-semibold", (sp.range ?? "10y") === k ? "bg-accent text-on-accent" : "hover:bg-surface-sunken")}>{k === "max" ? "All" : k.replace("y", " years")}</Link>)}
          </nav>
        </div>
        <ValueChart points={pts} unit={unit} title={`${s.def.name}${view === "yoy" ? ", change over a year" : ""}`} zeroLine={view === "yoy" || s.def.id === "T10Y2Y"} />
        <p className="text-xs text-muted">Source: <a href={`https://fred.stlouisfed.org/series/${s.def.id}`} target="_blank" rel="noopener noreferrer" className="underline">FRED, Federal Reserve Bank of St. Louis</a>
          {s.def.unit && view === "level" ? ` · in ${s.def.unit}` : ""} · {s.def.freq}.</p>
      </Card>
      <Section id="values" title="Latest values">
        <div tabIndex={0} role="region" aria-label="Latest values table" className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">The 12 latest values, newest first</caption>
            <thead className="bg-surface-sunken text-2xs uppercase tracking-wide text-subtle"><tr><th scope="col" className="px-3 py-2 text-left">Date</th><th scope="col" className="px-3 py-2 text-right">{view === "yoy" ? "Change over a year" : "Value"}</th></tr></thead>
            <tbody>{recent.map((p) => <tr key={p.ts} className="border-t"><td className="px-3 py-2">{new Date(p.ts).toISOString().slice(0, 10)}</td><td className="tabular px-3 py-2 text-right">{fmtValue(p.v, unit)}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
