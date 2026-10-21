"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Columns3, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "./Toaster";

const GROUPS: { title: string; cols: [string, string][] }[] = [
  { title: "Forecasts", cols: [["price", "Price"], ["1d", "Next day"], ["7d", "7 days"], ["1m", "1 month"]] },
  { title: "Long-term scenarios", cols: [["1y", "1 year"], ["5y", "5 years"], ["10y", "10 years"]] },
  { title: "Signals and trend", cols: [["signal", "7-day signal"], ["macd", "MACD"], ["maCross", "50/200 cross"], ["ma200", "vs 200-day average"]] },
  { title: "Risk and income", cols: [["volatility", "Volatility"], ["sharpe", "Sharpe ratio, 1 year"], ["dividend", "Dividend yield"]] },
];

export function ColumnPicker({ visible, defaults, signedIn, rowsPerPage }: { visible: string[]; defaults: string[]; signedIn: boolean; rowsPerPage: number }) {
  const [open, setOpen] = useState(false);
  const [cols, setCols] = useState(visible);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save(next: string[]) {
    setSaving(true);
    if (signedIn) {
      const res = await fetch("/api/v1/me/preferences", { method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibleColumns: next, rowsPerPage, defaultTab: "investing" }) });
      if (!res.ok) { setSaving(false); toast("Couldn't save your columns", "error"); return; }
    } else {
      document.cookie = `cols=${encodeURIComponent(next.join(","))}; path=/; max-age=31536000; samesite=lax`;
    }
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  const toggle = (k: string) => setCols((c) => (c.includes(k) ? (c.length > 1 ? c.filter((x) => x !== k) : c) : [...c, k]));

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) setCols(visible); }}>
      <Dialog.Trigger className="inline-flex h-10 items-center gap-2 rounded-md border bg-surface px-3 text-sm font-semibold hover:bg-surface-sunken">
        <Columns3 aria-hidden className="h-4 w-4" />Columns
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-modal bg-overlay/50" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-modal max-h-screen overflow-y-auto rounded-t-xl bg-surface p-6 shadow-pop md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg">Table columns</Dialog.Title>
              <Dialog.Description className="text-sm text-muted">
                {signedIn ? "Saved to your account." : "Saved on this device. Sign in to keep them everywhere."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="grid h-10 w-10 place-items-center rounded-md hover:bg-surface-sunken" aria-label="Close"><X aria-hidden className="h-5 w-5" /></Dialog.Close>
          </div>
          <div className="grid gap-5">
            {GROUPS.map((g) => (
              <fieldset key={g.title} className="grid gap-1">
                <legend className="mb-1 text-2xs uppercase tracking-wide text-subtle">{g.title}</legend>
                {g.cols.map(([k, label]) => (
                  <label key={k} className="flex min-h-tap cursor-pointer items-center justify-between gap-3 rounded-md px-2 hover:bg-surface-sunken">
                    <span className="text-sm">{label}</span>
                    <input type="checkbox" role="switch" checked={cols.includes(k)} onChange={() => toggle(k)}
                      disabled={cols.length === 1 && cols.includes(k)} className="h-5 w-5 accent-accent" />
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">The asset column always shows, and at least one other column stays on.</p>
          <div className="mt-6 flex justify-between gap-3">
            <button type="button" onClick={() => setCols(defaults)} className="h-10 rounded-md px-4 text-sm font-semibold hover:bg-surface-sunken">Reset</button>
            <button type="button" onClick={() => save(cols)} disabled={saving} aria-busy={saving}
              className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">Done</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
