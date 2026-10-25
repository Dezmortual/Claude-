"use client";
// A run's trades drawn on the prices it traded: an arrow in and an arrow out for each.
import { createChart, type SeriesMarker, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import type { Bar } from "@/lib/indicators/formula";
import type { Trade } from "@/lib/indicators/strategy";

function token(name: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim().split(/\s+/).join(", ");
  return `rgb(${v})`;
}
const sec = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;

export function TradesChart({ runId, trades, label }: { runId: string; trades: Trade[]; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [bars, setBars] = useState<Bar[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/backtests/${runId}/bars`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setBars).catch(() => setFailed(true));
  }, [runId]);

  useEffect(() => {
    if (!box.current || !bars?.length) return;
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: token("text-muted"), fontFamily: getComputedStyle(document.body).fontFamily },
      grid: { vertLines: { visible: false }, horzLines: { color: token("chart-grid") } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false }, localization: { locale: "en-US" },
    });
    const s = c.addCandlestickSeries({ upColor: token("up"), downColor: token("down"), wickUpColor: token("up"), wickDownColor: token("down"), borderVisible: false, priceLineVisible: false });
    s.setData(bars.map((b) => ({ time: sec(b.ts), open: b.o, high: b.h, low: b.l, close: b.c })));
    const long = (t: Trade) => t.side === "long";
    const markers: SeriesMarker<UTCTimestamp>[] = trades.flatMap((t) => [
      { time: sec(t.entryTs), position: long(t) ? "belowBar" : "aboveBar", shape: long(t) ? "arrowUp" : "arrowDown", color: token("chart-ind-1"), text: long(t) ? "Buy" : "Short" } as const,
      ...(t.reason === "end" ? [] : [{ time: sec(t.exitTs), position: long(t) ? "aboveBar" : "belowBar", shape: long(t) ? "arrowDown" : "arrowUp",
        color: t.returnPct >= 0 ? token("up") : token("down"), text: `${t.returnPct >= 0 ? "+" : ""}${t.returnPct.toFixed(1)}%` } as const]),
    ]).sort((a, b) => a.time - b.time);
    s.setMarkers(markers);
    c.timeScale().fitContent();
    return () => c.remove();
  }, [bars, trades]);

  if (failed) return <p className="text-sm text-muted">Couldn&apos;t load the prices for this chart.</p>;
  return <><p className="sr-only">{label}</p><div ref={box} className="h-chart w-full" /></>;
}
