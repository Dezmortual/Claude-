import Link from "next/link";
import { redirect } from "next/navigation";
import { Star } from "lucide-react";
import { WatchStar } from "@/components/client/WatchStar";
import { AssetCell, ButtonLink, Card, DemoNote, EmptyState, Label, Paywall, PriceChange, SignalBadge } from "@/components/ui";
import { getWatchlist, planFor } from "@/lib/data";
import { price as fmtPrice } from "@/lib/format";
import { viewer } from "@/lib/session";

export const metadata = { title: "Watchlist" };

export default async function Watchlist() {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/watchlist");
  const head = (
    <div className="mb-6 space-y-2">
      <Label>Watchlist</Label>
      <h1 className="text-xl">Your watchlist</h1>
    </div>
  );
  if (!v.plan.watchlistAlerts) {
    return <>{head}<Paywall planName="Crypto" href="/pricing?plan=crypto&need=watchlist">Keep the assets you follow in one place, with live prices and signals. Watchlists start on the <b className="text-fg">Crypto</b> plan.</Paywall></>;
  }
  const rows = await getWatchlist(v);
  return (
    <>
      {head}
      {!rows.length ? (
        <Card><EmptyState icon={<Star aria-hidden className="h-6 w-6" />} title="Your watchlist is empty"
          action={<ButtonLink href="/forecasts">Browse forecasts</ButtonLink>}>Star any asset to keep it here.</EmptyState></Card>
      ) : (
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.asset.slug}>
              <Card className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1"><AssetCell name={r.asset.name} ticker={r.asset.ticker} slug={r.asset.slug} href={`/assets/${r.asset.slug}`} demo={r.demo} via={r.demo ? undefined : r.asset.meta.proxy} /></div>
                {r.locked ? (
                  <p className="flex-1 text-sm text-muted">Not in your current plan. <Link prefetch={false} href={`/pricing?plan=${planFor(r.asset).code}`} className="font-semibold text-accent underline">{planFor(r.asset).name} plan</Link></p>
                ) : (
                  <>
                    <div className="grid justify-items-start sm:justify-items-end">
                      <span className="tabular font-semibold">{fmtPrice(r.price, r.asset.quoteUnit)}</span>
                      <PriceChange value={r.change24hPct} suffix="24h" className="text-xs" />
                    </div>
                    <div className="grid justify-items-start gap-1 sm:justify-items-end">
                      <span className="text-xs text-muted">7 days <PriceChange value={r.horizons?.["7d"]?.changePct} /></span>
                      <SignalBadge signal={r.signal!} pUp={r.pUp} />
                    </div>
                  </>
                )}
                <WatchStar slug={r.asset.slug} name={r.asset.name} on mode="ok" />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
