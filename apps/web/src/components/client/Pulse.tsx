"use client";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { IndicatorRow, PulseCard } from "@/lib/data";
import { SignalGauge } from "../SignalGauge";
import { SignalBadge } from "../ui";

type Card = PulseCard & { indicators: IndicatorRow[]; locked: boolean };
const TF_LABEL = { "5m": "5 min", "30m": "30 min", "1h": "1 hour", "1d": "1 day", "1w": "1 week" } as const;

function fmt(v: number | null) {
  if (v === null) return "—";
  const a = Math.abs(v);
  return v.toLocaleString("en-US", { maximumFractionDigits: a >= 100 ? 2 : a >= 1 ? 3 : 6 });
}

/** F3: why the reading is what it is, and which bar it was read on. */
export function whyLine(c: PulseCard, tz: string) {
  const buy = c.ma.buy + c.osc.buy, sell = c.ma.sell + c.osc.sell;
  const side = c.verdict.endsWith("buy") ? "buy" : c.verdict.endsWith("sell") ? "sell" : null;
  const counts = side
    ? `${side === "buy" ? buy : sell} of 20 indicators say ${side} (${side === "buy" ? c.ma.buy : c.ma.sell} of 10 averages, ${side === "buy" ? c.osc.buy : c.osc.sell} of 10 oscillators)`
    : `${buy} indicators say buy and ${sell} say sell, too close to call`;
  const daily = c.timeframe === "1d" || c.timeframe === "1w";
  // Intraday bars: the time, with the zone's short name; daily and weekly bars: the date.
  const when = c.closedAt ? `, on the ${TF_LABEL[c.timeframe]} bar that closed ${new Date(c.closedAt).toLocaleString("en-GB", daily
    ? { timeZone: tz, day: "numeric", month: "short" }
    : { timeZone: tz, hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}` : "";
  return `${counts}${when}.`;
}

export function Pulse({ cards, upgradeHref, tz = "UTC" }: { cards: Card[]; upgradeHref: string; tz?: string }) {
  const firstReady = cards.find((c) => c.timeframe === "1d" && c.verdict !== "unavailable") ?? cards.find((c) => c.indicators.length) ?? cards[3];
  const [sel, setSel] = useState(firstReady.timeframe);
  const card = cards.find((c) => c.timeframe === sel)!;
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Timeframe" aria-controls="pulse-detail" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <button key={c.timeframe} type="button" role="radio" aria-checked={sel === c.timeframe} onClick={() => setSel(c.timeframe)}
            className={`grid gap-2 rounded-md border bg-surface p-3 text-left text-xs ${sel === c.timeframe ? "border-accent ring-1 ring-accent" : "hover:bg-surface-sunken"}`}>
            <span className="text-2xs uppercase tracking-wide text-subtle">{TF_LABEL[c.timeframe]}</span>
            <span className="justify-self-start">{c.locked ? <span className="inline-flex items-center gap-1 text-muted"><Lock aria-hidden className="h-3 w-3" />Paid plans</span> : <SignalBadge signal={c.verdict} />}</span>
            <span className="text-muted">
              {c.verdict === "unavailable" ? (c.locked ? "Upgrade to see" : c.reason) : `Averages ${c.ma.buy}↑ ${c.ma.sell}↓ · Oscillators ${c.osc.buy}↑ ${c.osc.sell}↓`}
            </span>
          </button>
        ))}
      </div>
      <div id="pulse-detail" aria-live="polite">
        {card.locked ? (
          <p className="rounded-md border border-dashed bg-surface-sunken p-4 text-sm text-muted">
            The {TF_LABEL[card.timeframe]} breakdown is on paid plans. <Link href={upgradeHref} className="font-semibold text-accent underline">See plans</Link>
          </p>
        ) : !card.indicators.length ? (
          <p className="rounded-md bg-surface-sunken p-4 text-sm text-muted">
            {card.verdict === "unavailable" ? `Not enough history on this timeframe yet: ${card.reason?.toLowerCase()}.` : "The indicator breakdown for this timeframe is on paid plans."}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2"><SignalGauge verdict={card.verdict} ma={card.ma} osc={card.osc} label={TF_LABEL[card.timeframe]} /></div>
            <div className="space-y-1 rounded-md bg-surface-sunken p-3 text-sm md:col-span-2">
              <p><span className="font-semibold">Why: </span>{whyLine(card, tz)} The readings are in the tables below.</p>
              {card.history && (
                <p className="text-muted">
                  Held for {card.history.heldBars === 1 ? "1 closed bar" : `${card.history.heldBars} closed bars`}
                  {" · "}changed {card.history.changes === 1 ? "once" : `${card.history.changes} times`} in the last {card.history.window}
                  {card.history.changes >= 4 && <span className="font-semibold text-warning"> · flipping often, treat it with care</span>}
                  {". "}Signal alerts wait for a reading to hold for 2 closed bars.
                </p>
              )}
            </div>
            {(["ma", "oscillator"] as const).map((k) => (
              <div key={k} tabIndex={0} role="region" aria-label={k === "ma" ? "Moving averages table" : "Oscillators table"} className="relative overflow-x-auto rounded-lg border bg-surface">
                <table className="w-full text-sm">
                  <caption className="px-3 pt-3 text-left text-sm font-semibold">{k === "ma" ? "Moving averages" : "Oscillators"} · {TF_LABEL[card.timeframe]}</caption>
                  <thead><tr className="text-2xs uppercase tracking-wide text-subtle"><th scope="col" className="px-3 py-2 text-left">Indicator</th><th scope="col" className="px-3 py-2 text-right">Value</th><th scope="col" className="px-3 py-2 text-right">Reads</th></tr></thead>
                  <tbody>
                    {card.indicators.filter((r) => r.kind === k).map((r) => (
                      <tr key={r.name} className="border-t">
                        <th scope="row" className="px-3 py-2 text-left font-normal">{r.name}</th>
                        <td className="tabular px-3 py-2 text-right">{fmt(r.value)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${r.signal === "buy" ? "text-up" : r.signal === "sell" ? "text-down" : "text-muted"}`}>
                          {r.signal === "buy" ? "Buy" : r.signal === "sell" ? "Sell" : "Neutral"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
