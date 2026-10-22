// Draws indicators onto a lightweight-charts chart: overlay lines on the price scale, pane lines in a strip under
// the price, and a marker on every bar where a buy or sell rule turns true. Shared by PriceChart and the editor.
import { LineStyle, type IChartApi, type ISeriesApi, type SeriesMarker, type UTCTimestamp } from "lightweight-charts";
import { evaluate, signalBars, type Bar } from "@/lib/indicators/formula";
import type { IndicatorDef } from "@/lib/indicators/presets";

export const COLORS = ["chart-ind-1", "chart-ind-2", "chart-ind-3"] as const;
const t = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;

/** `all` is warm-up bars followed by the visible ones; only the last `visible` bars are drawn. Returns the number
 *  of signals drawn. Formulas are checked before saving, but a bad one here is skipped rather than breaking the chart. */
export function drawIndicators(c: IChartApi, main: ISeriesApi<"Line"> | ISeriesApi<"Candlestick">, defs: IndicatorDef[], all: Bar[], visible: number,
  token: (name: string, alpha?: number) => string): number {
  const from = all.length - visible;
  const hasPane = defs.some((d) => d.display === "pane");
  if (hasPane) main.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.32 } });
  const markers: SeriesMarker<UTCTimestamp>[] = [];
  let colour = 0;
  for (const d of defs) {
    d.lines.forEach((f, i) => {
      let vals: (number | null)[];
      try { vals = evaluate(f, all); } catch { return; }
      const s = c.addLineSeries({
        color: token(COLORS[colour++ % COLORS.length]), lineWidth: 2, lineStyle: i === 0 ? LineStyle.Solid : i === 1 ? LineStyle.Dashed : LineStyle.Dotted,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: d.lines.length > 1 ? "" : d.name,
        ...(d.display === "pane" ? { priceScaleId: "pane" } : {}),
      });
      s.setData(all.slice(from).map((b, k) => ({ time: t(b.ts), value: vals[from + k] })).filter((p): p is { time: UTCTimestamp; value: number } => p.value !== null));
    });
    for (const [rule, side] of [[d.buyRule, "buy"], [d.sellRule, "sell"]] as const) {
      if (!rule) continue;
      let at: number[];
      try { at = signalBars(evaluate(rule, all)); } catch { continue; }
      for (const i of at) if (i >= from) markers.push(side === "buy"
        ? { time: t(all[i].ts), position: "belowBar", color: token("up"), shape: "arrowUp", text: "Buy" }
        : { time: t(all[i].ts), position: "aboveBar", color: token("down"), shape: "arrowDown", text: "Sell" });
    }
  }
  // The pane's scale exists only once a series uses it, so its strip is set up last.
  if (hasPane) c.priceScale("pane").applyOptions({ scaleMargins: { top: 0.74, bottom: 0.02 }, borderVisible: false });
  markers.sort((a, b) => a.time - b.time);
  main.setMarkers(markers);
  return markers.length;
}
