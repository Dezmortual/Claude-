import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DcfCalc } from "@/components/client/DcfCalc";
import { Banner, Card, Label, Section, StatCard } from "@/components/ui";
import { DataError, companyFundamentals, getAsset, hasFundamentals } from "@/lib/data";
import { viewer } from "@/lib/session";

export const metadata = { title: "Fundamentals" };
const bn = (x: number | null) => (x === null ? "—" : `${x < 0 ? "−" : ""}$${Math.abs(x / 1e9).toLocaleString("en-US", { maximumFractionDigits: 1 })}bn`);
const r1 = (x: number | null | undefined, suffix = "") => (x === null || x === undefined ? "—" : `${x.toFixed(1)}${suffix}`);

export default async function Fundamentals({ params }: { params: Promise<{ slug: string }> }) {
  const v = await viewer();
  const { slug } = await params;
  if (!v.user) redirect(`/sign-in?next=/assets/${slug}/fundamentals`);
  const a = getAsset(slug);
  if (!a || !hasFundamentals(slug)) notFound();
  let f: Awaited<ReturnType<typeof companyFundamentals>> | null = null, problem: string | null = null;
  try { f = await companyFundamentals(v, slug); } catch (e) { if (e instanceof DataError) problem = e.message; else throw e; }
  const rows: [string, (y: NonNullable<typeof f>["years"][number]) => string][] = [
    ["Revenue", (y) => bn(y.revenue)], ["Net profit", (y) => bn(y.netIncome)], ["Earnings a share", (y) => (y.eps === null ? "—" : `$${y.eps.toFixed(2)}`)],
    ["Operating cash flow", (y) => bn(y.ocf)], ["Spending on equipment", (y) => bn(y.capex)], ["Free cash flow", (y) => bn(y.fcf)],
    ["Cash", (y) => bn(y.cash)], ["Long-term debt", (y) => bn(y.debt)], ["Shareholders' equity", (y) => bn(y.equity)],
  ];
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Label><Link href={`/assets/${slug}`} className="hover:underline">{a.name}</Link></Label>
        <h1 className="text-xl md:text-display">{a.name} fundamentals</h1>
        <p className="max-w-prose text-muted">From {f?.name ?? a.name}&apos;s annual reports (10-K) filed with the US Securities and Exchange Commission, read through EDGAR. Fiscal years end when the company&apos;s does.</p>
      </div>
      {problem && <Banner tone="warning">{problem}</Banner>}
      {f && f.last && (
        <>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <li><StatCard label="Price to earnings" value={r1(f.ratios?.pe)} sub={`Price ÷ ${f.last.fy} earnings a share`} /></li>
            <li><StatCard label="Price to sales" value={r1(f.ratios?.ps)} sub={`Company value ${bn(f.mcap)}`} /></li>
            <li><StatCard label="Free cash flow yield" value={r1(f.ratios?.fcfYield, "%")} sub="Free cash flow ÷ company value" /></li>
            <li><StatCard label="Net margin" value={r1(f.ratios?.netMargin, "%")} sub={`Revenue growth ${r1(f.ratios?.revenueGrowth, "%")} a year`} /></li>
          </ul>
          <Section id="years" title="Year by year">
            <div tabIndex={0} role="region" aria-label="Annual figures table" className="overflow-x-auto rounded-lg border bg-surface">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">Figures from each annual report</caption>
                <thead className="bg-surface-sunken text-2xs uppercase tracking-wide text-subtle"><tr><th scope="col" className="px-3 py-2 text-left"><span className="sr-only">Figure</span></th>
                  {f.years.map((y) => <th key={y.end} scope="col" className="px-3 py-2 text-right">FY{y.fy}</th>)}</tr></thead>
                <tbody>{rows.map(([k, fn]) => (
                  <tr key={k} className="border-t"><th scope="row" className="px-3 py-2 text-left font-normal text-muted">{k}</th>
                    {f!.years.map((y) => <td key={y.end} className="tabular px-3 py-2 text-right">{fn(y)}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
            <p className="text-xs text-muted">Source: <a className="underline" target="_blank" rel="noopener noreferrer" href={`https://www.sec.gov/edgar/browse/?CIK=${f.cik}`}>SEC EDGAR</a>{f.stale ? " · the SEC isn't answering, so this is the last copy" : ""}.</p>
          </Section>
          <Section id="dcf" title="What it could be worth">
            {f.last.fcf && f.last.fcf > 0 && f.shares ? (
              <Card className="p-5"><DcfCalc fcf={f.last.fcf} netCash={f.ratios?.netCash ?? 0} shares={f.shares} price={f.price}
                defaultGrowth={Math.max(0, Math.min(15, f.ratios?.revenueGrowth ?? 5))} /></Card>
            ) : <p className="text-sm text-muted">A cash-flow value needs a positive free cash flow in the last year, and the share count.</p>}
          </Section>
        </>
      )}
    </div>
  );
}
