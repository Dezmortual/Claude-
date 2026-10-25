import Link from "next/link";
import { redirect } from "next/navigation";
import { Banner, Card, Label, cx } from "@/components/ui";
import { DataError, WORLD, worldCompare } from "@/lib/data";
import { viewer } from "@/lib/session";

export const metadata = { title: "Compare countries" };

export default async function World({ searchParams }: { searchParams: Promise<{ i?: string }> }) {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/macro/world");
  const wanted = (await searchParams).i;
  const ind = WORLD.find((w) => w.id === wanted) ?? WORLD[0];
  let data: Awaited<ReturnType<typeof worldCompare>> | null = null, problem: string | null = null;
  try { data = await worldCompare(v, ind.id); } catch (e) { if (e instanceof DataError) problem = e.message; else throw e; }
  const years = data ? [...new Set(data.countries.flatMap((c) => c.points.map((p) => new Date(p.ts).getUTCFullYear())))].sort().slice(-8) : [];
  const fmt = (x: number) => `${x.toFixed(1)}%`;
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Label><Link href="/macro" className="hover:underline">Economy</Link></Label>
        <h1 className="text-xl md:text-display">Compare countries</h1>
        <p className="max-w-prose text-muted">Yearly figures from the World Bank for ten large economies. They come out once a year, so the latest year can be missing for some countries.</p>
        <nav aria-label="Indicator" className="flex flex-wrap gap-1 text-sm">
          {WORLD.map((w) => <Link key={w.id} href={`?i=${w.id}`} aria-current={w.id === ind.id ? "page" : undefined}
            className={cx("rounded-md px-3 py-1 font-semibold", w.id === ind.id ? "bg-accent text-on-accent" : "hover:bg-surface-sunken")}>{w.name}</Link>)}
        </nav>
      </div>
      {problem && <Banner tone="warning">{problem}</Banner>}
      {data && (
        <Card className="p-0">
          <div tabIndex={0} role="region" aria-label="Countries table" className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="px-4 pt-4 text-left text-sm font-semibold">{ind.name}, {ind.unit}</caption>
              <thead className="text-2xs uppercase tracking-wide text-subtle"><tr><th scope="col" className="px-3 py-2 text-left">Country</th>
                {years.map((y) => <th key={y} scope="col" className="px-3 py-2 text-right">{y}</th>)}</tr></thead>
              <tbody>{data.countries.map((c) => (
                <tr key={c.country} className="border-t"><th scope="row" className="px-3 py-2 text-left font-semibold">{c.name}</th>
                  {years.map((y) => { const p = c.points.find((x) => new Date(x.ts).getUTCFullYear() === y); return <td key={y} className="tabular px-3 py-2 text-right">{p ? fmt(p.v) : ""}</td>; })}</tr>
              ))}</tbody>
            </table>
          </div>
          <p className="px-4 pb-4 text-xs text-muted">Source: <a href={`https://data.worldbank.org/indicator/${ind.id}`} target="_blank" rel="noopener noreferrer" className="underline">World Bank Open Data</a>.</p>
        </Card>
      )}
    </div>
  );
}
