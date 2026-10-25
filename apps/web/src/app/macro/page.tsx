import Link from "next/link";
import { redirect } from "next/navigation";
import { MacroCard } from "@/components/MacroCard";
import { Button, Label, Section } from "@/components/ui";
import { MACRO_GROUPS, macroOverview } from "@/lib/data";
import { viewer } from "@/lib/session";

export const metadata = { title: "Economy" };
export const maxDuration = 60;

export default async function Macro({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/macro");
  const code = (await searchParams).code?.trim().toUpperCase();
  if (code && /^[A-Z0-9_.]{1,30}$/.test(code)) redirect(`/macro/${code}`);
  const all = await macroOverview(v);
  return (
    <div className="space-y-12">
      <div className="space-y-3">
        <Label>Economy</Label>
        <h1 className="text-xl md:text-display">The economy behind the markets</h1>
        <p className="max-w-prose text-muted">
          Inflation, jobs, growth, interest rates and money, from the St. Louis Fed&apos;s FRED database, refreshed twice a day. Compare countries with the World Bank&apos;s
          figures, or see what prediction markets are betting on.
        </p>
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link href="/macro/world" className="text-accent underline">Compare countries</Link>
          <Link href="/predictions" className="text-accent underline">Prediction markets</Link>
        </div>
        <form method="get" className="flex max-w-md items-end gap-2">
          <div className="grid flex-1 gap-1"><label htmlFor="code" className="text-xs font-semibold">Open any FRED series by its code</label>
            <input id="code" name="code" placeholder="e.g. SP500 or CPIAUCSL" className="h-10 rounded-md border border-input bg-surface px-3 text-sm uppercase text-fg" /></div>
          <Button type="submit" size="sm" variant="secondary">Open</Button>
        </form>
      </div>
      {MACRO_GROUPS.map((g) => {
        const xs = all.filter((s) => s.def.group === g);
        return xs.length ? (
          <Section key={g} id={g.toLowerCase().replace(/\W+/g, "-")} title={g}>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{xs.map((s) => <li key={s.def.id}><MacroCard s={s} /></li>)}</ul>
          </Section>
        ) : null;
      })}
      {all.length === 0 && <p className="text-sm text-muted">FRED isn&apos;t answering right now. Try again in a few minutes.</p>}
    </div>
  );
}
