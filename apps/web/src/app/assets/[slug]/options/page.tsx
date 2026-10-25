import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Banner, Card, Label, StatCard, cx } from "@/components/ui";
import { DataError, assetOptions, getAsset } from "@/lib/data";
import { price as fmtPrice } from "@/lib/format";
import { viewer } from "@/lib/session";

export const metadata = { title: "Options" };
const usd = (x: number | null) => (x === null ? "—" : fmtPrice(x, "USD"));
const g = (x: number | null, d = 2) => (x === null ? "—" : x.toFixed(d));
const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(0)}%`);
const days = (e: string) => Math.max(0, Math.round((Date.parse(`${e}T21:00:00Z`) - Date.now()) / 86_400_000));

export default async function Options({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ e?: string; side?: string }> }) {
  const v = await viewer();
  const { slug } = await params;
  if (!v.user) redirect(`/sign-in?next=/assets/${slug}/options`);
  const a = getAsset(slug);
  if (!a) notFound();
  const sp = await searchParams;
  let o: Awaited<ReturnType<typeof assetOptions>> | null = null, problem: string | null = null;
  try { o = await assetOptions(v, slug, sp.e); } catch (e) { if (e instanceof DataError) problem = e.message; else if (e instanceof Error) problem = `Couldn't load the options: ${e.message}`; else throw e; }
  const side = sp.side === "put" ? "put" : "call";
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Label><Link href={`/assets/${slug}`} className="hover:underline">{a.name}</Link></Label>
        <h1 className="text-xl md:text-display">{a.name} options{o ? ` (${o.underlying})` : ""}</h1>
        <p className="max-w-prose text-muted">
          Calls and puts expiring in the next 75 days, within 30% of the price, with their implied volatility and greeks. From Alpaca&apos;s free indicative feed: quotes are
          adjusted and trades delayed, so treat prices as a guide. FXDEZ doesn&apos;t trade options.
        </p>
      </div>
      {problem && <Banner tone="warning">{problem}</Banner>}
      {o && !o.rows.length && <Card className="p-5 text-sm text-muted">No contracts in that range right now.</Card>}
      {o && o.rows.length > 0 && (
        <>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <li><StatCard label="Expiry" value={o.expiry ?? "—"} sub={o.expiry ? `${days(o.expiry)} days away` : ""} /></li>
            <li><StatCard label={o.underlying === a.ticker ? "Price" : `${o.underlying} price`} value={usd(o.price)} sub={o.atmStrike ? `Nearest strike ${usd(o.atmStrike)}` : ""} /></li>
            <li><StatCard label="Move priced in" value={o.expectedMove ? `±${o.expectedMove.pct.toFixed(1)}%` : "—"}
              sub={o.expectedMove ? `About ±${usd(o.expectedMove.usd)} by expiry, from the at-the-money call plus put` : "Needs quotes at the nearest strike"} /></li>
            <li><StatCard label="Contracts" value={String(o.rows.length * 2)} sub={o.stale ? "Alpaca not answering: last copy" : `Read ${new Date(o.fetchedAt).toISOString().slice(11, 16)} UTC`} /></li>
          </ul>
          <nav aria-label="Expiry" className="flex flex-wrap gap-1 text-sm">
            {o.expiries.map((e) => <Link key={e} href={`?e=${e}&side=${side}`} aria-current={e === o!.expiry ? "page" : undefined}
              className={cx("rounded-md px-3 py-1 font-semibold", e === o!.expiry ? "bg-accent text-on-accent" : "hover:bg-surface-sunken")}>{e.slice(5)}</Link>)}
          </nav>
          <nav aria-label="Calls or puts" className="flex gap-1 text-sm">
            {(["call", "put"] as const).map((s) => <Link key={s} href={`?e=${o!.expiry}&side=${s}`} aria-current={side === s ? "page" : undefined}
              className={cx("rounded-md px-3 py-1 font-semibold", side === s ? "bg-accent text-on-accent" : "hover:bg-surface-sunken")}>{s === "call" ? "Calls" : "Puts"}</Link>)}
          </nav>
          <div tabIndex={0} role="region" aria-label="Option chain table" className="overflow-x-auto rounded-lg border bg-surface">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">{side === "call" ? "Calls" : "Puts"} expiring {o.expiry}, by strike</caption>
              <thead className="bg-surface-sunken text-2xs uppercase tracking-wide text-subtle"><tr>
                {["Strike", "Bid", "Ask", "Last", "Implied vol", "Delta", "Gamma", "Theta", "Vega"].map((h) => <th key={h} scope="col" className="px-3 py-2 text-right first:text-left">{h}</th>)}
              </tr></thead>
              <tbody>{o.rows.map((r) => {
                const c = side === "call" ? r.call : r.put;
                const itm = o!.price !== null && (side === "call" ? r.strike < o!.price : r.strike > o!.price);
                return (
                  <tr key={r.strike} className={cx("border-t", itm && "bg-accent-soft", r.strike === o!.atmStrike && "font-semibold")}>
                    <th scope="row" className="tabular px-3 py-2 text-left">{usd(r.strike)}{r.strike === o!.atmStrike && <span className="sr-only"> (nearest the price)</span>}</th>
                    <td className="tabular px-3 py-2 text-right">{usd(c?.bid ?? null)}</td><td className="tabular px-3 py-2 text-right">{usd(c?.ask ?? null)}</td>
                    <td className="tabular px-3 py-2 text-right">{usd(c?.last ?? null)}</td><td className="tabular px-3 py-2 text-right">{pct(c?.iv ?? null)}</td>
                    <td className="tabular px-3 py-2 text-right">{g(c?.delta ?? null)}</td><td className="tabular px-3 py-2 text-right">{g(c?.gamma ?? null, 3)}</td>
                    <td className="tabular px-3 py-2 text-right">{g(c?.theta ?? null)}</td><td className="tabular px-3 py-2 text-right">{g(c?.vega ?? null)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Shaded rows are in the money. Delta: how much the option moves per $1 in the stock. Theta: what it loses a day. Vega: what it gains per point of volatility.
            Implied volatility is the yearly swing the price implies.</p>
        </>
      )}
    </div>
  );
}
