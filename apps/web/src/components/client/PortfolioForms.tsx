"use client";
// Forms for the ledger, benchmark, target weights and limits.
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "../ui";
import { toast } from "./Toaster";

type Opt = { slug: string; name: string; ticker?: string };
const field = "h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-fg";
const num = (s: string) => { const t = s.replace(/[,\s$%]/g, ""); return t ? Number(t) : null; };

async function call(method: string, url: string, body?: unknown) {
  const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message ?? "That didn't work");
  return j;
}
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return { busy, run: async (fn: () => Promise<unknown>, done: (j: never) => string) => {
    setBusy(true);
    try { const j = await fn(); toast(done(j as never)); router.refresh(); return true; }
    catch (e) { toast(e instanceof Error ? e.message : String(e), "error"); return false; } finally { setBusy(false); }
  } };
}

/** A sale, a dividend or a fee. Purchases use the form on the Holdings page. */
export function EntryForm({ options, today }: { options: Opt[]; today: string }) {
  const id = useId();
  const { busy, run } = useAction();
  const [kind, setKind] = useState<"sell" | "dividend" | "fee">("sell");
  const [slug, setSlug] = useState(options[0]?.slug ?? "");
  const [qty, setQty] = useState(""), [price, setPrice] = useState(""), [amount, setAmount] = useState(""), [on, setOn] = useState(today), [note, setNote] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => call("POST", "/api/v1/me/portfolio/entries", { slug, kind, on, note: note || null,
      quantity: kind === "sell" ? num(qty) : null, price: kind === "sell" ? num(price) : null, amount: num(amount) }), () => kind === "sell" ? "Sale recorded" : kind === "dividend" ? "Dividend recorded" : "Fee recorded");
    if (ok) { setQty(""); setPrice(""); setAmount(""); setNote(""); }
  }
  if (!options.length) return <p className="text-sm text-muted">Add a purchase first: sales, dividends and fees belong to something you hold.</p>;
  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1"><label htmlFor={`${id}-k`} className="text-sm font-semibold">What happened</label>
          <select id={`${id}-k`} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={field}>
            <option value="sell">A sale</option><option value="dividend">A dividend</option><option value="fee">A fee</option>
          </select></div>
        <div className="grid gap-1"><label htmlFor={`${id}-a`} className="text-sm font-semibold">Asset</label>
          <select id={`${id}-a`} value={slug} onChange={(e) => setSlug(e.target.value)} className={field}>
            {options.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
          </select></div>
      </div>
      {kind === "sell" ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-1"><label htmlFor={`${id}-q`} className="text-sm font-semibold">How many</label><input id={`${id}-q`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={field} /></div>
          <div className="grid gap-1"><label htmlFor={`${id}-p`} className="text-sm font-semibold">Price each</label><input id={`${id}-p`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={field} /></div>
          <div className="grid gap-1"><label htmlFor={`${id}-f`} className="text-sm font-semibold">Fee (optional)</label><input id={`${id}-f`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} /></div>
        </div>
      ) : (
        <div className="grid gap-1"><label htmlFor={`${id}-m`} className="text-sm font-semibold">{kind === "dividend" ? "Received (USD)" : "Paid (USD)"}</label>
          <input id={`${id}-m`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} /></div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1"><label htmlFor={`${id}-d`} className="text-sm font-semibold">Date</label><input id={`${id}-d`} type="date" value={on} max={today} onChange={(e) => setOn(e.target.value)} className={field} /></div>
        <div className="grid gap-1"><label htmlFor={`${id}-n`} className="text-sm font-semibold">Note (optional)</label><input id={`${id}-n`} value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} className={field} /></div>
      </div>
      <Button type="submit" loading={busy}>Record it</Button>
    </form>
  );
}

export function DeleteEntry({ id, label, holding }: { id: string; label: string; holding: boolean }) {
  const { busy, run } = useAction();
  return (
    <Button size="sm" variant="ghost" disabled={busy} aria-label={`Delete ${label}`}
      onClick={() => { if (confirm(`Delete ${label}?`)) run(() => call("DELETE", holding ? `/api/v1/me/holdings/${id}` : `/api/v1/me/portfolio/entries/${id}`), () => "Deleted"); }}>
      <Trash2 aria-hidden className="h-4 w-4" />
    </Button>
  );
}

export function BrokerImport({ imported }: { imported: number }) {
  const { busy, run } = useAction();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" loading={busy} onClick={() => run(() => call("POST", "/api/v1/me/portfolio/import"),
        (j: { added: number; alreadyThere: number; skipped: number; mode: string }) =>
          `${j.added} fill${j.added === 1 ? "" : "s"} added from Alpaca${j.mode === "paper" ? " (practice)" : ""}${j.alreadyThere ? `, ${j.alreadyThere} already there` : ""}${j.skipped ? `, ${j.skipped} skipped` : ""}`)}>
        Import my Alpaca trades
      </Button>
      {imported > 0 && <Button variant="ghost" disabled={busy} onClick={() => { if (confirm(`Remove all ${imported} imported entries?`)) run(() => call("DELETE", "/api/v1/me/portfolio/import"), (j: { removed: number }) => `${j.removed} imported entries removed`); }}>
        Remove imported entries</Button>}
    </div>
  );
}

