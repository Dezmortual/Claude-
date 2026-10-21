"use client";
import { useId, useState, type FormEvent } from "react";
import { money } from "@/lib/format";

const input = "h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-fg aria-[invalid=true]:border-danger";
const btn = "h-10 rounded-md bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover";

function parseAmount(s: string) {
  const n = Number(s.replace(/[,\s$]/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 1e9 ? n : null;
}

const usd = (n: number) => money(Math.round(n * 100));

export function ScenarioCalc({ base, ranges }: { base: number; ranges: { key: string; label: string; low: number; mid: number; high: number }[] }) {
  const id = useId();
  const [amount, setAmount] = useState("1000");
  const [h, setH] = useState(ranges[1]?.key ?? ranges[0].key);
  const [err, setErr] = useState<string | null>(null);
  const [out, setOut] = useState<null | { low: number; mid: number; high: number; amt: number; label: string }>(null);
  function calc(e: FormEvent) {
    e.preventDefault();
    const amt = parseAmount(amount);
    if (!amt) { setErr("Enter an amount above 0, like 1000"); setOut(null); return; }
    setErr(null);
    const r = ranges.find((x) => x.key === h)!;
    setOut({ amt, label: r.label, low: (amt * r.low) / base, mid: (amt * r.mid) / base, high: (amt * r.high) / base });
  }
  return (
    <form onSubmit={calc} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="grid gap-1">
          <label htmlFor={`${id}-a`} className="text-sm font-semibold">Amount (USD)</label>
          <input id={`${id}-a`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!err} aria-describedby={err ? `${id}-e` : undefined} className={input} />
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-h`} className="text-sm font-semibold">Horizon</label>
          <select id={`${id}-h`} value={h} onChange={(e) => setH(e.target.value)} className={input}>
            {ranges.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        <button type="submit" className={btn}>Calculate</button>
      </div>
      {err && <p id={`${id}-e`} className="text-xs text-danger">{err}</p>}
      <div aria-live="polite">
        {out && (
          <dl className="grid grid-cols-3 gap-2 text-center">
            {([["Low end", out.low, "text-down"], ["Midpoint", out.mid, "text-fg"], ["High end", out.high, "text-up"]] as const).map(([l, v, c]) => (
              <div key={l} className="rounded-md bg-surface-sunken p-3">
                <dt className="text-2xs uppercase tracking-wide text-subtle">{l}</dt>
                <dd className={`tabular mt-1 text-base font-semibold ${c}`}>{usd(v)}</dd>
              </div>
            ))}
            <p className="col-span-3 text-left text-xs text-muted">{usd(out.amt)} invested today, valued at the {out.label.toLowerCase()} forecast range. Fees, spreads and taxes are not included.</p>
          </dl>
        )}
      </div>
    </form>
  );
}

export function ContributionCalc({ cagr }: { cagr: { bear: number; base: number; bull: number } }) {
  const id = useId();
  const [monthly, setMonthly] = useState("200");
  const [years, setYears] = useState("5");
  const [err, setErr] = useState<string | null>(null);
  const [out, setOut] = useState<null | { paid: number; bear: number; base: number; bull: number }>(null);
  function fv(m: number, y: number, r: number) {
    const i = (1 + r) ** (1 / 12) - 1, n = y * 12;
    return i === 0 ? m * n : m * (((1 + i) ** n - 1) / i);
  }
  function calc(e: FormEvent) {
    e.preventDefault();
    const m = parseAmount(monthly), y = Number(years);
    if (!m) { setErr("Enter a monthly amount above 0"); setOut(null); return; }
    setErr(null);
    setOut({ paid: m * y * 12, bear: fv(m, y, cagr.bear), base: fv(m, y, cagr.base), bull: fv(m, y, cagr.bull) });
  }
  return (
    <form onSubmit={calc} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="grid gap-1">
          <label htmlFor={`${id}-m`} className="text-sm font-semibold">Each month (USD)</label>
          <input id={`${id}-m`} inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} aria-invalid={!!err} className={input} />
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-y`} className="text-sm font-semibold">For</label>
          <select id={`${id}-y`} value={years} onChange={(e) => setYears(e.target.value)} className={input}>
            {[1, 2, 3, 5, 10].map((y) => <option key={y} value={y}>{y} {y === 1 ? "year" : "years"}</option>)}
          </select>
        </div>
        <button type="submit" className={btn}>Calculate</button>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      <div aria-live="polite">
        {out && (
          <dl className="grid grid-cols-3 gap-2 text-center">
            {([["Bear", out.bear, "text-down"], ["Base", out.base, "text-fg"], ["Bull", out.bull, "text-up"]] as const).map(([l, v, c]) => (
              <div key={l} className="rounded-md bg-surface-sunken p-3">
                <dt className="text-2xs uppercase tracking-wide text-subtle">{l} case</dt>
                <dd className={`tabular mt-1 text-base font-semibold ${c}`}>{usd(v)}</dd>
              </div>
            ))}
            <p className="col-span-3 text-left text-xs text-muted">You would pay in {usd(out.paid)}. Each case compounds monthly at the scenario growth rate below; real returns arrive unevenly and can be negative.</p>
          </dl>
        )}
      </div>
    </form>
  );
}
