"use client";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "../ui";
import { toast } from "./Toaster";

async function call(url: string, init: RequestInit, ok: string, router: ReturnType<typeof useRouter>) {
  const r = await fetch(url, init);
  if (!r.ok) { toast((await r.json().catch(() => null))?.message ?? "Alpaca didn't accept that", "error"); return; }
  toast(ok);
  router.refresh();
}

/** Sells a whole position at market, after a confirm. */
export function ClosePosition({ symbol, name, qty }: { symbol: string; name: string; qty: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <Button size="sm" variant="secondary" loading={busy} aria-label={`Close ${name}`} onClick={async () => {
    if (!confirm(`Sell all ${qty} ${name} at market?`)) return;
    setBusy(true); await call(`/api/v1/trade/positions?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" }, `Closing ${name}`, router); setBusy(false);
  }}>Close</Button>;
}

export function CancelOrder({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <Button size="sm" variant="ghost" loading={busy} aria-label={`Cancel ${label}`} onClick={async () => {
    setBusy(true); await call(`/api/v1/trade/orders/${id}`, { method: "DELETE" }, "Order cancelled", router); setBusy(false);
  }}>Cancel</Button>;
}

export function MaxOrderForm({ value }: { value: number }) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = Number(String(new FormData(e.currentTarget).get("max")).replace(/[,\s$]/g, ""));
    setBusy(true);
    await call("/api/v1/trade/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ maxOrderUsd: v }) }, "Limit saved", router);
    setBusy(false);
  }
  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1">
        <label htmlFor={`${id}-max`} className="text-sm font-semibold">Largest single order (USD)</label>
        <input id={`${id}-max`} name="max" inputMode="decimal" defaultValue={value} className="h-10 w-40 rounded-md border border-input bg-surface px-3 text-sm text-fg" />
      </div>
      <Button type="submit" variant="secondary" loading={busy}>Save</Button>
    </form>
  );
}
