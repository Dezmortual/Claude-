import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { Banner, Card, EmptyState, Label, Section } from "@/components/ui";
import { trackRecord } from "@/lib/data";

export const metadata = { title: "Track record", description: "Every forecast we publish is scored when its date arrives. This is where the results live." };

const H: Record<string, string> = { "1d": "Next day", "7d": "7 days", "1m": "1 month" };
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

export default async function TrackRecord() {
  const rows = await trackRecord();
  const total = rows.reduce((a, r) => a + r.n, 0);
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Label>Track record</Label>
        <h1 className="text-xl md:text-display">Every forecast, scored. Misses included.</h1>
        <p className="max-w-prose text-muted">
          Forecasts are locked when they&apos;re published (hourly) and compared with what actually happened once their target
          time passes. Wins and misses alike, for every live asset. Demo-data assets are never scored.
        </p>
      </div>
      {!rows.length ? (
        <Card>
          <EmptyState icon={<ClipboardCheck aria-hidden className="h-6 w-6" />} title="Nothing scored yet">
            The first results appear a day after the publish job starts running. Give it about a month before reading anything into them.
          </EmptyState>
        </Card>
      ) : (
        <>
          {total < 300 && <Banner tone="warning">Only {total} forecasts scored so far. Small samples swing a lot; treat these as early numbers.</Banner>}
          <div tabIndex={0} role="region" aria-label="Scrollable table" className="relative overflow-x-auto rounded-lg border bg-surface">
            <table className="w-full text-sm">
              <caption className="px-4 pt-4 text-left text-sm font-semibold">By market and horizon</caption>
              <thead><tr className="text-2xs uppercase tracking-wide text-subtle">
                <th scope="col" className="px-4 py-2 text-left">Market</th><th scope="col" className="px-4 py-2 text-left">Horizon</th>
                <th scope="col" className="px-4 py-2 text-right">Forecasts</th><th scope="col" className="px-4 py-2 text-right">Direction right</th>
                <th scope="col" className="px-4 py-2 text-right">Inside the 80% range</th><th scope="col" className="px-4 py-2 text-right">Median error</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.market}-${r.horizon}`} className="border-t">
                    <th scope="row" className="px-4 py-2 text-left font-normal capitalize">{r.market}</th>
                    <td className="px-4 py-2">{H[r.horizon] ?? r.horizon}</td>
                    <td className="tabular px-4 py-2 text-right">{r.n}</td>
                    <td className="tabular px-4 py-2 text-right">{pct(r.hit_rate)}</td>
                    <td className={`tabular px-4 py-2 text-right ${Math.abs(r.coverage - 0.8) > 0.1 ? "text-warning" : ""}`}>{pct(r.coverage)}</td>
                    <td className="tabular px-4 py-2 text-right">{r.median_err.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Section id="measure" title="How to read it">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            ["Direction right", "How often the price ended on the side of the starting price that the midpoint pointed to. A coin flip scores about 50%."],
            ["Inside the 80% range", "How often the price landed inside the range. Near 80% means the ranges are honest; far from it is flagged."],
            ["Median error", "The typical distance between the midpoint and the real price, in percent."],
          ].map(([t, d]) => <Card key={t} className="space-y-2 p-5"><h3 className="text-base font-semibold">{t}</h3><p className="text-sm text-muted">{d}</p></Card>)}
        </div>
        <p className="text-sm"><Link href="/forecasts" className="font-semibold text-accent underline">Back to forecasts</Link></p>
      </Section>
    </div>
  );
}
