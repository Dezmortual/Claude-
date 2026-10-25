// Prediction-market rows: the market's price for "yes" is its crowd's odds, not a fact or a forecast of ours.
import { ExternalLink } from "lucide-react";
import type { Prediction } from "@/lib/data";
import { cx } from "./ui";

const usd = (x: number) => (x >= 1e6 ? `$${(x / 1e6).toFixed(1)}m` : x >= 1e3 ? `$${(x / 1e3).toFixed(0)}k` : `$${x.toFixed(0)}`);

export function PredictionList({ items }: { items: Prediction[] }) {
  return (
    <ul className="divide-y rounded-lg border bg-surface">
      {items.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <a href={m.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-start gap-1 font-semibold hover:underline">
              <span>{m.question}</span><ExternalLink aria-hidden className="mt-1 h-3 w-3 shrink-0 text-subtle" /><span className="sr-only"> (opens Polymarket)</span>
            </a>
            <p className="text-xs text-muted">{m.group && m.group !== m.question ? `${m.group} · ` : ""}{usd(m.volume24h)} traded today · {usd(m.volume)} in total
              {m.endsAt ? ` · ends ${new Date(m.endsAt).toISOString().slice(0, 10)}` : ""}</p>
          </div>
          {m.yes !== null && (
            <div className="grid justify-items-end">
              <span className="tabular text-lg font-semibold">{Math.round(m.yes * 100)}% yes</span>
              {m.change24h !== null && Math.abs(m.change24h) >= 0.005 && (
                <span className={cx("tabular text-xs", m.change24h > 0 ? "text-up" : "text-down")}>{m.change24h > 0 ? "+" : "−"}{Math.abs(m.change24h * 100).toFixed(0)} points today</span>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
