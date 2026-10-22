import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AssetMark, Badge, Label, cx } from "@/components/ui";
import { DataError, screenIndicator, type ScreenRow } from "@/lib/data";
import { price } from "@/lib/format";
import { viewer } from "@/lib/session";

export const metadata = { title: "Screen an indicator" };

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Record({ s }: { s: ScreenRow["buy"] }) {
  if (!s) return <span className="text-muted">No rule</span>;
  if (!s.scored) return <span className="text-muted">{s.signals ? `${s.signals}, too recent` : "None"}</span>;
  const beat = s.right > s.anyBar;
  return (
    <span className="whitespace-nowrap">
      <span className={cx("tabular font-semibold", s.scored >= 3 && (beat ? "text-up" : "text-down"))}>{pct(s.right)}</span>
      <span className="text-muted"> of {s.scored} · any bar {pct(s.anyBar)}</span>
    </span>
  );
}

export default async function Screen({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tf?: string; firing?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const v = await viewer();
  if (!v.user) redirect(`/sign-in?next=/indicators/${id}/screen`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const tf = sp.tf === "1h" ? "1h" : "1d";
  const r = await screenIndicator(v, id, tf).catch((e) => { if (e instanceof DataError && e.code === "not_found") notFound(); throw e; });
  const firing = sp.firing === "1";
  const rows = firing ? r.rows.filter((x) => x.buyNow || x.sellNow) : r.rows;
  const nFiring = r.rows.filter((x) => x.buyNow || x.sellNow).length;
  const t = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: v.user!.timezone, day: "numeric", month: "short", ...(tf === "1h" ? { hour: "2-digit", minute: "2-digit" } : {}) });
  const href = (q: { tf?: string; firing?: boolean }) => `/indicators/${id}/screen?${new URLSearchParams({ ...(q.tf ?? tf) === "1h" ? { tf: "1h" } : {}, ...(q.firing ?? firing) ? { firing: "1" } : {} })}`;
  const seg = (on: boolean) => cx("inline-flex h-8 items-center rounded-pill border px-3 text-xs font-semibold", on ? "border-accent bg-accent text-on-accent" : "bg-surface hover:bg-surface-sunken");
  const hasRules = !!(r.indicator.buyRule || r.indicator.sellRule);
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Indicators</Label>
        <h1 className="text-xl">{r.indicator.name} on every asset</h1>
        <p className="max-w-prose text-muted">
          Where its rule holds right now, its latest signal, and how its past signals did on each asset: the share that went the right
          way 5 bars later, next to the same share from any bar with no indicator. Past prices only, before costs.
        </p>
        <p className="text-sm"><Link href={`/indicators/${id}`} className="font-semibold text-accent underline">Edit or test {r.indicator.name}</Link></p>
      </div>
      {!hasRules ? (
        <p className="rounded-md bg-surface-sunken p-4 text-sm">{r.indicator.name} has no buy or sell rule, so there is nothing to screen. Add one in the editor.</p>
      ) : (
        <>
          <nav aria-label="Screener options" className="flex flex-wrap gap-2">
            <Link href={href({ tf: "1d" })} aria-current={tf === "1d" ? "page" : undefined} className={seg(tf === "1d")}>Daily chart, last year</Link>
            <Link href={href({ tf: "1h" })} aria-current={tf === "1h" ? "page" : undefined} className={seg(tf === "1h")}>Hourly chart</Link>
            <Link href={href({ firing: !firing })} className={seg(firing)}>{firing ? `Showing only firing now (${nFiring}) · show all` : `Only firing now (${nFiring})`}</Link>
          </nav>
          <div tabIndex={0} role="region" aria-label={`${r.indicator.name} across assets`} className="relative overflow-x-auto rounded-lg border bg-surface">
            <table className="w-full text-sm">
              <caption className="sr-only">{r.indicator.name} across assets, firing now first</caption>
              <thead><tr className="text-2xs uppercase tracking-wide text-subtle">
                <th scope="col" className="px-3 py-2 text-left">Asset</th><th scope="col" className="px-3 py-2 text-left">Now</th>
                <th scope="col" className="px-3 py-2 text-left">Latest signal</th>
                <th scope="col" className="px-3 py-2 text-left">Buy signals right</th><th scope="col" className="px-3 py-2 text-left">Sell signals right</th>
              </tr></thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.slug} className="border-t">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <Link href={`/assets/${x.slug}`} className="flex items-center gap-2 hover:underline"><AssetMark ticker={x.ticker} slug={x.slug} /><span className="whitespace-nowrap">{x.name}</span></Link>
                    </th>
                    <td className="whitespace-nowrap px-3 py-2">
                      {x.error ? <span className="text-xs text-muted">{x.error}</span>
                        : x.buyNow ? <Badge tone="up">Buy rule holds</Badge> : x.sellNow ? <Badge tone="down">Sell rule holds</Badge> : <span className="text-muted">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {x.last ? <><span className={x.last.side === "buy" ? "text-up" : "text-down"}>{x.last.side === "buy" ? "Buy" : "Sell"}</span>
                        <span className="text-muted"> · {t(x.last.at)}{x.last.barsAgo ? `, ${x.last.barsAgo} bar${x.last.barsAgo === 1 ? "" : "s"} ago` : ", this bar"}</span></> : <span className="text-muted">None</span>}
                      <span className="block text-xs text-muted">{price(x.price, x.unit)}</span>
                    </td>
                    <td className="px-3 py-2"><Record s={x.buy} /></td>
                    <td className="px-3 py-2"><Record s={x.sell} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <p className="text-sm text-muted">The rule isn&apos;t holding on any asset right now.</p>}
          <p className="max-w-prose text-xs text-muted">
            Green beats &ldquo;any bar&rdquo; with at least 3 signals; red doesn&apos;t. A rule that looks good on a few assets out of 50 can be luck:
            treat a strong record on one asset as a lead to test, not proof.
          </p>
        </>
      )}
    </div>
  );
}

