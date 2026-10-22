import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/client/AutoRefresh";
import { Sparkline } from "@/components/Sparkline";
import { AssetMark, Card, DemoNote, PriceChange, SignalBadge } from "@/components/ui";
import { glance } from "@/lib/data";
import { price } from "@/lib/format";
import { viewer } from "@/lib/session";

export const metadata = { title: "Glance" };

/** The home-screen view: what you follow, how it moved today, and the latest alerts, on one screen. */
export default async function Glance() {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/glance");
  const g = await glance(v);
  const t = (iso: string, withDay = false) => new Date(iso).toLocaleString("en-GB", { timeZone: g.tz, hour: "2-digit", minute: "2-digit", ...(withDay ? { day: "numeric", month: "short" } : {}) });
  return (
    <div className="mx-auto max-w-prose space-y-4">
      <AutoRefresh seconds={60} />
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl">Glance</h1>
        <p className="text-xs text-muted">Updated {t(g.at)} · every minute</p>
      </div>
      {!g.fromWatchlist && (
        <p className="text-sm text-muted">Your watchlist is empty, so this shows one asset per market. <Link href="/forecasts" className="font-semibold text-accent underline">Star assets</Link> to see yours here.</p>
      )}
      <ul className="grid gap-2">
        {g.rows.map((r) => (
          <li key={r.asset.slug}>
            <Link href={`/assets/${r.asset.slug}`} prefetch={false} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
              <Card className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3 hover:bg-surface-sunken">
                <AssetMark ticker={r.asset.ticker} slug={r.asset.slug} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{r.asset.name}</span>
                  {r.locked ? <span className="text-xs text-muted">Not on your plan</span>
                    : r.demo ? <DemoNote /> : r.signal && <SignalBadge signal={r.signal} pUp={r.pUp} />}
                </span>
                <span className="grid justify-items-end">
                  <span className="tabular font-semibold">{r.locked ? "—" : price(r.price, r.asset.quoteUnit)}</span>
                  {!r.locked && <PriceChange value={r.change24hPct} suffix="24h" className="text-xs" />}
                </span>
                {r.spark.length > 1 && <Sparkline values={r.spark} className="col-span-3 h-6" />}
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <section aria-labelledby="glance-alerts" className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 id="glance-alerts" className="text-base font-semibold">Latest alerts</h2>
          <Link href="/alerts" className="text-sm font-semibold text-accent underline">All alerts</Link>
        </div>
        {!g.alerts.length ? <p className="text-sm text-muted">None has fired yet.</p> : (
          <ul className="grid gap-2">
            {g.alerts.map((e) => (
              <li key={e.id} className="rounded-lg border bg-surface p-3 text-sm">
                <p>{e.message}</p>
                <p className="mt-1 text-xs text-muted">Fired {t(e.firedAt, true)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
