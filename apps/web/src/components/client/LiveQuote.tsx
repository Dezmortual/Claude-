"use client";
import { useEffect, useState } from "react";
import { price as fmtPrice } from "@/lib/format";
import { PriceChange } from "../ui";

// Polls the quote every 30 s while the tab is visible. Shows staleness instead of blanking.
export function LiveQuote({ slug, unit, initial }: { slug: string; unit: string; initial: { price: number; change24hPct: number; observedAt: string } }) {
  const [q, setQ] = useState(initial);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/v1/assets/${slug}`, { cache: "no-store" });
        if (!r.ok) throw new Error();
        const j = await r.json();
        if (alive) { setQ(j.quote); setStale(false); }
      } catch { if (alive) setStale(true); }
    };
    const id = setInterval(tick, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [slug]);
  const age = Math.round((Date.now() - new Date(q.observedAt).getTime()) / 60000);
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1" aria-live="polite" aria-atomic="true">
      <span className={`tabular text-price ${stale ? "text-subtle" : "text-fg"}`}>{fmtPrice(q.price, unit)}</span>
      <PriceChange value={q.change24hPct} suffix="24h" bold className="text-base" />
      <span className="text-xs text-muted">{stale ? `Can't reach the price feed; last value from ${age} min ago` : "Updates every 30 seconds"}</span>
    </div>
  );
}
