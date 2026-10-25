"use client";
// Past backtests: tick two to four to compare them on one chart.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pin } from "lucide-react";
import type { RunListItem } from "@/lib/data";
import { Button, Badge, cx } from "../ui";

const p = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}%`;

export function RunList({ runs, tz }: { runs: RunListItem[]; tz: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length >= 4 ? xs : [...xs, id]));
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" disabled={picked.length < 2} onClick={() => router.push(`/backtest/compare?ids=${picked.join(",")}`)}>
          Compare {picked.length >= 2 ? picked.length : ""} runs
        </Button>
        <span className="text-xs text-muted" role="status">{picked.length < 2 ? "Tick two to four runs to compare them." : `${picked.length} ticked${picked.length === 4 ? " (the most at once)" : ""}.`}</span>
      </div>
      <div tabIndex={0} role="region" aria-label="Past backtests table" className="overflow-x-auto rounded-lg border bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Past backtests, pinned first, then newest</caption>
          <thead className="bg-surface-sunken text-2xs uppercase tracking-wide text-subtle">
            <tr><th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Compare</span></th><th scope="col" className="px-3 py-2 text-left">Run</th>
              <th scope="col" className="px-3 py-2 text-right">Return</th><th scope="col" className="px-3 py-2 text-right">Buy and hold</th>
              <th scope="col" className="px-3 py-2 text-right">Worst drop</th><th scope="col" className="px-3 py-2 text-right">Trades</th><th scope="col" className="px-3 py-2 text-right">Luck test</th></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2"><input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Compare ${r.name}`}
                  disabled={!picked.includes(r.id) && picked.length >= 4} className="h-5 w-5 accent-accent" /></td>
                <td className="px-3 py-2">
                  <Link href={`/backtest/runs/${r.id}`} className="font-semibold hover:underline">{r.name}</Link>
                  <span className="block text-xs text-muted">
                    {r.pinned && <Pin aria-label="Pinned" className="mr-1 inline h-3 w-3" />}
                    {r.timeframe === "1d" ? "Daily" : "Weekly"} · {new Date(r.createdAt).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {r.kind === "sweep" && <Badge className="ml-2">Sweep</Badge>}
                  </span>
                </td>
                <td className={cx("tabular px-3 py-2 text-right font-semibold", r.totalReturn >= 0 ? "text-up" : "text-down")}>{p(r.totalReturn)}</td>
                <td className="tabular px-3 py-2 text-right text-muted">{p(r.buyHold)}</td>
                <td className="tabular px-3 py-2 text-right text-down">{p(r.maxDrawdown)}</td>
                <td className="tabular px-3 py-2 text-right">{r.trades}</td>
                <td className="tabular px-3 py-2 text-right">{r.luck === null ? "—" : `${Math.round(r.luck * 100)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
