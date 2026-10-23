import Link from "next/link";
import { ChevronsDown, ChevronsUp } from "lucide-react";
import type { TopSignal } from "@/lib/data";
import { price } from "@/lib/format";
import { AssetMark, Badge, Card, PriceChange, cx } from "./ui";

/** Where the three reads point hardest, buys and sells side by side, each with its reasons in plain numbers. */
/** Assets Alpaca trades: crypto, stocks, funds and the stand-in funds. */
const tradable = (t: TopSignal) => ["crypto", "stocks", "etfs"].includes(t.row.asset.market) || !!t.row.asset.meta.proxy;

export function TopSignals({ buys, sells, scanned }: { buys: TopSignal[]; sells: TopSignal[]; scanned: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SideList title="Strongest buys" side="buy" items={buys} scanned={scanned} />
      <SideList title="Strongest sells" side="sell" items={sells} scanned={scanned} />
    </div>
  );
}

function SideList({ title, side, items, scanned }: { title: string; side: "buy" | "sell"; items: TopSignal[]; scanned: number }) {
  const Icon = side === "buy" ? ChevronsUp : ChevronsDown;
  const word = side === "buy" ? "buy" : "sell";
  return (
    <Card className="overflow-hidden">
      <h3 className={cx("flex items-center gap-2 border-b px-4 py-3 text-base font-semibold", side === "buy" ? "text-up" : "text-down")}>
        <Icon aria-hidden className="h-5 w-5" />{title}
      </h3>
      {!items.length ? (
        <p className="p-4 text-sm text-muted">No asset has the daily chart and the 7-day forecast both pointing to {word} right now, out of {scanned} scanned.</p>
      ) : (
        <ol className="divide-y">
          {items.map((t, i) => {
            const a = t.row.asset, unit = a.quoteUnit;
            return (
              <li key={a.slug}>
                <Link href={`/assets/${a.slug}/signals`} prefetch={false} className="grid gap-2 p-4 hover:bg-surface-sunken">
                  <span className="flex items-center gap-3">
                    <span aria-hidden className="w-4 text-sm font-semibold text-subtle">{i + 1}</span>
                    <AssetMark ticker={a.ticker} slug={a.slug} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{a.name}</span>
                      <span className="text-xs text-muted">{t.strength} {word}{t.aligned ? " · all three agree" : ""}</span>
                    </span>
                    <span className="grid justify-items-end">
                      <span className="tabular text-sm font-semibold">{price(t.row.price, unit)}</span>
                      <PriceChange value={t.row.change24hPct} suffix="24h" className="text-xs" />
                    </span>
                  </span>
                  <span aria-hidden className="ml-7 h-1 overflow-hidden rounded-pill bg-surface-sunken">
                    <span className={cx("block h-full rounded-pill", side === "buy" ? "bg-up" : "bg-down")} style={{ width: `${Math.round(Math.abs(t.score) * 100)}%` }} />
                  </span>
                  <span className="ml-7 flex flex-wrap gap-1 text-xs">
                    <Badge tone={side === "buy" ? "up" : "down"}>Daily {t.daily.agree}/20 {word}{t.daily.heldBars > 1 ? ` · ${t.daily.heldBars} days` : " · new today"}</Badge>
                    {t.hourly && (t.aligned
                      ? <Badge tone={side === "buy" ? "up" : "down"}>Hourly {t.hourly.agree}/20 {word}</Badge>
                      : <Badge tone="neutral">Hourly disagrees: {t.hourly.against} {side === "buy" ? "sell" : "buy"}, {t.hourly.agree} {word}</Badge>)}
                    <Badge tone={side === "buy" ? "up" : "down"}>7 days: {Math.round(t.pSide * 100)}% {side === "buy" ? "up" : "down"}</Badge>
                  </span>
                  <span className="ml-7 text-xs text-muted">7-day 80% range {price(t.range7d.low, unit)} – {price(t.range7d.high, unit)}</span>
                </Link>
                {tradable(t) && (
                  <Link href={`/assets/${a.slug}?side=${side}#trade`} prefetch={false} className="mb-3 ml-11 inline-flex text-xs font-semibold text-accent underline">
                    {side === "buy" ? "Buy" : "Sell"} {a.name}<span className="sr-only"> on the order ticket</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
