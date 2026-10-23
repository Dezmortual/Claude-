import Link from "next/link";
import { redirect } from "next/navigation";
import { CandlestickChart } from "lucide-react";
import { AutoRefresh } from "@/components/client/AutoRefresh";
import { CancelOrder, ClosePosition, MaxOrderForm } from "@/components/client/TradeActions";
import { AssetMark, Badge, Card, EmptyState, Label, Section, cx } from "@/components/ui";
import { DataError, getAsset, tradingOverview } from "@/lib/data";
import { pnlWords, price, tradeTotals as totals } from "@/lib/format";
import { viewer } from "@/lib/session";

export const metadata = { title: "Trade" };

const usd = (x: number) => price(x, "USD");
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${usd(Math.abs(x))}`;

export default async function Trade() {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/trade");
  const tz = v.user.timezone;
  const t = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  let o: Awaited<ReturnType<typeof tradingOverview>> | null = null, problem: string | null = null;
  try { o = await tradingOverview(v); } catch (e) { if (e instanceof DataError) problem = e.message; else throw e; }
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <Label>Trade</Label>
        <h1 className="text-xl md:text-display">Your Alpaca account</h1>
        <p className="max-w-prose text-muted">
          Orders go to your own Alpaca account. Place one from any stock, fund or crypto page (or a top signal): you review it and confirm
          before anything is sent.
        </p>
        {o && (o.mode === "paper" ? <Badge>Practice account: no real money</Badge> : <Badge tone="down">Live account: real money</Badge>)}
      </div>

      {problem ? (
        <p role="alert" className="rounded-md bg-down-soft p-4 text-sm text-down">{problem}</p>
      ) : !o?.configured ? (
        <Card className="space-y-2 p-5 text-sm">
          <p className="font-semibold">Trading isn&apos;t set up yet</p>
          <p className="text-muted">Add your Alpaca paper account&apos;s keys as <code>ALPACA_KEY_ID</code> and <code>ALPACA_SECRET_KEY</code> in Vercel, then redeploy.</p>
        </Card>
      ) : (
        <>
          <AutoRefresh seconds={20} />
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[["Open trades", o.positions.length ? pnlWords(totals(o.positions).pnl, totals(o.positions).pct) : "None open",
                o.positions.length ? `profit or loss if you sold now · updates every 20 s` : "buy from any stock, fund or crypto page"],
              ["Account value", usd(o.account!.equity), o.account!.blocked ? "Trading is blocked on this account" : o.account!.status.toLowerCase()],
              ["Today", signed(o.account!.dayChange), "change in account value"],
              ["Cash", usd(o.account!.cash), "not invested"],
              ["Buying power", usd(o.account!.buyingPower), o.marketOpen ? "US market open" : "US market closed: stock orders wait for the open"]].map(([k, val, sub]) => (
              <li key={k}><Card className="h-full space-y-1 p-5">
                <p className="text-2xs uppercase tracking-wide text-subtle">{k}</p>
                <p className={cx("tabular text-xl", k === "Today" && (o!.account!.dayChange >= 0 ? "text-up" : "text-down"),
                  k === "Open trades" && o!.positions.length > 0 && (totals(o!.positions).pnl >= 0 ? "text-up" : "text-down"))}>{val}</p>
                <p className="text-sm text-muted">{sub}</p>
              </Card></li>
            ))}
          </ul>

          <Section id="positions" title="Positions">
            {!o.positions.length ? (
              <Card><EmptyState icon={<CandlestickChart aria-hidden className="h-6 w-6" />} title="No open positions">
                Open any stock, fund or crypto page and use the order ticket. <Link href="/#top-signals" className="font-semibold text-accent underline">Top signals</Link> is a good place to start looking.
              </EmptyState></Card>
            ) : (
              <ul className="grid gap-2">
                {o.positions.map((x) => (
                  <li key={x.symbol}><Card className="flex flex-wrap items-center gap-3 p-4">
                    {x.slug && <AssetMark ticker={getAsset(x.slug)!.ticker} slug={x.slug} />}
                    <div className="min-w-0 flex-1">
                      {x.slug ? <Link href={`/assets/${x.slug}#trade`} className="font-semibold hover:underline">{x.name}</Link> : <span className="font-semibold">{x.symbol}</span>}
                      <p className="text-xs text-muted">{x.qty} bought at {usd(x.avgPrice)} · now {usd(x.price)}</p>
                    </div>
                    <div className="grid justify-items-end">
                      <span className="tabular font-semibold">{usd(x.value)}</span>
                      <span className={cx("tabular text-xs font-semibold", x.pnl >= 0 ? "text-up" : "text-down")}>{pnlWords(x.pnl, x.pnlPct)}</span>
                    </div>
                    <ClosePosition symbol={x.symbol} name={x.name} qty={x.qty} />
                  </Card></li>
                ))}
              </ul>
            )}
          </Section>

          <Section id="orders" title="Orders">
            {!o.open.length && !o.recent.length ? <p className="text-sm text-muted">No orders yet.</p> : (
              <div tabIndex={0} role="region" aria-label="Orders table" className="relative overflow-x-auto rounded-lg border bg-surface">
                <table className="w-full text-sm">
                  <caption className="sr-only">Open orders first, then the latest ones</caption>
                  <thead><tr className="text-2xs uppercase tracking-wide text-subtle">
                    <th scope="col" className="px-3 py-2 text-left">Placed</th><th scope="col" className="px-3 py-2 text-left">Order</th>
                    <th scope="col" className="px-3 py-2 text-left">Status</th><th scope="col" className="px-3 py-2 text-right">Filled</th><th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                  </tr></thead>
                  <tbody>
                    {[...o.open, ...o.recent.filter((r) => !o!.open.some((x) => x.id === r.id))].map((r) => {
                      const label = `${r.side} ${r.notional ? usd(r.notional) : r.qty} ${r.symbol}`;
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="whitespace-nowrap px-3 py-2">{t(r.submittedAt)}</td>
                          <td className="whitespace-nowrap px-3 py-2"><span className={r.side === "buy" ? "text-up" : "text-down"}>{r.side === "buy" ? "Buy" : "Sell"}</span> {r.notional ? usd(r.notional) : r.qty} {r.symbol} · {r.type}{r.limitPrice ? ` ${usd(r.limitPrice)}` : ""}{r.orderClass === "bracket" ? " · with stop/target" : ""}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.status.replace(/_/g, " ")}</td>
                          <td className="tabular whitespace-nowrap px-3 py-2 text-right">{r.filledQty ? `${r.filledQty} at ${usd(r.filledPrice ?? 0)}` : "—"}</td>
                          <td className="px-3 py-2 text-right">{o!.open.some((x) => x.id === r.id) && <CancelOrder id={r.id} label={label} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}

      {o && (
        <Section id="limits" title="Safety">
          <Card className="grid gap-3 p-5 text-sm">
            <MaxOrderForm value={o.maxOrderUsd} />
            <ul className="grid list-disc gap-1 pl-5 text-muted">
              <li>Every order is reviewed and confirmed by you; nothing trades on its own.</li>
              <li>Sells only close or reduce what you hold: the app never sells short.</li>
              <li>{o.mode === "paper" ? "This is the practice account. Switching to real money is a deliberate setting in Vercel (ALPACA_TRADING=live with your live keys)." : "This is your live account: orders use real money."}</li>
            </ul>
            {o.log.some((l) => l.error) && (
              <div><p className="font-semibold">Recently refused</p>
                <ul className="grid gap-1 text-muted">{o.log.filter((l) => l.error).slice(0, 5).map((l) => <li key={l.at}>{t(l.at)} · {l.side} {l.slug}: {l.error}</li>)}</ul></div>
            )}
          </Card>
        </Section>
      )}
    </div>
  );
}
