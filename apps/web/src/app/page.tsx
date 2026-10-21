import Link from "next/link";
import { BarChart3, Bell, ShieldCheck } from "lucide-react";
import { ForecastTable } from "@/components/ForecastTable";
import { TabSwitch } from "@/components/HubControls";
import { Banner, ButtonLink, Card, DemoNote, Label, Section } from "@/components/ui";
import { MARKETS, listAssets, listForecasts, watchlistSlugs } from "@/lib/data";
import { dateTime } from "@/lib/format";
import { parseForecastQuery, type SP } from "@/lib/query";
import { viewer } from "@/lib/session";

export const metadata = { title: { absolute: "App name: price forecasts you can check" } };

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const v = await viewer();
  const sp = await searchParams;
  const q = parseForecastQuery(sp, { perPage: 10 });
  const data = listForecasts(v, { ...q, market: "crypto", perPage: 10, page: 1 });
  const starMode = !v.user ? "guest" : v.plan.watchlistAlerts ? "ok" : "no-plan";

  return (
    <div className="space-y-16">
      {sp.deleted && <Banner>Your account and everything in it has been deleted.</Banner>}
      <section className="grid gap-6 py-6 md:py-10">
        <Label>Forecasts with receipts</Label>
        <h1 className="max-w-3xl text-xl md:text-display">See where prices could go, and how often we&apos;ve been right.</h1>
        <p className="max-w-prose text-base text-muted">
          Next-day to next-month ranges and buy or sell signals for crypto and six other markets. Every forecast is stored when we publish
          it and scored when its date arrives, so the accuracy number is measured, never claimed.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/forecasts" size="lg">Browse forecasts</ButtonLink>
          <ButtonLink href="/track-record" size="lg" variant="secondary">See the track record</ButtonLink>
        </div>
        <dl className="grid max-w-3xl grid-cols-2 gap-4 pt-4 md:grid-cols-4">
          {[[String(MARKETS.length), "markets"], [String(listAssets().length), "assets"], ["5", "signal timeframes"], ["Hourly", "forecast runs"]].map(([n, l]) => (
            <div key={l}><dt className="sr-only">{l}</dt><dd><span className="block text-xl">{n}</span><span className="text-sm text-muted">{l}</span></dd></div>
          ))}
        </dl>
      </section>

      <Section id="today" title="Crypto signals right now" action={<Link href="/forecasts?market=crypto" className="text-sm font-semibold text-accent hover:underline">Full table</Link>}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabSwitch tab={q.tab} base="/" current={q} dayLocked={!v.plan.dayTrading} />
          <span className="flex items-center gap-2 text-xs text-subtle"><DemoNote />Run of {dateTime(data.runAt)}</span>
        </div>
        {data.tabLocked ? (
          <Card className="p-6 text-sm text-muted">Intraday signals are on the Crypto plan and up. <Link className="font-semibold text-accent underline" href="/pricing?plan=crypto">See plans</Link></Card>
        ) : (
          <ForecastTable data={data} tab={q.tab} visible={["price", "1d", "7d", "1m", "signal", "volatility"]} base="/" current={q}
            watchlist={watchlistSlugs(v)} starMode={starMode} />
        )}
      </Section>

      <Section id="how" title="How it works">
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            [BarChart3, "Ranges, not guesses", "For each asset we look at what happened after past setups like today's and show the middle 80% of outcomes, with the share that ended higher."],
            [ShieldCheck, "Scored in public", "Forecasts can't be edited after they're published. When the date passes we score them and add the result to the track record."],
            [Bell, "Told when it changes", "Follow assets on a watchlist and get an alert when a price level breaks or a signal flips."],
          ].map(([Icon, t, d], i) => {
            const I = Icon as typeof BarChart3;
            return (
              <li key={String(t)}>
                <Card className="h-full space-y-2 p-5">
                  <span className="flex items-center gap-2 text-accent"><I aria-hidden className="h-5 w-5" /><span className="text-2xs uppercase tracking-wide">Step {i + 1}</span></span>
                  <h3 className="text-base font-semibold">{String(t)}</h3>
                  <p className="text-sm text-muted">{String(d)}</p>
                </Card>
              </li>
            );
          })}
        </ol>
      </Section>

      <Card className="flex flex-wrap items-center justify-between gap-4 p-6 md:p-8">
        <div className="max-w-prose space-y-1">
          <h2 className="text-lg">Free for the 10 largest crypto assets</h2>
          <p className="text-sm text-muted">Upgrade for every crypto asset, intraday signals, forex and more markets, a watchlist and alerts.</p>
        </div>
        <ButtonLink href={v.user ? "/pricing" : "/sign-up"}>{v.user ? "See plans" : "Create a free account"}</ButtonLink>
      </Card>
    </div>
  );
}
