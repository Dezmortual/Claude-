import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { MARKET_BLURB, MarketNav } from "@/components/MarketNav";
import { AssetMark, DemoNote, Label, SignalBadge } from "@/components/ui";
import { assetSignals, canSee, listAssets, listMarkets, type MarketCode } from "@/lib/data";
import { viewer } from "@/lib/session";

export async function generateMetadata({ params }: { params: Promise<{ market: string }> }) {
  return { title: `All ${(await params).market} assets` };
}

export default async function AssetDirectory({ params }: { params: Promise<{ market: string }> }) {
  const { market } = await params;
  const v = await viewer();
  const markets = listMarkets(v);
  const m = markets.find((x) => x.code === market);
  if (!m) notFound();
  const assets = listAssets(m.code as MarketCode);
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex items-center gap-2"><Label>{m.name}</Label><DemoNote /></div>
        <h1 className="text-xl">All {m.name.toLowerCase()} assets</h1>
        <p className="max-w-prose text-muted">{MARKET_BLURB[m.code]} The badge is today&apos;s daily technical signal, free on every asset.</p>
      </header>
      <MarketNav markets={markets} active={m.code} page="assets" />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {assets.map((a) => {
          const daily = assetSignals(v, a.slug).find((c) => c.timeframe === "1d")!;
          return (
            <li key={a.slug}>
              <Link href={`/assets/${a.slug}`} className="grid h-full gap-3 rounded-lg border bg-surface p-4 shadow-card hover:bg-surface-sunken">
                <span className="flex min-w-0 items-center gap-3">
                  <AssetMark ticker={a.ticker} />
                  <span className="min-w-0"><span className="block font-semibold">{a.name}</span><span className="font-mono text-xs text-subtle">{a.ticker}</span></span>
                </span>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <SignalBadge signal={daily.verdict} />
                  {!canSee(v, a) && <span className="inline-flex items-center gap-1 text-xs text-subtle"><Lock aria-hidden className="h-3 w-3" />Forecast locked</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
