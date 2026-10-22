"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "../ui";
import { toast } from "./Toaster";

type Opt = { slug: string; name: string; ticker: string; unit: string };
const field = "h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-fg aria-[invalid=true]:border-danger";
const num = (s: FormDataEntryValue | null) => { const t = String(s ?? "").replace(/[,\s$]/g, ""); return t ? Number(t) : null; };

/** Add one purchase: what, how many, and (optionally) the price paid and the date. */
export function HoldingForm({ options }: { options: Opt[] }) {
  const id = useId();
  const router = useRouter();
  const [asset, setAsset] = useState(options.find((o) => o.slug === "bitcoin")?.slug ?? options[0]?.slug);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const unit = options.find((o) => o.slug === asset)?.unit ?? "units";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { assetSlug: asset, quantity: num(f.get("quantity")), costPrice: num(f.get("cost")), boughtOn: String(f.get("date") || "") || null, note: String(f.get("note") || "") || null };
    setBusy(true); setErr(null);
    const r = await fetch("/api/v1/me/holdings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => null))?.message ?? "Couldn't add it"); return; }
    toast("Added to your portfolio");
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <div className="grid gap-1">
        <label htmlFor={`${id}-a`} className="text-sm font-semibold">Asset</label>
        <select id={`${id}-a`} value={asset} onChange={(e) => setAsset(e.target.value)} className={field}>
          {options.map((o) => <option key={o.slug} value={o.slug}>{o.name} ({o.ticker})</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <label htmlFor={`${id}-q`} className="text-sm font-semibold">Quantity</label>
          <input id={`${id}-q`} name="quantity" inputMode="decimal" required aria-invalid={!!err} aria-describedby={`${id}-qh`} className={field} />
          <p id={`${id}-qh`} className="text-xs text-muted">In {unit}</p>
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-c`} className="text-sm font-semibold">Price paid each <span className="font-normal text-muted">(optional)</span></label>
          <input id={`${id}-c`} name="cost" inputMode="decimal" placeholder="USD" className={field} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <label htmlFor={`${id}-d`} className="text-sm font-semibold">Bought on <span className="font-normal text-muted">(optional)</span></label>
          <input id={`${id}-d`} name="date" type="date" className={field} />
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-n`} className="text-sm font-semibold">Note <span className="font-normal text-muted">(optional)</span></label>
          <input id={`${id}-n`} name="note" maxLength={120} className={field} />
        </div>
      </div>
      {err && <p role="alert" className="rounded-md bg-down-soft p-3 text-sm text-down">{err}</p>}
      <Button type="submit" loading={busy}>Add purchase</Button>
      <p className="text-xs text-muted">Only assets priced in dollars can be added up, so currency pairs and bond yields aren&apos;t listed. Gold, silver, oil and the indices are held as their stand-in funds&apos; shares.</p>
    </form>
  );
}

export function DeleteLot({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!confirm(`Remove ${label}?`)) return;
    setBusy(true);
    const r = await fetch(`/api/v1/me/holdings/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) { toast("Couldn't remove it", "error"); return; }
    toast("Removed");
    router.refresh();
  }
  return (
    <button type="button" onClick={del} disabled={busy} aria-label={`Remove ${label}`} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-sunken hover:text-danger disabled:opacity-50">
      <Trash2 aria-hidden className="h-4 w-4" />
    </button>
  );
}
