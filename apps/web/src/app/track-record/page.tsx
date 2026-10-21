import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { Card, EmptyState, Label, Section } from "@/components/ui";

export const metadata = { title: "Track record", description: "Every forecast we publish is scored when its date arrives. This is where the results live." };

export default function TrackRecord() {
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Label>Track record</Label>
        <h1 className="text-xl md:text-display">How often our forecasts were right</h1>
        <p className="max-w-prose text-muted">
          Forecasts are locked when we publish them. When the target date passes we compare them with what actually happened and add
          the result here: wins and misses alike, for every asset and horizon.
        </p>
      </div>
      <Card>
        <EmptyState icon={<ClipboardCheck aria-hidden className="h-6 w-6" />} title="No scored forecasts yet">
          This build runs on demo data, so there is nothing real to score. The first results appear the day after live forecasts start,
          and the page is only meaningful after about a month of them.
        </EmptyState>
      </Card>
      <Section id="measure" title="What we'll measure">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            ["Direction hit rate", "How often the price ended on the side of today's price that the midpoint pointed to. A coin flip scores 50%."],
            ["Range coverage", "How often the price landed inside the 80% range. Close to 80% means the ranges are honest; far below means they're too narrow."],
            ["Typical error", "The median distance between the midpoint and the real price, in percent."],
          ].map(([t, d]) => (
            <Card key={t} className="space-y-2 p-5"><h3 className="text-base font-semibold">{t}</h3><p className="text-sm text-muted">{d}</p></Card>
          ))}
        </div>
        <p className="max-w-prose text-sm text-muted">Results will be split by market and horizon, with the number of forecasts behind each figure, so a good streak on ten forecasts can&apos;t pass for a record. <Link href="/forecasts" className="font-semibold text-accent underline">Back to forecasts</Link></p>
      </Section>
    </div>
  );
}
