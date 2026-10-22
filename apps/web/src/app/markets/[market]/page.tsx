import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForecastTable } from "@/components/ForecastTable";
import { MARKET_BLURB, MarketNav } from "@/components/MarketNav";
import { Banner, ButtonLink, Card, DemoNote, Label, PriceChange, Section } from "@/components/ui";
import { listForecasts, listMarkets, movers, outlook, watchlistSlugs, MARKETS } from "@/lib/data";
import { viewer } from "@/lib/session";

type P = { params: Promise<{ market: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { market } = await params;
  const m = MARKETS.find((x) => x.code === market);
  return { title: m ? `${m.name} forecasts` : "Market" };
}

export default async function MarketOverview({ params }: P) {
  const { market } = await params;
  const v = await viewer();
  const markets = listMarkets(v);
  const m = markets.find((x) => x.code === market);
  if (!m) notFound();
  const data = await listForecasts(v, { market: m.code, perPage: 10, sort: "7d" });
  const ol = await outlook({ ...v, plan: { ...v.plan, markets: v.plan.markets.filter((x) => x === m.code) } }, "7d");
  const mv = await movers({ ...v, plan: { ...v.plan, markets: v.plan.markets.filter((x) => x === m.code) } }, "7d", 3);
  const starMode = !v.user ? "guest" : v.plan.watchlistAlerts ? "ok" : "no-plan";

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <Label>Market</Label>
        <h1 className="text-xl">{m.name}</h1>
        <p className="max-w-prose text-muted">{MARKET_BLURB[m.code]}</p>
      </header>
      <MarketNav markets={markets} active={m.code} page="overview" />
      {m.locked && <Banner>{m.name} isn&apos;t in your plan, so its forecasts are locked. Long-term scenarios and the daily signal on each asset page stay free. <Link href="/pricing" className="font-semibold underline">Compare plans</Link></Banner>}

      {!m.locked && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="p-4">
            <Label>Next 7 days</Label>
            <p className="mt-2 text-lg"><span className="text-up">{ol.up} higher</span> · <span className="text-down">{ol.down} lower</span></p>
            <p className="text-sm text-muted">of {ol.total} {m.name.toLowerCase()} assets you can see</p>
          </Card>
          {([["Most expected to rise", mv.gainers], ["Most expected to fall", mv.losers]] as const).map(([t, list]) => (
            <Card key={t} className="p-4">
              <Label>{t}</Label>
              {list.length ? <ul className="mt-2 grid gap-1">{list.map((x) => (
                <li key={x.asset.slug} className="flex justify-between gap-2 text-sm"><Link prefetch={false} href={`/assets/${x.asset.slug}`} className="truncate font-semibold hover:underline">{x.asset.name}</Link><PriceChange value={x.changePct} /></li>
              ))}</ul> : <p className="mt-2 text-sm text-muted">None this week.</p>}
            </Card>
          ))}
        </div>
      )}

      <Section id="top" title="Biggest 7-day forecasts" action={<Link href={`/forecasts?market=${m.code}`} className="text-sm font-semibold text-accent hover:underline">Open in the full table</Link>}>
        <ForecastTable data={data} tab="investing" visible={["price", "1d", "7d", "1m", "signal", "volatility"]} base={`/forecasts`}
          current={{ market: m.code }} watchlist={await watchlistSlugs(v)} starMode={starMode} />
      </Section>
      <div className="flex justify-center"><ButtonLink href={`/markets/${m.code}/assets`} variant="secondary">All {data.total} {m.name.toLowerCase()} assets</ButtonLink></div>
    </div>
  );
}
