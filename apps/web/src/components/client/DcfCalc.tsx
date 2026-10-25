"use client";
// A discounted-cash-flow value you can steer: change the growth and the discount rate, and see what it does.
import { useId, useState } from "react";
import { dcf } from "@/lib/fundamentals";
import { price as fmtPrice } from "@/lib/format";
import { cx } from "../ui";

const field = "h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-fg";

export function DcfCalc({ fcf, netCash, shares, price, defaultGrowth }: { fcf: number; netCash: number; shares: number; price: number; defaultGrowth: number }) {
  const id = useId();
  const [growth, setGrowth] = useState(String(defaultGrowth.toFixed(1))), [years, setYears] = useState("5");
  const [terminal, setTerminal] = useState("2.5"), [discount, setDiscount] = useState("9");
  const n = (s: string) => Number(s.replace(/[%\s]/g, ""));
  const run = (g: number, d: number) => { try { return dcf({ fcf, growth: g / 100, years: Math.round(n(years)), terminal: n(terminal) / 100, discount: d / 100, netCash, shares }); } catch { return null; } };
  const r = run(n(growth), n(discount));
  const err = !r ? (n(discount) <= n(terminal) ? "The discount rate must be above the long-run growth rate." : "Check the numbers.") : null;
  const gap = r ? (r.perShare / price - 1) * 100 : null;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Growth a year (%)", growth, setGrowth, "g"], ["For (years)", years, setYears, "y"], ["Then for ever (%)", terminal, setTerminal, "t"], ["Discount rate (%)", discount, setDiscount, "d"]].map(([label, val, set, k]) => (
          <div key={k as string} className="grid gap-1">
            <label htmlFor={`${id}-${k}`} className="text-xs font-semibold">{label as string}</label>
            <input id={`${id}-${k}`} inputMode="decimal" value={val as string} onChange={(e) => (set as (s: string) => void)(e.target.value)} className={field} />
          </div>
        ))}
      </div>
      {err ? <p role="status" className="text-sm text-down">{err}</p> : r && (
        <div role="status" className="grid gap-1">
          <p className="text-lg">Value: <span className="tabular font-semibold">{fmtPrice(r.perShare, "USD")}</span> a share, against {fmtPrice(price, "USD")} now:{" "}
            <span className={cx("font-semibold", gap! >= 0 ? "text-up" : "text-down")}>{gap! >= 0 ? `${gap!.toFixed(0)}% above` : `${Math.abs(gap!).toFixed(0)}% below`}</span> the price.</p>
          <p className="text-xs text-muted">{Math.round(r.terminalShare * 100)}% of that value comes from the years after the first {Math.round(n(years))}: small changes to the long-run numbers move it a lot.</p>
        </div>
      )}
      <div tabIndex={0} role="region" aria-label="Sensitivity table" className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <caption className="px-3 pt-3 text-left text-sm font-semibold">Value a share as growth and the discount rate change</caption>
          <thead><tr><th scope="col" className="px-2 py-2 text-left">Growth ↓ · discount →</th>
            {[-1, 0, 1].map((d) => <th key={d} scope="col" className="px-2 py-2 text-right">{(n(discount) + d).toFixed(1)}%</th>)}</tr></thead>
          <tbody>{[-2, 0, 2].map((g) => (
            <tr key={g} className="border-t"><th scope="row" className="px-2 py-2 text-left font-normal">{(n(growth) + g).toFixed(1)}%</th>
              {[-1, 0, 1].map((d) => { const x = run(n(growth) + g, n(discount) + d); return <td key={d} className={cx("tabular px-2 py-2 text-right", x && (x.perShare >= price ? "text-up" : "text-down"), g === 0 && d === 0 && "font-semibold")}>{x ? fmtPrice(x.perShare, "USD") : "—"}</td>; })}</tr>
          ))}</tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Starts from the last fiscal year&apos;s free cash flow ({fmtPrice(fcf / 1e9, "USD")}bn) and adds net cash ({fmtPrice(netCash / 1e9, "USD")}bn). A model of your assumptions, not a fair value.</p>
    </div>
  );
}
