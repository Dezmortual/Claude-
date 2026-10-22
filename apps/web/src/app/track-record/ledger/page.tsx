import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { AutoSubmit } from "@/components/client/AutoSubmit";
import { LedgerTable } from "@/components/LedgerTable";
import { Card, EmptyState, Label } from "@/components/ui";
import { alertableAssets, forecastLedger, type LedgerQuery } from "@/lib/data";
import { viewer } from "@/lib/session";

export const metadata = { title: "Forecast ledger", description: "Every forecast published, with what actually happened." };

const field = "h-10 rounded-md border border-input bg-surface px-3 text-sm text-fg";
const STATUS = [["all", "All"], ["scored", "Scored"], ["pending", "Waiting"], ["hits", "Right direction"], ["misses", "Wrong direction"]] as const;
type SP = { asset?: string; horizon?: string; status?: string; page?: string };

export default async function Ledger({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/track-record/ledger");
  const assets = await alertableAssets(v);
  const q: LedgerQuery = {
    asset: assets.some((a) => a.slug === sp.asset) ? sp.asset : undefined,
    horizon: sp.horizon === "1d" || sp.horizon === "7d" || sp.horizon === "1m" ? sp.horizon : undefined,
    status: STATUS.some(([k]) => k === sp.status) ? (sp.status as LedgerQuery["status"]) : "all",
    page: Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1),
  };
  const l = await forecastLedger(v, q);
  const link = (page: number) => `/track-record/ledger?${new URLSearchParams(Object.entries({ asset: q.asset, horizon: q.horizon, status: q.status === "all" ? undefined : q.status, page: page > 1 ? String(page) : undefined })
    .filter((e): e is [string, string] => !!e[1])).toString()}`;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Track record</Label>
        <h1 className="text-xl md:text-display">Forecast ledger</h1>
        <p className="max-w-prose text-muted">
          Every forecast the live model published, newest first, locked when it was made. Once its date passes it shows the
          real price, whether the direction was right and whether the price landed inside the range. Nothing is left out.
        </p>
        <p className="text-sm"><Link href="/track-record" className="font-semibold text-accent underline">Back to the scorecard</Link></p>
      </div>

      <form id="ledger-filters" action="/track-record/ledger" className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1"><label htmlFor="lf-asset" className="text-sm font-semibold">Asset</label>
          <select id="lf-asset" name="asset" defaultValue={q.asset ?? "all"} className={field}>
            <option value="all">All assets</option>{assets.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </select></div>
        <div className="grid gap-1"><label htmlFor="lf-h" className="text-sm font-semibold">Horizon</label>
          <select id="lf-h" name="horizon" defaultValue={q.horizon ?? "all"} className={field}>
            <option value="all">All</option><option value="1d">Next day</option><option value="7d">7 days</option><option value="1m">1 month</option>
          </select></div>
        <div className="grid gap-1"><label htmlFor="lf-s" className="text-sm font-semibold">Show</label>
          <select id="lf-s" name="status" defaultValue={q.status} className={field}>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <button type="submit" data-apply className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-on-accent">Apply</button>
        <AutoSubmit formId="ledger-filters" />
      </form>

      <p role="status" className="text-sm text-muted">
        {l.total.toLocaleString("en-US")} forecasts · {l.scored.toLocaleString("en-US")} scored: direction right in {pct(l.hits, l.scored)}, inside the 80% range in {pct(l.inside, l.scored)}
        {" · "}{(l.total - l.scored).toLocaleString("en-US")} waiting for their date.
      </p>

      {!l.rows.length ? (
        <Card><EmptyState icon={<ClipboardList aria-hidden className="h-6 w-6" />} title="No forecasts match">Try another asset, horizon or filter.</EmptyState></Card>
      ) : (
        <LedgerTable rows={l.rows} tz={v.user.timezone} caption={`Forecasts, page ${l.page} of ${l.pages}`} />
      )}

      {l.pages > 1 && (
        <nav aria-label="Ledger pages" className="flex items-center justify-between gap-3 text-sm">
          {l.page > 1 ? <Link href={link(l.page - 1)} className="font-semibold text-accent underline">Newer</Link> : <span />}
          <span className="text-muted">Page {l.page} of {l.pages.toLocaleString("en-US")}</span>
          {l.page < l.pages ? <Link href={link(l.page + 1)} className="font-semibold text-accent underline">Older</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