export function BenchmarkPicker({ options, value }: { options: Opt[]; value: string }) {
  const id = useId();
  const { busy, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`${id}-b`} className="text-sm font-semibold">Compare with</label>
      <select id={`${id}-b`} defaultValue={value} disabled={busy} className={`${field} w-auto`}
        onChange={(e) => run(() => call("PUT", "/api/v1/me/portfolio/benchmark", { slug: e.target.value }), () => "Benchmark changed")}>
        {options.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
      </select>
    </div>
  );
}

export function TargetsForm({ options, initial, current }: { options: Opt[]; initial: { slug: string; weight: number }[]; current: { slug: string; weight: number }[] }) {
  const id = useId();
  const { busy, run } = useAction();
  const [rows, setRows] = useState(initial.length ? initial.map((r) => ({ slug: r.slug, w: String(r.weight) })) : current.map((r) => ({ slug: r.slug, w: (r.weight * 100).toFixed(1) })));
  const sum = rows.reduce((a, r) => a + (num(r.w) ?? 0), 0);
  const set = (i: number, p: Partial<{ slug: string; w: string }>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <form className="grid gap-3" noValidate onSubmit={(e) => { e.preventDefault(); run(() => call("PUT", "/api/v1/me/portfolio/targets", { targets: rows.filter((r) => num(r.w)).map((r) => ({ slug: r.slug, weight: num(r.w)! })) }), () => "Targets saved"); }}>
      <ul className="grid gap-2">
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
            <div className="grid gap-1"><label htmlFor={`${id}-s${i}`} className="sr-only">Asset {i + 1}</label>
              <select id={`${id}-s${i}`} value={r.slug} onChange={(e) => set(i, { slug: e.target.value })} className={field}>
                {options.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
              </select></div>
            <div className="grid gap-1"><label htmlFor={`${id}-w${i}`} className="sr-only">Target % for asset {i + 1}</label>
              <input id={`${id}-w${i}`} inputMode="decimal" value={r.w} onChange={(e) => set(i, { w: e.target.value })} className={field} aria-label={`Target % for ${options.find((o) => o.slug === r.slug)?.name ?? "asset"}`} /></div>
            <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${options.find((o) => o.slug === r.slug)?.name ?? "row"}`} onClick={() => setRows(rows.filter((_, k) => k !== i))}><Trash2 aria-hidden className="h-4 w-4" /></Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => setRows([...rows, { slug: options.find((o) => !rows.some((r) => r.slug === o.slug))?.slug ?? options[0].slug, w: "" }])}><Plus aria-hidden className="h-4 w-4" />Add an asset</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setRows(current.map((r) => ({ slug: r.slug, w: (r.weight * 100).toFixed(1) })))}>Start from today&apos;s weights</Button>
        <span role="status" className={Math.abs(sum - 100) > 0.5 ? "text-sm text-down" : "text-sm text-muted"}>Adds up to {+sum.toFixed(2)}%</span>
      </div>
      <Button type="submit" loading={busy} disabled={Math.abs(sum - 100) > 0.5}>Save targets</Button>
    </form>
  );
}

export function LimitForm({ holdings, markets }: { holdings: Opt[]; markets: { code: string; name: string }[] }) {
  const id = useId();
  const { busy, run } = useAction();
  const [kind, setKind] = useState<"max_holding" | "max_market">("max_holding");
  const [target, setTarget] = useState("any"), [pct, setPct] = useState("25");
  return (
    <form className="grid gap-3 md:grid-cols-[1fr_1fr_7rem_auto] md:items-end" noValidate
      onSubmit={(e) => { e.preventDefault(); run(() => call("POST", "/api/v1/me/portfolio/limits", { kind, target, pct: num(pct) }), () => "Limit added"); }}>
      <div className="grid gap-1"><label htmlFor={`${id}-k`} className="text-xs font-semibold">Limit on</label>
        <select id={`${id}-k`} value={kind} onChange={(e) => { const k = e.target.value as typeof kind; setKind(k); setTarget(k === "max_holding" ? "any" : markets[0]?.code ?? "crypto"); }} className={field}>
          <option value="max_holding">One holding</option><option value="max_market">A whole market</option>
        </select></div>
      <div className="grid gap-1"><label htmlFor={`${id}-t`} className="text-xs font-semibold">Which</label>
        <select id={`${id}-t`} value={target} onChange={(e) => setTarget(e.target.value)} className={field}>
          {kind === "max_holding" ? <><option value="any">Any one holding</option>{holdings.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}</>
            : markets.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
        </select></div>
      <div className="grid gap-1"><label htmlFor={`${id}-p`} className="text-xs font-semibold">At most %</label>
        <input id={`${id}-p`} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className={field} /></div>
      <Button type="submit" loading={busy}>Add limit</Button>
    </form>
  );
}

export function DeleteLimit({ id, label }: { id: string; label: string }) {
  const { busy, run } = useAction();
  return <Button size="sm" variant="ghost" disabled={busy} aria-label={`Delete limit: ${label}`} onClick={() => run(() => call("DELETE", `/api/v1/me/portfolio/limits/${id}`), () => "Limit deleted")}><Trash2 aria-hidden className="h-4 w-4" /></Button>;
}
