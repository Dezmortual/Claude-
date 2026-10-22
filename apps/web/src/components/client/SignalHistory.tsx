"use client";
// F2: every past change of the indicator reading, with what the price did after it, the bad part included.
import { useState } from "react";
import type { SignalChange, SignalSideStats, Timeframe } from "@/lib/data";
import { price } from "@/lib/format";
import { SignalBadge, cx } from "../ui";

type History = { timeframe: Timeframe; since: string | null; changes: SignalChange[]; buy: SignalSideStats; sell: SignalSideStats };
const TF = { "1h": "1 hour", "1d": "1 day" } as Record<string, string>;
const CHART = { "1h": "Hourly chart", "1d": "Daily chart" } as Record<string, string>;
const dir = (v: string) => (v.endsWith("buy") ? 1 : v.endsWith("sell") ? -1 : 0);
const pct = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(2)}%`;
const SHOWN = 30;

function Stat({ title, s }: { title: string; s: SignalSideStats }) {
  return (
    <div className="grid gap-1 rounded-lg border bg-surface p-4">
      <p className="text-2xs uppercase tracking-wide text-subtle">{title}</p>
      {!s.n ? <p className="text-sm text-muted">None in this window.</p> : (
        <>
          <p className="tabular text-xl">{s.scored ? `${Math.round((s.right / s.scored) * 100)}%` : "—"} <span className="text-sm text-muted">right after 7 days</span></p>
          <p className="text-sm text-muted">
            {s.n} signal{s.n === 1 ? "" : "s"}{s.scored < s.n ? `, ${s.n - s.scored} too recent to judge` : ""}.
            {s.medianAfter7d !== null && <> Typical move after 7 days: <span className={cx("tabular font-semibold", s.medianAfter7d > 0 ? "text-up" : "text-down")}>{pct(s.medianAfter7d)}</span> in its favour.</>}
            {s.medianWorst7d !== null && <> Typical worst move against it on the way: <span className="tabular font-semibold text-down">{pct(s.medianWorst7d)}</span>.</>}
          </p>
        </>
      )}
    </div>
  );
}

export function SignalHistory({ history, unit, tz }: { history: History[]; unit: string; tz: string }) {
  const [tf, setTf] = useState(history.find((h) => h.timeframe === "1d" && h.changes.length) ? "1d" : history[0]?.timeframe);
  const h = history.find((x) => x.timeframe === tf);
  const t = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", ...(tf === "1d" ? {} : { hour: "2-digit", minute: "2-digit" }) });
  // Show raw price moves; colour them by whether the signal was right.
  const Move = ({ v, d }: { v: number | null; d: number }) => v === null ? <span className="text-muted">not yet</span>
    : <span className={cx("tabular", d !== 0 && (v > 0 ? "text-up" : "text-down"))}>{pct(d ? v * d : v)}</span>;
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Signal history chart" className="flex gap-2">
        {history.map((x) => (
          <button key={x.timeframe} type="button" role="radio" aria-checked={tf === x.timeframe} onClick={() => setTf(x.timeframe)}
            className={cx("h-8 rounded-pill border px-3 text-xs font-semibold", tf === x.timeframe ? "border-accent bg-accent text-on-accent" : "bg-surface hover:bg-surface-sunken")}>
            {CHART[x.timeframe]}
          </button>
        ))}
      </div>
      {!h || !h.since ? <p className="text-sm text-muted">Not enough history on this chart yet.</p> : (
        <>
          <p className="max-w-prose text-sm text-muted">
            Since {t(h.since)} the {TF[h.timeframe]} reading changed {h.changes.length === 1 ? "once" : `${h.changes.length} times`}. Each change is
            judged by the price 1 and 7 days later and by the worst move against it in between, before any trading costs.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Stat title="Turned buy or strong buy" s={h.buy} />
            <Stat title="Turned sell or strong sell" s={h.sell} />
          </div>
          {!!h.changes.length && (
            <div tabIndex={0} role="region" aria-label={`Signal changes on the ${TF[h.timeframe]} chart`} className="relative overflow-x-auto rounded-lg border bg-surface">
              <table className="w-full text-sm">
                <caption className="sr-only">Signal changes on the {TF[h.timeframe]} chart, newest first</caption>
                <thead><tr className="text-2xs uppercase tracking-wide text-subtle">
                  <th scope="col" className="px-3 py-2 text-left">Bar closed</th><th scope="col" className="px-3 py-2 text-left">Changed to</th>
                  <th scope="col" className="px-3 py-2 text-right">7 days later</th><th scope="col" className="px-3 py-2 text-right">Worst against, 7 days</th>
                  <th scope="col" className="px-3 py-2 text-right">1 day later</th><th scope="col" className="px-3 py-2 text-right">Price</th>
                </tr></thead>
                <tbody>
                  {h.changes.slice(0, SHOWN).map((c) => {
                    const d = dir(c.verdict);
                    return (
                      <tr key={c.at} className="border-t">
                        <td className="whitespace-nowrap px-3 py-2">{t(c.at)}</td>
                        <td className="whitespace-nowrap px-3 py-2"><SignalBadge signal={c.verdict} /><span className="block text-xs text-muted">from {c.from.replace("_", " ")}</span></td>
                        <td className="whitespace-nowrap px-3 py-2 text-right"><Move v={c.after7d} d={d} /></td>
                        <td className="tabular whitespace-nowrap px-3 py-2 text-right">{c.worst7d === null ? <span className="text-muted">—</span> : <span className="text-down">{pct(c.worst7d)}</span>}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right"><Move v={c.after1d} d={d} /></td>
                        <td className="tabular whitespace-nowrap px-3 py-2 text-right">{price(c.price, unit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {h.changes.length > SHOWN && <p className="px-3 pb-3 text-xs text-muted">Showing the latest {SHOWN} of {h.changes.length}. The figures above count them all.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
