import Link from "next/link";
import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { DeleteLot, HoldingForm } from "@/components/client/HoldingForm";
import { AssetMark, Badge, Card, EmptyState, Label, PriceChange, Section, SignalBadge, cx } from "@/components/ui";
import { portfolio } from "@/lib/data";
import { price } from "@/lib/format";
import { viewer } from "@/lib/session";

export const metadata = { title: "Portfolio" };

const usd = (x: number) => price(x, "USD");
const signedUsd = (x: number) => `${x >= 0 ? "+" : "−"}${usd(Math.abs(x))}`;
const qty = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 8 });

export default async function Portfolio() {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/portfolio");
  const p = await portfolio(v);
  const opts = p.holdableAssets;
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <Label>Portfolio</Label>
        <h1 className="text-xl md:text-display">Your portfolio</h1>
        <p className="max-w-prose text-muted">What you hold, valued at live prices, with each holding&apos;s signal and alerts. Only you can see it.</p>
      </div>

      {!p.positions.length ? (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Card><EmptyState icon={<Wallet aria-hidden className="h-6 w-6" />} title="Nothing here yet">Add your first purchase: the asset, how many, and what you paid if you want profit and loss.</EmptyState></Card>
          <Card className="p-5"><HoldingForm options={opts} /></Card>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <li><Card className="h-full space-y-1 p-5">
              <p className="text-2xs uppercase tracking-wide text-subtle">Value now</p>
              <p className="tabular text-xl">{usd(p.total)}</p>
              <p className="text-sm text-muted">{p.positions.length} holding{p.positions.length === 1 ? "" : "s"}</p>
            </Card></li>
            <li><Card className="h-full space-y-1 p-5">
              <p className="text-2xs uppercase tracking-wide text-subtle">Today</p>
              <p className={cx("tabular text-xl", p.change24h >= 0 ? "text-up" : "text-down")}>{signedUsd(p.change24h)}</p>
              <PriceChange value={p.change24hPct} suffix="24h" className="text-sm" />
            </Card></li>
            <li><Card className="h-full space-y-1 p-5">
              <p className="text-2xs uppercase tracking-wide text-subtle">Profit or loss</p>
              {p.pnl === null ? <p className="text-sm text-muted">Add the price you paid to see it.</p> : (
                <>
                  <p className={cx("tabular text-xl", p.pnl >= 0 ? "text-up" : "text-down")}>{signedUsd(p.pnl)}</p>
                  <p className="text-sm text-muted"><PriceChange value={p.pnlPct} /> on {usd(p.cost!)} paid</p>
                </>
              )}
            </Card></li>
            <li><Card className="h-full space-y-1 p-5">
              <p className="text-2xs uppercase tracking-wide text-subtle">Scenarios, in 1 and 5 years</p>
              {p.scenarios.map((s) => (
                <p key={s.years} className="text-sm"><span className="text-muted">{s.years} yr:</span> <span className="tabular font-semibold">{usd(s.base)}</span>
                  <span className="text-xs text-muted"> ({usd(s.bear)} to {usd(s.bull)})</span></p>
              ))}
              <p className="text-xs text-muted">Each holding grows at its market&apos;s bear, base and bull rates. Planning numbers, not predictions.</p>
            </Card></li>
          </ul>

          <div aria-hidden className="flex h-2 overflow-hidden rounded-pill bg-surface-sunken">
            {p.positions.map((x, i) => <span key={x.asset.slug} className={i % 2 ? "bg-accent/50" : "bg-accent"} style={{ width: `${x.weight * 100}%` }} />)}
          </div>

          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <Section id="holdings" title="Holdings">
              <ul className="grid gap-3">
                {p.positions.map((x) => (
                  <li key={x.asset.slug}>
                    <Card className="grid gap-3 p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <AssetMark ticker={x.asset.ticker} slug={x.asset.slug} size="lg" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/assets/${x.asset.slug}`} className="block truncate font-semibold hover:underline">{x.asset.name}</Link>
                          <p className="text-xs text-muted">{qty(x.quantity)} {x.asset.meta.proxy ? `${x.asset.meta.proxy} shares` : x.asset.market === "crypto" ? x.asset.ticker : "shares"} · {Math.round(x.weight * 100)}% of the portfolio</p>
                        </div>
                        <div className="grid justify-items-end">
                          <span className="tabular font-semibold">{usd(x.value)}</span>
                          <PriceChange value={x.change24hPct} suffix="24h" className="text-xs" />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {x.signal && <SignalBadge signal={x.signal} pUp={x.pUp} />}
                        {x.pnl !== null && <Badge tone={x.pnl >= 0 ? "up" : "down"}>{signedUsd(x.pnl)} ({x.pnlPct! >= 0 ? "+" : ""}{x.pnlPct!.toFixed(1)}%){x.costCovered < 1 ? " on priced buys" : ""}</Badge>}
                        {x.alerts > 0 ? <Link href="/alerts" className="font-semibold text-accent underline">{x.alerts} alert{x.alerts === 1 ? "" : "s"}</Link>
                          : <Link href={`/alerts?asset=${x.asset.slug}`} className="text-muted underline">Set an alert</Link>}
                        {x.stale && <Badge tone="warning">Price may be out of date</Badge>}
                      </div>
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted">{x.lots.length} purchase{x.lots.length === 1 ? "" : "s"}</summary>
                        <ul className="mt-2 grid gap-1">
                          {x.lots.map((l) => {
                            const label = `${qty(l.quantity)} ${x.asset.name}${l.boughtOn ? ` bought ${l.boughtOn}` : ""}`;
                            return (
                              <li key={l.id} className="flex items-center gap-2 rounded-md bg-surface-sunken px-3 py-1">
                                <span className="tabular flex-1">{qty(l.quantity)}{l.costPrice !== null && <> at {price(l.costPrice, "USD")}</>}{l.boughtOn && <span className="text-muted"> · {l.boughtOn}</span>}{l.note && <span className="text-muted"> · {l.note}</span>}</span>
                                <DeleteLot id={l.id} label={label} />
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    </Card>
                  </li>
                ))}
              </ul>
            </Section>
            <Section id="add" title="Add a purchase">
              <Card className="p-5"><HoldingForm options={opts} /></Card>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
