"use client";
// Create or edit one of your indicators: formulas checked as you type, a live preview on any asset, and how its
// past signals did there.
import { createChart, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Bar, UserIndicator } from "@/lib/data";
import { backtest, type Backtest, type SideStats } from "@/lib/indicators/backtest";
import { check } from "@/lib/indicators/formula";
import type { IndicatorDef } from "@/lib/indicators/presets";
import { Button, cx } from "../ui";
import { drawIndicators } from "./drawIndicators";
import { toast } from "./Toaster";

const field = "h-10 w-full rounded-md border border-input bg-surface px-3 font-mono text-sm text-fg aria-[invalid=true]:border-danger";
const RANGES = [["1y", "1 year, daily"], ["5y", "5 years, weekly"]] as const;
const H_NAME: Record<string, Record<number, string>> = { "1d": { 1: "1 day", 5: "1 week", 20: "1 month" }, "1w": { 1: "1 week", 5: "5 weeks", 20: "20 weeks" } };

function token(name: string, alpha = 1) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim().split(/\s+/).join(", ");
  return alpha === 1 ? `rgb(${v})` : `rgba(${v}, ${alpha})`;
}

function Formula({ label, value, onChange, hint, optional, onRemove }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; optional?: boolean; onRemove?: () => void;
}) {
  const id = useId();
  const err = value.trim() ? check(value) : optional ? null : { message: "Write a formula", pos: 0 };
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold">{label}{optional && <span className="font-normal text-muted"> (optional)</span>}</label>
        {onRemove && <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger"><Trash2 aria-hidden className="h-4 w-4" />Remove</button>}
      </div>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} autoCapitalize="off" autoComplete="off"
        aria-invalid={!!err && !!value.trim()} aria-describedby={`${id}-m`} className={field} />
      <p id={`${id}-m`} className={cx("text-xs", err && value.trim() ? "text-danger" : "text-muted")}>
        {err && value.trim() ? `${err.message} (at character ${err.pos + 1})` : hint ?? " "}
      </p>
    </div>
  );
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const move = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(2)}%`;

function SideTable({ title, s, base, tf, dir }: { title: string; s: SideStats; base: Backtest["base"]; tf: string; dir: 1 | -1 }) {
  return (
    <div tabIndex={0} role="region" aria-label={title} className="overflow-x-auto rounded-lg border bg-surface">
      <table className="w-full text-sm">
        <caption className="px-4 pt-3 text-left text-sm font-semibold">{title}: {s.signals} signal{s.signals === 1 ? "" : "s"}</caption>
        <thead><tr className="text-2xs uppercase tracking-wide text-subtle">
          <th scope="col" className="px-4 py-2 text-left">After</th><th scope="col" className="px-4 py-2 text-right">Went the right way</th>
          <th scope="col" className="px-4 py-2 text-right">Average move</th><th scope="col" className="px-4 py-2 text-right">Any day</th>
        </tr></thead>
        <tbody>
          {s.after.map((a, i) => {
            const anyRight = dir === 1 ? base[i].up : 1 - base[i].up;
            return (
              <tr key={a.bars} className="border-t">
                <th scope="row" className="px-4 py-2 text-left font-normal">{H_NAME[tf]?.[a.bars] ?? `${a.bars} bars`}</th>
                <td className={cx("tabular px-4 py-2 text-right", a.n > 0 && a.right > anyRight && "font-semibold text-up")}>{a.n ? pct(a.right) : "—"}</td>
                <td className="tabular px-4 py-2 text-right">{a.n ? move(a.avg * dir) : "—"}</td>
                <td className="tabular px-4 py-2 text-right text-muted">{pct(anyRight)} · {move(base[i].avg)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {s.worstAgainst !== null && <p className="px-4 pb-3 text-xs text-muted">Typical worst move against a signal within 5 bars: {move(s.worstAgainst)}.</p>}
    </div>
  );
}

export function IndicatorEditor({ initial, assets }: { initial?: UserIndicator | IndicatorDef; assets: { slug: string; name: string }[] }) {
  const router = useRouter();
  const editing = initial && "id" in initial ? initial : null;
  const [name, setName] = useState(initial?.name ?? "");
  const [lines, setLines] = useState<string[]>(initial?.lines ?? ["sma(close, 20)"]);
  const [display, setDisplay] = useState<"overlay" | "pane">(initial?.display ?? "overlay");
  const [buy, setBuy] = useState(initial?.buyRule ?? "");
  const [sell, setSell] = useState(initial?.sellRule ?? "");
  const [asset, setAsset] = useState(assets.find((a) => a.slug === "bitcoin")?.slug ?? assets[0]?.slug);
  const [range, setRange] = useState<"1y" | "5y">("1y");
  const [data, setData] = useState<{ tf: string; bars: Bar[]; warmup: Bar[] } | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);

  const valid = !!name.trim() && lines.every((l) => l.trim() && !check(l)) && (!buy.trim() || !check(buy)) && (!sell.trim() || !check(sell));
  const def: IndicatorDef = useMemo(() => ({ name: name || "Preview", lines: lines.filter((l) => l.trim() && !check(l)), display,
    buyRule: buy.trim() && !check(buy) ? buy : null, sellRule: sell.trim() && !check(sell) ? sell : null }), [name, lines, display, buy, sell]);

  useEffect(() => {
    if (!asset) return;
    let gone = false;
    setState("loading");
    fetch(`/api/v1/assets/${asset}/bars?range=${range}&warmup=250`).then(async (r) => {
      if (!r.ok) throw new Error();
      const j = await r.json();
      if (!gone) { setData(j); setState("ok"); }
    }).catch(() => !gone && setState("error"));
    return () => { gone = true; };
  }, [asset, range]);

  useEffect(() => {
    if (!box.current || !data) return;
    const c = createChart(box.current, {
      autoSize: true, handleScroll: false, handleScale: false,
      layout: { background: { color: "transparent" }, textColor: token("text-muted"), fontFamily: getComputedStyle(document.body).fontFamily },
      grid: { vertLines: { visible: false }, horzLines: { color: token("chart-grid") } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false },
      localization: { locale: "en-US" }, // the library rejects some browser language tags (e.g. "en-US@posix")
    });
    chart.current = c;
    const main = c.addLineSeries({ color: token("chart-line"), lineWidth: 2, priceLineVisible: false });
    main.setData(data.bars.map((b) => ({ time: Math.floor(b.ts / 1000) as UTCTimestamp, value: b.c })));
    drawIndicators(c, main, [def], [...data.warmup, ...data.bars], data.bars.length, token);
    c.timeScale().fitContent();
    return () => { c.remove(); chart.current = null; };
  }, [data, def]);

  const result = useMemo(() => {
    if (!data || (!def.buyRule && !def.sellRule)) return null;
    try { return backtest([...data.warmup, ...data.bars], { buy: def.buyRule, sell: def.sellRule }, data.warmup.length); } catch { return null; }
  }, [data, def]);

  async function save() {
    setBusy(true);
    const body = { name, lines: lines.map((l) => l.trim()), display, buyRule: buy.trim() || null, sellRule: sell.trim() || null };
    const r = await fetch(editing ? `/api/v1/me/indicators/${editing.id}` : "/api/v1/me/indicators", {
      method: editing ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { toast((await r.json().catch(() => null))?.message ?? "Couldn't save the indicator", "error"); return; }
    toast(editing ? "Indicator saved" : "Indicator added");
    router.push("/indicators");
    router.refresh();
  }

  async function remove() {
    if (!editing || !confirm(`Delete ${editing.name}? Alerts that use it are deleted too.`)) return;
    setBusy(true);
    const r = await fetch(`/api/v1/me/indicators/${editing.id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) { toast("Couldn't delete the indicator", "error"); return; }
    toast("Indicator deleted");
    router.push("/indicators");
    router.refresh();
  }

  const id = useId();
  return (
    <div className="grid gap-8 lg:grid-cols-[2fr_3fr]">
      <form onSubmit={(e) => { e.preventDefault(); if (valid) save(); }} className="grid h-fit gap-4" noValidate>
        <div className="grid gap-1">
          <label htmlFor={`${id}-n`} className="text-sm font-semibold">Name</label>
          <input id={`${id}-n`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required className={field.replace("font-mono ", "")} />
        </div>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Draw it</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="display" checked={display === "overlay"} onChange={() => setDisplay("overlay")} className="h-5 w-5 accent-accent" />On the price</label>
            <label className="flex items-center gap-2"><input type="radio" name="display" checked={display === "pane"} onChange={() => setDisplay("pane")} className="h-5 w-5 accent-accent" />Below the price (own scale)</label>
          </div>
        </fieldset>
        {lines.map((l, i) => (
          <Formula key={i} label={`Line ${i + 1}`} value={l} onChange={(v) => setLines(lines.map((x, k) => (k === i ? v : x)))}
            hint={i === 0 ? "For example ema(close, 20) or rsi(close, 14)" : undefined} onRemove={lines.length > 1 ? () => setLines(lines.filter((_, k) => k !== i)) : undefined} />
        ))}
        {lines.length < 3 && (
          <button type="button" onClick={() => setLines([...lines, ""])} className="inline-flex items-center gap-1 justify-self-start text-sm font-semibold text-accent">
            <Plus aria-hidden className="h-4 w-4" />Add a line
          </button>
        )}
        <Formula label="Buy rule" value={buy} onChange={setBuy} optional hint="A signal is given on the bar where this turns true, e.g. crosses_above(close, ema(close, 20))" />
        <Formula label="Sell rule" value={sell} onChange={setSell} optional hint="For example rsi(close, 14) > 70" />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={!valid} loading={busy}>{editing ? "Save changes" : "Add indicator"}</Button>
          {editing && <Button type="button" variant="danger" onClick={remove} disabled={busy}>Delete</Button>}
        </div>
      </form>

      <div className="grid h-fit gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <label htmlFor={`${id}-a`} className="text-sm font-semibold">Preview on</label>
            <select id={`${id}-a`} value={asset} onChange={(e) => setAsset(e.target.value)} className={field.replace("font-mono ", "")}>
              {assets.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
            </select>
          </div>
          <div className="grid gap-1">
            <label htmlFor={`${id}-r`} className="text-sm font-semibold">History</label>
            <select id={`${id}-r`} value={range} onChange={(e) => setRange(e.target.value as "1y" | "5y")} className={field.replace("font-mono ", "")}>
              {RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>
        <figure className="relative rounded-lg border bg-surface p-3" aria-label={`Preview of ${name || "the indicator"}`}>
          <div ref={box} className="h-chart w-full md:h-chart-lg" />
          {state === "loading" && <div aria-hidden className="absolute inset-0 animate-pulse rounded-lg bg-surface-sunken/60" />}
          {state === "error" && <p role="alert" className="absolute inset-0 grid place-items-center text-sm">Couldn&apos;t load prices for the preview.</p>}
        </figure>
        <section aria-labelledby={`${id}-bt`} className="grid gap-3">
          <h2 id={`${id}-bt`} className="text-base font-semibold">How its signals did here</h2>
          {!result ? (
            <p className="text-sm text-muted">Add a buy or sell rule to see how its past signals worked out on this chart.</p>
          ) : (
            <>
              {result.buy && <SideTable title="Buy signals" s={result.buy} base={result.base} tf={data!.tf} dir={1} />}
              {result.sell && <SideTable title="Sell signals" s={result.sell} base={result.base} tf={data!.tf} dir={-1} />}
              <p className="text-xs text-muted">
                &ldquo;Any day&rdquo; is the same measure taken from every bar, with no indicator: a rule is only useful if it beats that.
                These are past prices on this one chart, before trading costs, and a rule tuned to fit them will look better here than
                it does afterwards.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
