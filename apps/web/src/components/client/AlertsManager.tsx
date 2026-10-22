"use client";
import { BellRing, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import type { Alert, AlertCondition } from "@/lib/data";
import { SIGNAL_LABEL } from "@/lib/format";
import { toast } from "./Toaster";

type Opt = { slug: string; name: string; ticker: string; price: number };
type Ind = { id: string; name: string; buy: boolean; sell: boolean };
const field = "h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-fg aria-[invalid=true]:border-danger";
const COND: Record<AlertCondition, string> = {
  price_above: "Price rises above", price_below: "Price falls below", signal_becomes: "Signal turns", forecast_move_above: "7-day forecast move exceeds",
  indicator_signal: "My indicator gives a signal",
};
const TF = { "5m": "5 min", "30m": "30 min", "1h": "1 hour", "1d": "1 day", "1w": "1 week" } as const;

export function describe(a: Alert, name: string) {
  if (a.condition === "signal_becomes") return `${name}: ${TF[a.timeframe as keyof typeof TF]} signal turns ${SIGNAL_LABEL[a.signal!].toLowerCase()}`;
  if (a.condition === "indicator_signal") return `${name}: ${a.indicatorName ?? "indicator"} gives a ${a.signal} signal on the ${TF[a.timeframe as keyof typeof TF]} chart`;
  if (a.condition === "forecast_move_above") return `${name}: 7-day forecast moves more than ${a.threshold}%`;
  return `${name}: price ${a.condition === "price_above" ? "above" : "below"} ${a.threshold!.toLocaleString("en-US", { maximumFractionDigits: 8 })}`;
}

export function AlertForm({ options, preset, limitText, indicators = [] }: { options: Opt[]; preset?: string; limitText: string; indicators?: Ind[] }) {
  const id = useId();
  const router = useRouter();
  const [asset, setAsset] = useState(options.some((o) => o.slug === preset) ? preset! : options[0]?.slug);
  const [cond, setCond] = useState<AlertCondition>("price_above");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cur = options.find((o) => o.slug === asset);
  const [ind, setInd] = useState(indicators[0]?.id);
  const curInd = indicators.find((i) => i.id === ind);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const channels = ["email", "push"].filter((c) => f.get(c));
    const sig = cond === "signal_becomes" || cond === "indicator_signal";
    const body = {
      assetSlug: asset, condition: cond, channels,
      threshold: sig ? null : Number(String(f.get("threshold") ?? "").replace(/[,\s$%]/g, "")),
      signal: sig ? f.get("signal") : null, timeframe: sig ? f.get("timeframe") : null,
      indicatorId: cond === "indicator_signal" ? ind : null,
    };
    setBusy(true); setErr(null);
    const r = await fetch("/api/v1/me/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => null))?.message ?? "Couldn't save the alert"); return; }
    toast("Alert saved");
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-1">
        <label htmlFor={`${id}-a`} className="text-sm font-semibold">Asset</label>
        <select id={`${id}-a`} value={asset} onChange={(e) => setAsset(e.target.value)} className={field}>
          {options.map((o) => <option key={o.slug} value={o.slug}>{o.name} ({o.ticker})</option>)}
        </select>
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${id}-c`} className="text-sm font-semibold">When</label>
        <select id={`${id}-c`} value={cond} onChange={(e) => setCond(e.target.value as AlertCondition)} className={field}>
          {Object.entries(COND).filter(([k]) => k !== "indicator_signal" || indicators.length).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {cond === "indicator_signal" ? (
        <div className="grid gap-3">
          <div className="grid gap-1">
            <label htmlFor={`${id}-i`} className="text-sm font-semibold">Indicator</label>
            <select id={`${id}-i`} value={ind} onChange={(e) => setInd(e.target.value)} className={field}>
              {indicators.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <label htmlFor={`${id}-is`} className="text-sm font-semibold">Signal</label>
              <select id={`${id}-is`} name="signal" key={ind} defaultValue={curInd?.buy ? "buy" : "sell"} className={field}>
                {curInd?.buy && <option value="buy">Buy</option>}
                {curInd?.sell && <option value="sell">Sell</option>}
              </select>
            </div>
            <div className="grid gap-1">
              <label htmlFor={`${id}-it`} className="text-sm font-semibold">Chart</label>
              <select id={`${id}-it`} name="timeframe" defaultValue="1d" className={field}>
                {Object.entries(TF).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted">Fires when the rule turns true on a closed bar, checked every 30 minutes.</p>
        </div>
      ) : cond === "signal_becomes" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <label htmlFor={`${id}-s`} className="text-sm font-semibold">Signal</label>
            <select id={`${id}-s`} name="signal" defaultValue="strong_buy" className={field}>
              {(["strong_buy", "buy", "neutral", "sell", "strong_sell"] as const).map((s) => <option key={s} value={s}>{SIGNAL_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="grid gap-1">
            <label htmlFor={`${id}-t`} className="text-sm font-semibold">Timeframe</label>
            <select id={`${id}-t`} name="timeframe" defaultValue="1d" className={field}>
              {Object.entries(TF).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <div className="grid gap-1">
          <label htmlFor={`${id}-v`} className="text-sm font-semibold">{cond === "forecast_move_above" ? "Percent" : "Price"}</label>
          <input id={`${id}-v`} name="threshold" inputMode="decimal" required aria-invalid={!!err} className={field}
            placeholder={cond === "forecast_move_above" ? "5" : cur ? String(+cur.price.toPrecision(4)) : ""} />
          {cur && cond !== "forecast_move_above" && <p className="text-xs text-muted">Now {cur.price.toLocaleString("en-US", { maximumFractionDigits: cur.price < 1 ? 6 : 2 })}</p>}
        </div>
      )}
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">Tell me by</legend>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="email" defaultChecked className="h-5 w-5 accent-accent" />Email</label>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="push" className="h-5 w-5 accent-accent" />Push notification</label>
        <p className="text-xs text-muted">Turn notifications on for each phone or computer under <a href="/account#app" className="font-semibold text-accent underline">Account</a>.</p>
      </fieldset>
      {err && <p role="alert" className="rounded-md bg-down-soft p-3 text-sm text-down">{err}</p>}
      <button type="submit" disabled={busy || !options.length} aria-busy={busy} className="h-10 rounded-md bg-accent text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">Save alert</button>
      <p className="text-xs text-muted">{limitText} Each alert waits at least an hour before firing again, and re-arms only after the condition stops being true.</p>
    </form>
  );
}

export function AlertRow({ alert, name }: { alert: Alert; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(alert.isActive); // optimistic: the switch moves when pressed
  async function call(method: "PATCH" | "DELETE", body?: { isActive: boolean }) {
    setBusy(true);
    if (body) setActive(body.isActive);
    const r = await fetch(`/api/v1/me/alerts/${alert.id}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    if (!r.ok) {
      if (body) setActive(!body.isActive);
      toast((await r.json().catch(() => null))?.message ?? "Couldn't update the alert", "error");
      return;
    }
    toast(method === "DELETE" ? "Alert deleted" : body!.isActive ? "Alert resumed" : "Alert paused");
    router.refresh();
  }
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border bg-surface p-4">
      <BellRing aria-hidden className={`h-5 w-5 ${active ? "text-accent" : "text-subtle"}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${active ? "" : "text-muted"}`}>{describe(alert, name)}</p>
        <p className="text-xs text-muted">{alert.channels.join(" and ")} · {alert.lastFiredAt ? `last fired ${new Date(alert.lastFiredAt).toLocaleString()}` : "hasn't fired yet"}{active ? "" : " · paused"}</p>
      </div>
      <label className="flex min-h-tap items-center gap-2 text-sm">
        <input type="checkbox" role="switch" checked={active} disabled={busy} onChange={() => call("PATCH", { isActive: !active })} className="h-5 w-5 accent-accent" />
        Active
      </label>
      <button type="button" disabled={busy} onClick={() => call("DELETE")} aria-label={`Delete alert: ${describe(alert, name)}`}
        className="grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-surface-sunken hover:text-danger"><Trash2 aria-hidden className="h-4 w-4" /></button>
    </li>
  );
}
