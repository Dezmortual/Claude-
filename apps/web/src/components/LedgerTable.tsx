import Link from "next/link";
import { Check, X } from "lucide-react";
import type { LedgerRow } from "@/lib/data";
import { getAsset } from "@/lib/data";
import { price } from "@/lib/format";
import { cx } from "./ui";

const H: Record<string, string> = { "1d": "Next day", "7d": "7 days", "1m": "1 month" };

/** F1: published forecasts, each with its outcome once its target time has passed: hits and misses alike. */
export function LedgerTable({ rows, tz, caption, showAsset = true }: { rows: LedgerRow[]; tz: string; caption: string; showAsset?: boolean }) {
  const t = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const Mark = ({ ok, yes, no }: { ok: boolean; yes: string; no: string }) => (
    <span className={cx("inline-flex items-center gap-1 font-semibold", ok ? "text-up" : "text-down")}>
      {ok ? <Check aria-hidden className="h-4 w-4" /> : <X aria-hidden className="h-4 w-4" />}{ok ? yes : no}
    </span>
  );
  return (
    <div tabIndex={0} role="region" aria-label={caption} className="relative overflow-x-auto rounded-lg border bg-surface">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead><tr className="text-2xs uppercase tracking-wide text-subtle">
          <th scope="col" className="px-3 py-2 text-left">Published</th>
          {showAsset && <th scope="col" className="px-3 py-2 text-left">Asset</th>}
          <th scope="col" className="px-3 py-2 text-left">Horizon</th>
          <th scope="col" className="px-3 py-2 text-left">Direction</th>
          <th scope="col" className="px-3 py-2 text-left">Range</th>
          <th scope="col" className="px-3 py-2 text-right">From</th>
          <th scope="col" className="px-3 py-2 text-right">80% range</th>
          <th scope="col" className="px-3 py-2 text-right">Chance up</th>
          <th scope="col" className="px-3 py-2 text-right">Actual</th>
          <th scope="col" className="px-3 py-2 text-right">Error</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const a = getAsset(r.slug), unit = a?.quoteUnit;
            return (
              <tr key={r.id} className="border-t">
                <td className="whitespace-nowrap px-3 py-2">{t(r.generatedAt)}</td>
                {showAsset && <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-normal"><Link href={`/assets/${r.slug}`} className="hover:underline">{a?.name ?? r.slug}</Link></th>}
                <td className="whitespace-nowrap px-3 py-2">{H[r.horizon]}</td>
                {r.outcome ? (
                  <>
                    <td className="whitespace-nowrap px-3 py-2"><Mark ok={r.outcome.directionHit} yes="Right" no="Wrong" /></td>
                    <td className="whitespace-nowrap px-3 py-2"><Mark ok={r.outcome.inside} yes="Inside" no="Outside" /></td>
                  </>
                ) : (
                  <td colSpan={2} className="whitespace-nowrap px-3 py-2 text-muted">Waiting until {t(r.targetAt)}</td>
                )}
                <td className="tabular whitespace-nowrap px-3 py-2 text-right">{price(r.base, unit)}</td>
                <td className="tabular whitespace-nowrap px-3 py-2 text-right">{price(r.low, unit)} – {price(r.high, unit)}</td>
                <td className="tabular px-3 py-2 text-right">{(r.pUp * 100).toFixed(0)}%</td>
                <td className="tabular whitespace-nowrap px-3 py-2 text-right">{r.outcome ? price(r.outcome.realized, unit) : <span className="text-muted">—</span>}</td>
                <td className="tabular px-3 py-2 text-right">{r.outcome ? `${r.outcome.errPct.toFixed(2)}%` : <span className="text-muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
