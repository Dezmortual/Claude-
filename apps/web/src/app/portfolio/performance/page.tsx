import { redirect } from "next/navigation";
import { EquityChart } from "@/components/EquityChart";
import { PortfolioNav } from "@/components/PortfolioNav";
import { BenchmarkPicker } from "@/components/client/PortfolioForms";
import { Banner, Card, EmptyState, Label, Section, StatCard, cx } from "@/components/ui";
import { BENCHMARKS, getAsset, portfolioPerformance } from "@/lib/data";
import { price } from "@/lib/format";
import { viewer } from "@/lib/session";

export const metadata = { title: "Portfolio performance" };
const p = (x: number | null, d = 1) => (x === null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}%`);
const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function Performance() {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/portfolio/performance");
  const r = await portfolioPerformance(v);
  const benchOpts = BENCHMARKS.map((s) => ({ slug: s, name: getAsset(s)!.name }));
  const years = [...new Set(r.periods.months.map((m) => m.month.slice(0, 4)))].sort().reverse();
  const cell = (y: string, m: number) => r.periods.months.find((x) => x.month === `${y}-${String(m + 1).padStart(2, "0")}`)?.pct ?? null;
  const benchTotal = r.benchPoints.length ? (r.benchPoints.at(-1)!.v - 1) * 100 : null;
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Label>Portfolio</Label>
        <h1 className="text-xl md:text-display">Performance</h1>
        <PortfolioNav at="/portfolio/performance" />
        <p className="max-w-prose text-muted">
          The time-weighted return: how your holdings did, with money you put in or took out left out, so a big purchase doesn&apos;t look like a gain.
          Worked out day by day from the ledger and each asset&apos;s closing prices.
        </p>
      </div>
      {!r.points.length ? <Card><EmptyState title="Nothing to measure yet">Add a purchase with a date to see how it has done since.</EmptyState></Card> : (
        <>
          {r.undated && <Banner tone="info">Some purchases have no date, so they&apos;re counted as held from the start of the chart. Add their dates on the Ledger page for a truer line.</Banner>}
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <li><StatCard label="Return" value={p(r.twr)} tone={r.twr >= 0 ? "up" : "down"} sub={`Since ${day(r.points[0].ts)}`} /></li>
            <li><StatCard label="Per year" value={p(r.annual)} sub={r.annual === null ? "Under half a year so far" : "Compounded"} /></li>
            <li><StatCard label="Worst drop" value={p(r.dd.worst)} tone="down" sub={r.dd.worst < 0 ? `${day(r.dd.from)} to ${day(r.dd.to)}` : "None yet"} /></li>
            <li><StatCard label={`${r.bench.name}, same days`} value={p(benchTotal)} sub={benchTotal === null ? "" : `You ${r.twr >= benchTotal ? "beat" : "trailed"} it by ${Math.abs(r.twr - benchTotal).toFixed(1)} points`} /></li>
          </ul>
          {r.money && (
            <Card className="grid gap-1 p-5 text-sm">
              <h2 className="font-semibold">Money in and out</h2>
              <p>Paid in {price(r.money.paid)} · taken out (sales and dividends) {price(r.money.back)} · worth now {price(r.money.now)}</p>
              <p className={cx("font-semibold", r.money.profit >= 0 ? "text-up" : "text-down")}>{r.money.profit >= 0 ? "Profit" : "Loss"} so far: {price(Math.abs(r.money.profit))}</p>
            </Card>
          )}
          <Card className="space-y-3 p-4">
            <BenchmarkPicker options={benchOpts} value={r.bench.slug} />
            <EquityChart title="Your portfolio's growth of 1" curves={[{ label: "Your portfolio", points: r.points, tone: "line" },
              ...(r.benchPoints.length ? [{ label: r.bench.name, points: r.benchPoints, tone: "hold" as const, dashed: true }] : [])]} />
          </Card>
          <Section id="months" title="Month by month">
            <div tabIndex={0} role="region" aria-label="Monthly returns table" className="overflow-x-auto rounded-lg border bg-surface">
              <table className="w-full min-w-[720px] text-xs">
                <caption className="sr-only">Return in each month and year</caption>
                <thead className="bg-surface-sunken text-2xs uppercase tracking-wide text-subtle"><tr><th scope="col" className="px-2 py-2 text-left">Year</th>
                  {MONTHS.map((m) => <th key={m} scope="col" className="px-2 py-2 text-right">{m}</th>)}<th scope="col" className="px-2 py-2 text-right">Year</th></tr></thead>
                <tbody>{years.map((y) => (
                  <tr key={y} className="border-t"><th scope="row" className="px-2 py-2 text-left font-semibold">{y}</th>
                    {MONTHS.map((_, m) => { const c = cell(y, m); return <td key={m} className={cx("tabular px-2 py-2 text-right", c !== null && (c >= 0 ? "text-up" : "text-down"))}>{c === null ? "" : p(c)}</td>; })}
                    <td className="tabular px-2 py-2 text-right font-semibold">{p(r.periods.years.find((x) => x.year === y)?.pct ?? null)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
