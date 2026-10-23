"use client";
// Open positions and how much each is up or down, refreshed every 20 seconds while the screen is on.
import { CandlestickChart, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { pnlWords, price, tradeTotals as totals } from "@/lib/format";
import { AssetMark, Card, cx } from "../ui";

type Position = { symbol: string; slug: string | null; ticker: string | null; name: string; qty: number; avgPrice: number; price: number; value: number; pnl: number; pnlPct: number };
type Overview = { configured: boolean; mode: "paper" | "live"; account: { equity: number; dayChange: number } | null; positions: Position[] };

const EVERY_MS = 20_000;
const usd = (x: number) => price(x, "USD");
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${usd(Math.abs(x))}`;
export function OpenTrades({ limit = 6 }: { limit?: number }) {
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [at, setAt] = useState<Date | null>(null);

  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      clearTimeout(timer);
      if (document.visibilityState === "visible") {
        try {
          const r = await fetch("/api/v1/trade", { cache: "no-store" });
          const j = await r.json().catch(() => null);
          if (stop) return;
          if (!r.ok) throw new Error(j?.message ?? "Couldn't reach Alpaca");
          setO(j); setErr(null); setAt(new Date());
        } catch (e) { if (!stop) setErr(e instanceof Error ? e.message : String(e)); }
      }
      if (!stop) timer = setTimeout(load, EVERY_MS);
    }
    load();
    const onShow = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onShow); };
  }, []);

  if (err && !o) return <Card className="p-4 text-sm text-muted" role="status">Open trades: {err}</Card>;
  if (!o) return <Card className="p-4 text-sm text-muted">Checking your open trades…</Card>;
  if (!o.configured || !o.account) return null;
  const t = totals(o.positions);

  return (
    <Card className="divide-y">
      <div className="flex flex-wrap items-end justify-between gap-3 p-4">
        <div>
          <p className="text-2xs uppercase tracking-wide text-subtle">Open trades{o.mode === "paper" ? " · practice" : " · real money"}</p>
          {o.positions.length ? (
            <p className={cx("tabular text-xl", t.pnl >= 0 ? "text-up" : "text-down")} aria-live="polite">{pnlWords(t.pnl, t.pct)}</p>
          ) : <p className="text-lg">None open</p>}
          <p className="text-xs text-muted">
            {o.positions.length ? `Worth ${usd(t.value)} now · ` : ""}Account {usd(o.account.equity)}, {signed(o.account.dayChange)} today
          </p>
        </div>
        <p className="flex items-center gap-1 text-xs text-subtle">
          <RefreshCw aria-hidden className="h-3 w-3" />{err ? "Couldn't update: showing the last figures" : at ? `Updated ${at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
        </p>
      </div>
      {!o.positions.length ? (
        <p className="flex items-center gap-2 p-4 text-sm text-muted"><CandlestickChart aria-hidden className="h-4 w-4" />Buy from any stock, fund or crypto page and it shows up here with its profit or loss.</p>
      ) : (
        <ul className="divide-y">
          {o.positions.slice(0, limit).map((x) => (
            <li key={x.symbol}>
              <Link href={x.slug ? `/assets/${x.slug}#trade` : "/trade"} prefetch={false} className="flex items-center gap-3 p-4 hover:bg-surface-sunken">
                {x.slug && x.ticker && <AssetMark ticker={x.ticker} slug={x.slug} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{x.name}</span>
                  <span className="block text-xs text-muted">{+x.qty.toPrecision(8)} bought at {usd(x.avgPrice)} · now {usd(x.price)}</span>
                </span>
                <span className="grid justify-items-end">
                  <span className={cx("tabular text-sm font-semibold", x.pnl >= 0 ? "text-up" : "text-down")}>{pnlWords(x.pnl, x.pnlPct)}</span>
                  <span className="tabular text-xs text-muted">worth {usd(x.value)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/trade" className="block p-3 text-center text-sm font-semibold text-accent hover:underline">
        {o.positions.length > limit ? `All ${o.positions.length} positions and orders` : "Positions and orders"}
      </Link>
    </Card>
  );
}
