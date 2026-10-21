import { notFound } from "next/navigation";
import { AssetHeader } from "@/components/AssetHeader";
import { Pulse } from "@/components/client/Pulse";
import { Card, Section } from "@/components/ui";
import { assetSignals, assetSummary, getAsset } from "@/lib/data";
import { pct } from "@/lib/format";
import { viewer } from "@/lib/session";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P) {
  const a = getAsset((await params).slug);
  return a ? { title: `${a.name} technical signals` } : {};
}

export default async function Signals({ params }: P) {
  const { slug } = await params;
  if (!getAsset(slug)) notFound();
  const v = await viewer();
  const { asset, quote, metrics, unlockPlan } = await assetSummary(v, slug);
  const cards = await assetSignals(v, slug);
  return (
    <div className="space-y-10">
      <AssetHeader asset={asset} quote={quote} metrics={metrics} viewer={v} current="signals" title={`${asset.name} technical signals`} />
      <Section id="pulse" title="By timeframe">
        <p className="max-w-prose text-sm text-muted">Pick a timeframe to see how each of the twenty indicators reads it. Every reading uses bars that have already closed.</p>
        <Pulse cards={cards} upgradeHref={`/pricing?plan=${unlockPlan.code}`} />
      </Section>
      <Section id="trend" title="Trend at a glance">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="p-4 text-sm"><p className="text-muted">MACD</p><p className="text-lg">{metrics.macd === "bullish" ? "Above its signal line" : metrics.macd === "bearish" ? "Below its signal line" : "On its signal line"}</p></Card>
          <Card className="p-4 text-sm"><p className="text-muted">50-day vs 200-day average</p><p className="text-lg">{metrics.maCross === "golden" ? "50-day on top (golden cross)" : metrics.maCross === "death" ? "50-day below (death cross)" : "Level"}</p></Card>
          <Card className="p-4 text-sm"><p className="text-muted">Price vs 200-day average</p><p className="text-lg">{pct(metrics.pctFromMa200, 1)}, average trending {metrics.ma200Trend}</p></Card>
        </div>
      </Section>
      <Section id="reading" title="How to read these">
        <ul className="grid max-w-prose list-disc gap-2 pl-5 text-sm text-muted">
          <li>A moving average reads <b className="text-fg">buy</b> when the price is above it and <b className="text-fg">sell</b> when below.</li>
          <li>Oscillators like RSI read <b className="text-fg">buy</b> when the market looks stretched to the downside and <b className="text-fg">sell</b> when stretched up. That can disagree with the averages, and often does.</li>
          <li>The verdict balances all twenty: buys minus sells. It turns strong when that gap is more than 10 of the 20.</li>
          <li>Short timeframes flip often. They describe the last few hours, not where the price is heading next week.</li>
        </ul>
      </Section>
    </div>
  );
}
