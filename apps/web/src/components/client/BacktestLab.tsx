"use client";
// The backtest lab form: pick an idea (template, one of your indicators, or your own rules), tune it, run it on
// past prices with costs, or sweep its settings. Results open on their own page.
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { check } from "@/lib/indicators/formula";
import { fill, placeholders, MAX_COMBOS } from "@/lib/indicators/strategy";
import { COSTS, TEMPLATES, templateNamed, type CostKey } from "@/lib/indicators/templates";
import type { StrategySpecInput } from "@/lib/data";
import { Button, Card, cx } from "../ui";
import { toast } from "./Toaster";

type AssetOpt = { slug: string; name: string; market: string };
type IndicatorOpt = { id: string; name: string; buyRule: string | null; sellRule: string | null };
type Range = { on: boolean; from: string; to: string; step: string };

const field = "h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-fg";
const area = "min-h-16 w-full rounded-md border border-input bg-surface px-3 py-2 font-mono text-sm text-fg";
const num = (s: string) => (s.trim() === "" ? null : Number(s));
const costFor = (market: string): CostKey => (market === "crypto" ? "crypto" : market === "forex" ? "forex" : "stocks");

export function BacktestLab({ assets, indicators, initial, strategy }: {
  assets: AssetOpt[]; indicators: IndicatorOpt[];
  initial?: StrategySpecInput; strategy?: { id: string; name: string; notes: string; version: number } | null;
}) {
  const id = useId();
  const router = useRouter();
  const t0 = templateNamed(initial?.template ?? "") ?? (initial ? null : TEMPLATES[0]);
  const [source, setSource] = useState<string>(initial ? (initial.template ? `t:${initial.template}` : "custom") : `t:${TEMPLATES[0].key}`);
  const [slug, setSlug] = useState(initial?.slug ?? assets.find((a) => a.slug === "bitcoin")?.slug ?? assets[0]?.slug);
  const [tf, setTf] = useState<"1d" | "1w">(initial?.timeframe ?? "1d");
  const [period, setPeriod] = useState<StrategySpecInput["period"]>(initial?.period ?? "all");
  const [side, setSide] = useState<"long" | "short">(initial?.side ?? "long");
  const [entry, setEntry] = useState(initial?.entry ?? t0!.entry);
  const [exit, setExit] = useState(initial?.exit ?? t0?.exit ?? "");
  const [params, setParams] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initial?.params ?? Object.fromEntries(t0!.params.map((p) => [p.name, p.value]))).map(([k, v]) => [k, String(v)])));
  const [stop, setStop] = useState(initial?.stopPct?.toString() ?? ""), [take, setTake] = useState(initial?.takePct?.toString() ?? "");
  const [maxBars, setMaxBars] = useState(initial?.maxBars?.toString() ?? "");
  const market = assets.find((a) => a.slug === slug)?.market ?? "crypto";
  const [costKey, setCostKey] = useState<CostKey | "custom">(initial ? "custom" : costFor(market));
  const [fee, setFee] = useState(String(initial?.feePct ?? COSTS[costFor(market)].feePct));
  const [slip, setSlip] = useState(String(initial?.slippagePct ?? COSTS[costFor(market)].slippagePct));
  const [ranges, setRanges] = useState<Record<string, Range>>({});
  const [busy, setBusy] = useState<"run" | "sweep" | "save" | null>(null);
  const [name, setName] = useState(strategy?.name ?? ""), [notes, setNotes] = useState(strategy?.notes ?? "");

  const template = source.startsWith("t:") ? templateNamed(source.slice(2)) : null;
  const names = useMemo(() => placeholders(entry, exit), [entry, exit]);
  const labelOf = (n: string) => template?.params.find((p) => p.name === n)?.label ?? `{${n}}`;

  function pickSource(s: string) {
    setSource(s);
    if (s.startsWith("t:")) {
      const t = templateNamed(s.slice(2))!;
      setEntry(t.entry); setExit(t.exit ?? ""); setRanges({});
      setParams(Object.fromEntries(t.params.map((p) => [p.name, String(p.value)])));
    } else if (s.startsWith("i:")) {
      const ind = indicators.find((x) => x.id === s.slice(2))!;
      setEntry(ind.buyRule ?? ""); setExit(ind.sellRule ?? ""); setParams({}); setRanges({});
    }
  }
  function pickAsset(s: string) {
    setSlug(s);
    const m = assets.find((a) => a.slug === s)?.market ?? "crypto";
    if (costKey !== "custom") { const k = costFor(m); setCostKey(k); setFee(String(COSTS[k].feePct)); setSlip(String(COSTS[k].slippagePct)); }
  }
  function pickCost(k: CostKey | "custom") {
    setCostKey(k);
    if (k !== "custom") { setFee(String(COSTS[k].feePct)); setSlip(String(COSTS[k].slippagePct)); }
  }

  const values = Object.fromEntries(names.map((n) => [n, Number(params[n])]));
  const ruleError = (rule: string) => {
    if (!rule.trim()) return null;
    try { return check(fill(rule, Object.fromEntries(names.map((n) => [n, Number.isFinite(values[n]) ? values[n] : 1])))); }
    catch (e) { return { message: e instanceof Error ? e.message : String(e), pos: 0 }; }
  };
  const entryErr = entry.trim() ? ruleError(entry) : { message: "Write an entry rule", pos: 0 };
  const exitErr = ruleError(exit);
  const missing = names.filter((n) => params[n] === undefined || params[n].trim() === "" || !Number.isFinite(Number(params[n])));
  const onRanges = names.filter((n) => ranges[n]?.on);
  const combos = onRanges.reduce((a, n) => {
    const r = ranges[n], f = Number(r.from), t = Number(r.to), s = Number(r.step);
    return a * (s > 0 && t >= f ? Math.floor((t - f) / s + 1e-9) + 1 : 0);
  }, 1);

  const spec = (): StrategySpecInput => ({
    slug: slug!, timeframe: tf, period, template: template?.key ?? null, entry: entry.trim(), exit: exit.trim() || null, side,
    params: values, stopPct: num(stop), takePct: num(take), maxBars: num(maxBars), feePct: Number(fee) || 0, slippagePct: Number(slip) || 0,
  });

  async function run(kind: "run" | "sweep") {
    setBusy(kind);
    const body = { ...spec(), strategyId: strategy?.id ?? null,
      ranges: kind === "sweep" ? onRanges.map((n) => ({ name: n, from: Number(ranges[n].from), to: Number(ranges[n].to), step: Number(ranges[n].step) })) : null };
    const r = await fetch("/api/v1/backtests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { setBusy(null); toast(j?.message ?? "The backtest didn't run", "error"); return; }
    router.push(`/backtest/runs/${j.id}`);
  }

  async function save(asNew: boolean) {
    setBusy("save");
    const r = await fetch("/api/v1/strategies", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: asNew ? null : strategy?.id ?? null, name, notes, spec: spec() }) });
    const j = await r.json().catch(() => null);
    setBusy(null);
    if (!r.ok) { toast(j?.message ?? "Couldn't save it", "error"); return; }
    toast(asNew || !strategy ? "Strategy saved" : `Saved as version ${j.version}`);
    router.push(`/backtest?strategy=${j.id}`);
    router.refresh();
  }

  const canRun = !entryErr && !exitErr && !missing.length && !!slug;
  return (
    <form onSubmit={(e) => { e.preventDefault(); run("run"); }} className="grid gap-6" noValidate>
      <Card className="grid gap-4 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1">
            <label htmlFor={`${id}-src`} className="text-sm font-semibold">Strategy</label>
            <select id={`${id}-src`} value={source} onChange={(e) => pickSource(e.target.value)} className={field}>
              <optgroup label="Templates">{TEMPLATES.map((t) => <option key={t.key} value={`t:${t.key}`}>{t.family}: {t.name}</option>)}</optgroup>
              {indicators.some((i) => i.buyRule) && (
                <optgroup label="My indicators (buy rule in, sell rule out)">
                  {indicators.filter((i) => i.buyRule).map((i) => <option key={i.id} value={`i:${i.id}`}>{i.name}</option>)}
                </optgroup>
              )}
              <option value="custom">My own rules</option>
            </select>
            {template && <p className="text-xs text-muted">{template.about}</p>}
          </div>
          <div className="grid gap-1">
            <label htmlFor={`${id}-asset`} className="text-sm font-semibold">Asset</label>
            <select id={`${id}-asset`} value={slug} onChange={(e) => pickAsset(e.target.value)} className={field}>
              {assets.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div className="grid gap-1">
            <label htmlFor={`${id}-tf`} className="text-sm font-semibold">Bars</label>
            <select id={`${id}-tf`} value={tf} onChange={(e) => setTf(e.target.value as "1d" | "1w")} className={field}>
              <option value="1d">Daily</option><option value="1w">Weekly (longer history)</option>
            </select>
          </div>
          <div className="grid gap-1">
            <label htmlFor={`${id}-per`} className="text-sm font-semibold">Period</label>
            <select id={`${id}-per`} value={period} onChange={(e) => setPeriod(e.target.value as StrategySpecInput["period"])} className={field}>
              <option value="1y">Last year</option><option value="2y">Last 2 years</option><option value="3y">Last 3 years</option><option value="all">All stored history</option>
            </select>
          </div>
          <div role="radiogroup" aria-label="Direction" className="col-span-2 grid gap-1 md:col-span-1">
            <span className="text-sm font-semibold" aria-hidden>Direction</span>
            <div className="flex gap-2">
              {(["long", "short"] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={side === s} onClick={() => setSide(s)}
                  className={cx("h-10 flex-1 rounded-md border text-sm font-semibold", side === s ? "border-accent bg-accent text-on-accent" : "bg-surface hover:bg-surface-sunken")}>
                  {s === "long" ? "Long (buy)" : "Short (sell)"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="grid gap-4 p-5">
        <h2 className="text-base font-semibold">Rules</h2>
        <div className="grid gap-1">
          <label htmlFor={`${id}-in`} className="text-sm font-semibold">Enter when</label>
          <textarea id={`${id}-in`} value={entry} onChange={(e) => { setEntry(e.target.value); if (source.startsWith("i:")) setSource("custom"); }} spellCheck={false}
            className={area} aria-invalid={!!entryErr} aria-describedby={`${id}-in-h`} />
          <p id={`${id}-in-h`} className={cx("text-xs", entryErr ? "text-down" : "text-muted")}>{entryErr ? entryErr.message : "Read at each bar's close; the trade happens at the next bar's open."}</p>
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-out`} className="text-sm font-semibold">Exit when (optional)</label>
          <textarea id={`${id}-out`} value={exit} onChange={(e) => setExit(e.target.value)} spellCheck={false} className={area}
            aria-invalid={!!exitErr} aria-describedby={`${id}-out-h`} />
          <p id={`${id}-out-h`} className={cx("text-xs", exitErr ? "text-down" : "text-muted")}>{exitErr ? exitErr.message : "Empty: hold while the entry rule holds. Write {name} for a number you want to tune."}</p>
        </div>
        {names.length > 0 && (
          <fieldset className="grid gap-3">
            <legend className="text-sm font-semibold">Settings</legend>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {names.map((n) => (
                <div key={n} className="grid gap-1">
                  <label htmlFor={`${id}-p-${n}`} className="text-xs font-semibold">{labelOf(n)}</label>
                  <input id={`${id}-p-${n}`} inputMode="decimal" value={params[n] ?? ""} onChange={(e) => setParams({ ...params, [n]: e.target.value })}
                    className={field} aria-invalid={missing.includes(n)} />
                </div>
              ))}
            </div>
          </fieldset>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-1"><label htmlFor={`${id}-sl`} className="text-xs font-semibold">Stop-loss %</label>
            <input id={`${id}-sl`} inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} placeholder="none" className={field} /></div>
          <div className="grid gap-1"><label htmlFor={`${id}-tp`} className="text-xs font-semibold">Take-profit %</label>
            <input id={`${id}-tp`} inputMode="decimal" value={take} onChange={(e) => setTake(e.target.value)} placeholder="none" className={field} /></div>
          <div className="grid gap-1"><label htmlFor={`${id}-mb`} className="text-xs font-semibold">Exit after (bars)</label>
            <input id={`${id}-mb`} inputMode="numeric" value={maxBars} onChange={(e) => setMaxBars(e.target.value)} placeholder="no limit" className={field} /></div>
        </div>
      </Card>

      <Card className="grid gap-3 p-5">
        <h2 className="text-base font-semibold">Trading costs</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="col-span-2 grid gap-1 md:col-span-1">
            <label htmlFor={`${id}-cost`} className="text-xs font-semibold">Profile</label>
            <select id={`${id}-cost`} value={costKey} onChange={(e) => pickCost(e.target.value as CostKey | "custom")} className={field}>
              {(Object.keys(COSTS) as CostKey[]).map((k) => <option key={k} value={k}>{COSTS[k].label}</option>)}
              <option value="custom">My own figures</option>
            </select>
          </div>
          <div className="grid gap-1"><label htmlFor={`${id}-fee`} className="text-xs font-semibold">Fee % each way</label>
            <input id={`${id}-fee`} inputMode="decimal" value={fee} onChange={(e) => { setFee(e.target.value); setCostKey("custom"); }} className={field} /></div>
          <div className="grid gap-1"><label htmlFor={`${id}-slip`} className="text-xs font-semibold">Slippage % each way</label>
            <input id={`${id}-slip`} inputMode="decimal" value={slip} onChange={(e) => { setSlip(e.target.value); setCostKey("custom"); }} className={field} /></div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!canRun || !!busy} loading={busy === "run"}>Run backtest</Button>
        {missing.length > 0 && <p className="self-center text-sm text-down">Give {missing.map((n) => labelOf(n)).join(", ")} a value.</p>}
      </div>

      {names.length > 0 && (
        <Card className="grid gap-4 p-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Find the best settings</h2>
            <p className="text-sm text-muted">
              Tries every combination, then checks the winner honestly: settings are picked on the past only and traded on the stretch after,
              three times over. Every combination counts as a try in the luck test, so sweeping widely makes a good result harder to trust.
            </p>
          </div>
          <div className="grid gap-3">
            {names.map((n) => {
              const r = ranges[n] ?? (() => { const p = template?.params.find((x) => x.name === n); const v = Number(params[n]) || 1;
                return { on: false, from: String(p?.from ?? v), to: String(p?.to ?? v * 2), step: String(p?.step ?? Math.max(1, Math.round(v / 2))) }; })();
              const set = (patch: Partial<Range>) => setRanges({ ...ranges, [n]: { ...r, ...patch } });
              return (
                <fieldset key={n} className="grid grid-cols-[auto_1fr_1fr_1fr] items-end gap-2">
                  <legend className="sr-only">Range for {labelOf(n)}</legend>
                  <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={r.on} onChange={(e) => set({ on: e.target.checked })} className="h-5 w-5 accent-accent" /><span className="sr-only">Sweep </span>{labelOf(n)}</label>
                  {(["from", "to", "step"] as const).map((k) => (
                    <div key={k} className="grid gap-1">
                      <label htmlFor={`${id}-r-${n}-${k}`} className="text-2xs uppercase tracking-wide text-subtle">{k}<span className="sr-only"> for {labelOf(n)}</span></label>
                      <input id={`${id}-r-${n}-${k}`} inputMode="decimal" value={r[k]} disabled={!r.on} onChange={(e) => set({ [k]: e.target.value })} className={cx(field, "disabled:opacity-50")} />
                    </div>
                  ))}
                </fieldset>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => run("sweep")} loading={busy === "sweep"}
              disabled={!canRun || !onRanges.length || combos < 1 || combos > MAX_COMBOS || !!busy}>
              Sweep {onRanges.length ? `${combos} combination${combos === 1 ? "" : "s"}` : "settings"}
            </Button>
            <p className={cx("text-xs", combos > MAX_COMBOS ? "text-down" : "text-muted")}>
              {!onRanges.length ? "Tick at least one setting to sweep." : combos > MAX_COMBOS ? `Up to ${MAX_COMBOS} at once: widen the steps.` : "Takes a few seconds."}
            </p>
          </div>
        </Card>
      )}

      <Card className="grid gap-3 p-5">
        <h2 className="text-base font-semibold">{strategy ? `Saved strategy · version ${strategy.version}` : "Save this strategy"}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1"><label htmlFor={`${id}-name`} className="text-xs font-semibold">Name</label>
            <input id={`${id}-name`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={field} /></div>
          <div className="grid gap-1"><label htmlFor={`${id}-notes`} className="text-xs font-semibold">Notes</label>
            <input id={`${id}-notes`} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} className={field} placeholder="Why you think it works" /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => save(false)} disabled={!canRun || !name.trim() || !!busy} loading={busy === "save"}>
            {strategy ? "Save as a new version" : "Save strategy"}
          </Button>
          {strategy && <Button type="button" variant="ghost" onClick={() => save(true)} disabled={!canRun || !name.trim() || !!busy}>Save as a separate strategy</Button>}
        </div>
        <p className="text-xs text-muted">Runs of a saved strategy share one try count, however its settings change.</p>
      </Card>
    </form>
  );
}
