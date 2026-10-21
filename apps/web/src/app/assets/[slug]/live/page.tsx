import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetHeader } from "@/components/AssetHeader";
import { Converter } from "@/components/client/Converter";
import { LiveQuote } from "@/components/client/LiveQuote";
import { PriceChart } from "@/components/client/PriceChart";
import { Card, Label, Paywall, PriceChange, Section, SignalBadge, StatCard } from "@/components/ui";
import { assetBars, assetSignals, assetStats, assetSummary, getAsset } from "@/lib/data";
import { price as fmtPrice } from "@/lib/format";
import { viewer } from "@/lib/session";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P) {
  const a = getAsset((await params).slug);
  return a ? { title: `${a.name} live price` } : {};
}

export default async function LivePrice({ params }: P) {
  const { slug } = await params;
  if (!getAsset(slug)) notFound();
  const v = await viewer();
  const { asset, quote, metrics, locked, unlockPlan } = await assetSummary(v, slug);
  const stats = await assetStats(slug);
  const range = locked ? "1m" : "1d";
  const chart = await assetBars(v, slug, range);
  const daily = (await assetSignals(v, slug)).find((c) => c.timeframe === "1d")!;
  const unit = asset.quoteUnit;

  return (
    <div className="space-y-10">
      <AssetHeader asset={asset} quote={quote} metrics={metrics} viewer={v} current="live" title={`${asset.name} price today`}
        priceSlot={<LiveQuote slug={slug} unit={unit} initial={quote} />} />

      <Card className="p-4 md:p-6">
        <PriceChart slug={slug} name={asset.name} unit={unit} initial={chart.bars} initialRange={range} forecast={null} intradayLocked={locked} />
      </Card>
      {locked && <Paywall compact planName={unlockPlan.name} href={`/pricing?plan=${unlockPlan.code}`}>Intraday charts for {asset.name} are on the <b className="text-fg">{unlockPlan.name}</b> plan.</Paywall>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Last 24 hours" value={<span className="text-lg">{fmtPrice(stats.day.lo, unit)} – {fmtPrice(stats.day.hi, unit)}</span>}
          sub={stats.day.short ? "Partial: the market was closed for part of the day" : "Low to high"} />
        <StatCard label="52 weeks" value={<span className="text-lg">{fmtPrice(stats.week52.lo, unit)} – {fmtPrice(stats.week52.hi, unit)}</span>} sub="Low to high" />
        <StatCard label="Up days, last 30" value={`${stats.upDays30} of ${stats.days30}`} sub="Daily closes higher than the day before" />
        <StatCard label="Volatility, 30 days" value={`${metrics.volatilityPct.toFixed(0)}%`} sub="Annualised" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="space-y-3 p-5">
          <h2 className="text-lg">Performance</h2>
          <dl className="grid gap-2 text-sm">
            {([["7 days", stats.change["7d"]], ["30 days", stats.change["30d"]], ["1 year", stats.change["1y"]]] as const).map(([l, x]) => (
              <div key={l} className="flex justify-between"><dt className="text-muted">{l}</dt><dd><PriceChange value={x} /></dd></div>
            ))}
          </dl>
        </Card>
        <Card className="space-y-3 p-5">
          <h2 className="text-lg">Today&apos;s read</h2>
          <div className="flex items-center gap-2"><Label>Daily signal</Label><SignalBadge signal={daily.verdict} /></div>
          <p className="text-sm text-muted">
            {daily.verdict === "unavailable" ? daily.reason : `${daily.ma.buy + daily.osc.buy} of 20 indicators lean buy, ${daily.ma.sell + daily.osc.sell} lean sell.`}
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/assets/${slug}`} className="font-semibold text-accent hover:underline">See the forecast</Link>
            <Link href={`/assets/${slug}/signals`} className="font-semibold text-accent hover:underline">All signals</Link>
          </div>
        </Card>
        <Card className="space-y-3 p-5">
          <h2 className="text-lg">Convert</h2>
          <Converter ticker={asset.ticker} price={quote.price} />
        </Card>
      </div>

      <Section id="about" title={`About ${asset.name}`}>
        <p className="max-w-prose text-sm text-muted">
          {asset.name} trades as {asset.ticker}, quoted in {unit}.{asset.meta.maxSupply ? ` At most ${asset.meta.maxSupply.toLocaleString("en-US")} ${asset.ticker} can ever exist.` : ""}{" "}
          Prices on this page come from our primary source and are checked against a second one every minute.
        </p>
      </Section>
    </div>
  );
}
