"use client";
import { ArrowLeftRight } from "lucide-react";
import { useId, useState } from "react";

export function Converter({ ticker, price }: { ticker: string; price: number }) {
  const id = useId();
  const [amt, setAmt] = useState("1");
  const [toUsd, setToUsd] = useState(true);
  const n = Number(amt.replace(/[,\s]/g, ""));
  const ok = Number.isFinite(n) && n >= 0;
  const out = ok ? (toUsd ? n * price : n / price) : null;
  const from = toUsd ? ticker : "USD", to = toUsd ? "USD" : ticker;
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <label htmlFor={id} className="text-sm font-semibold">Amount in {from}</label>
        <input id={id} inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} aria-invalid={!ok}
          className="h-10 rounded-md border border-input bg-surface px-3 text-sm aria-[invalid=true]:border-danger" />
      </div>
      <button type="button" onClick={() => setToUsd(!toUsd)} className="inline-flex h-10 items-center gap-2 justify-self-start rounded-md px-2 text-sm font-semibold text-accent hover:bg-surface-sunken">
        <ArrowLeftRight aria-hidden className="h-4 w-4" />Swap to {to} → {from}
      </button>
      <p aria-live="polite" className="tabular text-lg">
        {out === null ? <span className="text-sm text-danger">Enter a number</span>
          : <>{out.toLocaleString("en-US", { maximumFractionDigits: to === "USD" ? 2 : 8 })} <span className="text-sm text-muted">{to}</span></>}
      </p>
      <p className="text-xs text-muted">At the latest price. Exchanges add fees and spreads.</p>
    </div>
  );
}
