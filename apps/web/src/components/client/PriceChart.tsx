"use client";
// PriceChart from components.md: line or candles, range buttons, forecast band + dashed midpoint after "now".
// Colours come from the theme tokens at runtime, so light/dark and /replica-brand changes apply without code edits.
import { createChart, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import type { Bar, ForecastPoint } from "@/lib/data";
import { price as fmtPrice } from "@/lib/format";

const RANGES = ["1d", "1w", "1m", "3m", "1y", "5y", "all"] as const;
const LABEL: Record<(typeof RANGES)[number], string> = { "1d": "1D", "1w": "1W", "1m": "1M", "3m": "3M", "1y": "1Y", "5y": "5Y", all: "All" };

function token(name: string, alpha = 1) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim().split(/\s+/).join(", ");
  return alpha === 1 ? `rgb(${v})` : `rgba(${v}, ${alpha})`;
}

const seg = (on: boolean) =>
  `h-8 min-w-tap rounded-pill border px-2 text-xs font-semibold ${on ? "border-accent bg-accent text-on-accent" : "bg-surface text-fg hover:bg-surface-sunken"} disabled:opacity-50`;

export function PriceChart({ slug, name, unit, initial, initialRange = "3m", forecast, intradayLocked }: {
  slug: string; name: string; unit: string; initial: Bar[]; initialRange?: (typeof RANGES)[number];
  forecast: ForecastPoint[] | null; intradayLocked: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const [range, setRange] = useState(initialRange);
  const [bars, setBars] = useState(initial);
  const [kind, setKind] = useState<"line" | "candles">("line");
  const [horizon, setHorizon] = useState<"1d" | "7d" | "1m" | null>(forecast ? "1m" : null);
  const [state, setState] = useState<"ok" | "loading" | "error">("ok");
  const [theme, setTheme] = useState(0);

  // Re-colour when the theme flips.
  useEffect(() => {
    const bump = () => setTheme((t) => t + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
    return () => { mo.disconnect(); mq.removeEventListener("change", bump); };
  }, []);

  async function load(r: (typeof RANGES)[number]) {
    setRange(r);
    setState("loading");
    const res = await fetch(`/api/v1/assets/${slug}/bars?range=${r}`);
    if (!res.ok) { setState("error"); return; }
    setBars((await res.json()).bars);
    setState("ok");
  }

  useEffect(() => {
    if (!box.current) return;
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: token("text-muted"), fontFamily: getComputedStyle(document.body).fontFamily },
      grid: { vertLines: { visible: false }, horzLines: { color: token("chart-grid") } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: range === "1d" || range === "1w" },
      crosshair: { horzLine: { labelBackgroundColor: token("accent") }, vertLine: { labelBackgroundColor: token("accent") } },
      localization: { locale: "en-US", priceFormatter: (p: number) => fmtPrice(p, unit) },
      handleScroll: false, handleScale: false,
    });
    chart.current = c;
    const t = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;

    // Forecast band first so the history line draws over it.
    const f = horizon && forecast?.find((p) => p.horizon === horizon);
    if (f && bars.length) {
      const last = bars.at(-1)!;
      const t0 = t(last.ts), t1 = t(new Date(f.targetAt).getTime());
      if (t1 > t0) {
        const opts = { lineVisible: false, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false } as const;
        const upper = c.addAreaSeries({ ...opts, topColor: token("chart-band"), bottomColor: token("chart-band") });
        upper.setData([{ time: t0, value: last.c }, { time: t1, value: f.high }]);
        const lower = c.addAreaSeries({ ...opts, topColor: token("surface"), bottomColor: token("surface") });
        lower.setData([{ time: t0, value: last.c }, { time: t1, value: f.low }]);
        const mid = c.addLineSeries({ color: token("chart-line"), lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false });
        mid.setData([{ time: t0, value: last.c }, { time: t1, value: f.mid }]);
      }
    }
    let s: ISeriesApi<"Line"> | ISeriesApi<"Candlestick">;
    if (kind === "candles") {
      s = c.addCandlestickSeries({ upColor: token("up"), downColor: token("down"), wickUpColor: token("up"), wickDownColor: token("down"), borderVisible: false });
      s.setData(bars.map((b) => ({ time: t(b.ts), open: b.o, high: b.h, low: b.l, close: b.c })));
    } else {
      s = c.addLineSeries({ color: token("chart-line"), lineWidth: 2, priceLineVisible: false });
      s.setData(bars.map((b) => ({ time: t(b.ts), value: b.c })));
    }
    c.timeScale().fitContent();
    return () => { c.remove(); chart.current = null; };
  }, [bars, kind, horizon, forecast, range, unit, theme]);

  const f = horizon && forecast?.find((p) => p.horizon === horizon);
  const summary = bars.length
    ? `${name} price over ${LABEL[range]}: from ${fmtPrice(bars[0].c, unit)} to ${fmtPrice(bars.at(-1)!.c, unit)}.` +
      (f ? ` Forecast for ${horizon}: ${fmtPrice(f.low, unit)} to ${fmtPrice(f.high, unit)}, midpoint ${fmtPrice(f.mid, unit)}.` : "")
    : `No price history for ${LABEL[range]}.`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Chart range" className="flex flex-wrap gap-1">
          {RANGES.map((r) => {
            const locked = intradayLocked && (r === "1d" || r === "1w");
            return (
              <button key={r} type="button" role="radio" aria-checked={range === r} disabled={locked}
                title={locked ? "Intraday charts are on paid plans" : undefined} onClick={() => load(r)} className={seg(range === r)}>
                {LABEL[r]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {forecast && (
            <div role="radiogroup" aria-label="Forecast overlay" className="flex items-center gap-1">
              <span className="mr-1 text-2xs uppercase tracking-wide text-subtle">Forecast</span>
              {([["1d", "1D"], ["7d", "1W"], ["1m", "1M"], [null, "Off"]] as const).map(([h, l]) => (
                <button key={l} type="button" role="radio" aria-checked={horizon === h} onClick={() => setHorizon(h)} className={seg(horizon === h)}>{l}</button>
              ))}
            </div>
          )}
          <div role="radiogroup" aria-label="Chart type" className="flex gap-1">
            <button type="button" role="radio" aria-checked={kind === "line"} onClick={() => setKind("line")} className={seg(kind === "line")}>Line</button>
            <button type="button" role="radio" aria-checked={kind === "candles"} onClick={() => setKind("candles")} className={seg(kind === "candles")}>Candles</button>
          </div>
        </div>
      </div>
      <div className="relative">
        <div ref={box} role="img" aria-label={summary} className="h-chart w-full md:h-chart-lg" />
        {state === "loading" && <div className="absolute inset-0 animate-pulse rounded-md bg-surface-sunken/60" aria-hidden />}
        {state === "error" && (
          <div role="alert" className="absolute inset-0 grid place-items-center rounded-md bg-surface/90 text-sm">
            <span>Couldn&apos;t load this range. <button type="button" className="font-semibold text-accent underline" onClick={() => load(range)}>Try again</button></span>
          </div>
        )}
      </div>
      {f && (
        <p className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><span aria-hidden className="inline-block h-3 w-4 rounded-sm bg-chart-band" />80% range: {fmtPrice(f.low, unit)} – {fmtPrice(f.high, unit)}</span>
          <span className="inline-flex items-center gap-1"><span aria-hidden className="inline-block w-4 border-t-2 border-dashed border-chart-line" />Midpoint {fmtPrice(f.mid, unit)}</span>
          <span>The range is the 10th to 90th percentile of past moves in the same trend state; it is not a guarantee.</span>
        </p>
      )}
      <p className="sr-only">{summary}</p>
    </div>
  );
}
