import Link from "next/link";
import { Bell } from "lucide-react";
import type { Asset, Metrics, Quote, Viewer } from "@/lib/data";
import { watchlistSlugs } from "@/lib/data";
import { dateTime, pct, price as fmtPrice } from "@/lib/format";
import { WatchStar } from "./client/WatchStar";
import { Badge, DemoNote, PriceChange, cx } from "./ui";

const MARKET_NAME: Record<string, string> = { crypto: "Crypto", forex: "Forex", stocks: "Stocks", commodities: "Commodities", indices: "Indices", etfs: "ETFs", bonds: "Bonds & yields" };

export function AssetHeader({ asset, quote, viewer, current, title, priceSlot }: {
  asset: Asset; quote: Quote; metrics: Metrics; viewer: Viewer; current: "forecast" | "live" | "signals"; title: string;
  priceSlot?: React.ReactNode; // replaces the static price, e.g. with a live-updating one
}) {
  const tabs = [
    { key: "forecast", href: `/assets/${asset.slug}`, label: "Forecast" },
    { key: "live", href: `/assets/${asset.slug}/live`, label: "Live price" },
    { key: "signals", href: `/assets/${asset.slug}/signals`, label: "Signals" },
  ];
  const mode = !viewer.user ? "guest" : viewer.plan.watchlistAlerts ? "ok" : "no-plan";
  const tz = viewer.user?.timezone ?? "UTC";
  return (
    <header className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-xs text-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link href="/forecasts" className="hover:text-fg">Forecasts</Link></li>
          <li aria-hidden>›</li>
          <li><Link href={`/markets/${asset.market}`} className="hover:text-fg">{MARKET_NAME[asset.market]}</Link></li>
          <li aria-hidden>›</li>
          <li aria-current="page" className="text-fg">{asset.name}</li>
        </ol>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-subtle">{asset.ticker}</span>
            <DemoNote />
          </div>
          <h1 className="break-words text-xl">{title}</h1>
        </div>
        <div className="flex items-center gap-1">
          <Link href={mode === "guest" ? `/sign-in?next=${encodeURIComponent(`/alerts?asset=${asset.slug}`)}` : mode === "ok" ? `/alerts?asset=${asset.slug}` : "/pricing?need=watchlist"}
            className="inline-flex h-10 items-center gap-2 rounded-md px-2 text-sm font-semibold hover:bg-surface-sunken">
            <Bell aria-hidden className="h-4 w-4 text-muted" />Set alert
          </Link>
          <WatchStar slug={asset.slug} name={asset.name} on={watchlistSlugs(viewer).includes(asset.slug)} mode={mode} withLabel />
        </div>
      </div>

      {priceSlot ?? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="tabular text-price text-fg">{fmtPrice(quote.price, asset.quoteUnit)}</span>
          <PriceChange value={quote.change24hPct} suffix="24h" bold className="text-base" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span>Source: {quote.source}</span>
        <span className="inline-flex items-center gap-1">
          Cross-check:{" "}
          {quote.status === "diverged" ? <Badge tone="warning">differs by {pct(quote.crosscheckSpreadPct)}</Badge> : <>agrees within {quote.crosscheckSpreadPct.toFixed(2)}%</>}
        </span>
        <span>Checked {dateTime(quote.checkedAt, tz)}</span>
        <Link href={`/assets/${asset.slug}#method`} className="font-semibold text-accent hover:underline">How this is calculated</Link>
      </div>

      <nav aria-label={`${asset.name} pages`} className="flex gap-1 relative overflow-x-auto border-b">
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} aria-current={current === t.key ? "page" : undefined}
            className={cx("-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold",
              current === t.key ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}>
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
