"use client";
// The order ticket on an asset page: fill it in, review a plain summary, confirm. Nothing is sent before the
// confirm tap, and the same confirmation can't create two orders (it carries one client order id).
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { price as fmtPrice } from "@/lib/format";
import { Badge, Button, cx } from "../ui";

type Ticket =
  | { tradable: false; reason: string; mode: "paper" | "live" }
  | { tradable: true; mode: "paper" | "live"; symbol: string; name: string; crypto: boolean; fractionable: boolean; price: number;
      held: number; maxOrderUsd: number; brackets: boolean; marketOpen: boolean };
type OrderType = "market" | "limit" | "trailing" | "oco";
type Draft = { side: "buy" | "sell"; type: OrderType; amountUsd: number | null; qty: number | null; limitPrice: number | null;
  stopLoss: number | null; takeProfit: number | null; trailPct: number | null; clientOrderId: string };

const field = "h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-fg";
const num = (s: string) => { const t = s.replace(/[,\s$]/g, ""); return t ? Number(t) : null; };
const seg = (on: boolean, tone: "up" | "down" | "accent") =>
  cx("h-10 flex-1 rounded-md border text-sm font-semibold", on ? (tone === "up" ? "border-up bg-up text-on-accent" : tone === "down" ? "border-down bg-down text-on-accent" : "border-accent bg-accent text-on-accent") : "bg-surface hover:bg-surface-sunken");

export function TradeTicket({ slug }: { slug: string }) {
  const id = useId();
  const sp = useSearchParams();
  const [t, setT] = useState<Ticket | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [side, setSide] = useState<"buy" | "sell">(sp.get("side") === "sell" ? "sell" : "buy");
  const [type, setType] = useState<OrderType>("market");
  const [trail, setTrail] = useState("5"), [ocoTake, setOcoTake] = useState(""), [ocoStop, setOcoStop] = useState("");
  const [amount, setAmount] = useState(""), [qty, setQty] = useState(""), [limit, setLimit] = useState("");
  const [stop, setStop] = useState(""), [take, setTake] = useState(""), [legs, setLegs] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/v1/trade/ticket/${slug}`).then(async (r) => {
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.message ?? "Couldn't load the order ticket");
      setT(j);
    }).catch((e) => setErr(e.message));
  }, [slug]);

  if (err) return <p role="alert" className="rounded-md bg-down-soft p-4 text-sm text-down">{err}</p>;
  if (!t) return <p className="text-sm text-muted">Checking with Alpaca…</p>;
  if (!t.tradable) return <p className="rounded-md bg-surface-sunken p-4 text-sm text-muted">{t.reason}</p>;

  const ref = type === "limit" ? num(limit) : t.price;
  const unit = t.crypto ? t.symbol.split("/")[0] : "shares";

  function review() {
    setDone(null); setErr(null);
    const kind = side === "buy" && (type === "trailing" || type === "oco") ? "market" : type;
    setDraft({ side, type: kind, amountUsd: side === "buy" ? num(amount) : null, qty: side === "sell" ? num(qty) : null,
      limitPrice: kind === "limit" ? num(limit) : null,
      stopLoss: kind === "oco" ? num(ocoStop) : side === "buy" && legs ? num(stop) : null,
      takeProfit: kind === "oco" ? num(ocoTake) : side === "buy" && legs ? num(take) : null,
      trailPct: kind === "trailing" ? num(trail) : null, clientOrderId: crypto.randomUUID() });
  }

  async function confirm() {
    if (!draft) return;
    setBusy(true);
    const r = await fetch("/api/v1/trade/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, ...draft }) });
    const j = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) { setErr(j?.message ?? "Alpaca didn't take the order"); setDraft(null); return; }
    setDone(`Order sent to Alpaca: ${j.status.replace(/_/g, " ")}.`);
    setDraft(null); setAmount(""); setQty("");
  }

  if (draft && t.tradable) {
    const est = draft.side === "buy" && draft.amountUsd && ref ? draft.amountUsd / ref : draft.qty ?? 0;
    const what = draft.side === "buy" ? `Buy about ${fmtPrice(draft.amountUsd, "USD")} of ${t.name} (${t.symbol})` : `Sell ${draft.qty} ${unit} of ${t.name} (${t.symbol})`;
    const how = draft.type === "market" ? "at the market price" : draft.type === "limit" ? `at ${fmtPrice(draft.limitPrice, "USD")} or better`
      : draft.type === "trailing" ? `if the price falls ${draft.trailPct}% from its highest point from now on`
      : `when it reaches ${fmtPrice(draft.takeProfit, "USD")}, or falls to ${fmtPrice(draft.stopLoss, "USD")}, whichever comes first`;
    return (
      <div className="grid gap-3 rounded-lg border-2 border-accent bg-surface p-4" role="region" aria-label="Review your order">
        <p className="text-sm font-semibold">Check your order</p>
        <p className="text-base">{what}, {how}.</p>
        <ul className="grid gap-1 text-sm text-muted">
          {(draft.type === "market" || draft.type === "limit") && <li>About {est.toLocaleString("en-US", { maximumFractionDigits: t.crypto ? 6 : 4 })} {unit} at {fmtPrice(ref, "USD")} each{draft.type === "market" ? " (the fill can differ)" : ""}.</li>}
          {(draft.type === "trailing" || draft.type === "oco") && <li>It stays open until it fills or you cancel it on the Trade page. The price now is {fmtPrice(t.price, "USD")}.</li>}
          {draft.type !== "oco" && draft.stopLoss && <li>Stop-loss: sells if the price falls to {fmtPrice(draft.stopLoss, "USD")}.</li>}
          {draft.type !== "oco" && draft.takeProfit && <li>Take-profit: sells if the price rises to {fmtPrice(draft.takeProfit, "USD")}.</li>}
          {!t.marketOpen && <li className="text-warning">The market is closed: the order waits for the next open.</li>}
          <li>{t.mode === "paper" ? "Practice account: no real money." : <b className="text-down">Live account: this uses real money.</b>}</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button onClick={confirm} loading={busy}>Confirm {draft.side}</Button>
          <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>Back</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); review(); }} className="grid gap-4" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        {t.mode === "paper" ? <Badge>Practice account</Badge> : <Badge tone="down">Live account: real money</Badge>}
        <span className="text-xs text-muted">{t.symbol} at Alpaca · now {fmtPrice(t.price, "USD")}{t.held ? ` · you hold ${t.held} ${unit}` : ""}</span>
      </div>
      <div role="radiogroup" aria-label="Buy or sell" className="flex gap-2">
        <button type="button" role="radio" aria-checked={side === "buy"} onClick={() => { setSide("buy"); if (type === "trailing" || type === "oco") setType("market"); }} className={seg(side === "buy", "up")}>Buy</button>
        <button type="button" role="radio" aria-checked={side === "sell"} onClick={() => setSide("sell")} className={seg(side === "sell", "down")}>Sell</button>
      </div>
      {side === "buy" ? (
        <div className="grid gap-1">
          <label htmlFor={`${id}-amt`} className="text-sm font-semibold">Amount in dollars</label>
          <input id={`${id}-amt`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" className={field} />
          <p className="text-xs text-muted">Up to {fmtPrice(t.maxOrderUsd, "USD")} per order (your limit, set on the <Link href="/trade" className="underline">Trade page</Link>).</p>
        </div>
      ) : (
        <div className="grid gap-1">
          <label htmlFor={`${id}-qty`} className="text-sm font-semibold">How many {unit}</label>
          <div className="flex gap-2">
            <input id={`${id}-qty`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={field} />
            <Button type="button" variant="secondary" disabled={!t.held} onClick={() => setQty(String(t.held))}>All</Button>
          </div>
          <p className="text-xs text-muted">{t.held ? `You hold ${t.held}. Selling closes or reduces it; the app never sells short.` : `You don't hold any ${t.name}, so there's nothing to sell.`}</p>
        </div>
      )}
      <div role="radiogroup" aria-label="Order type" className="grid grid-cols-2 gap-2 sm:flex">
        <button type="button" role="radio" aria-checked={type === "market"} onClick={() => setType("market")} className={seg(type === "market", "accent")}>At market</button>
        <button type="button" role="radio" aria-checked={type === "limit"} onClick={() => setType("limit")} className={seg(type === "limit", "accent")}>Limit</button>
        {side === "sell" && t.brackets && <>
          <button type="button" role="radio" aria-checked={type === "trailing"} onClick={() => setType("trailing")} className={seg(type === "trailing", "accent")}>Trailing stop</button>
          <button type="button" role="radio" aria-checked={type === "oco"} onClick={() => setType("oco")} className={seg(type === "oco", "accent")}>Target + stop</button>
        </>}
      </div>
      {side === "sell" && type === "trailing" && (
        <div className="grid gap-1">
          <label htmlFor={`${id}-tr`} className="text-sm font-semibold">Trail (%)</label>
          <input id={`${id}-tr`} inputMode="decimal" value={trail} onChange={(e) => setTrail(e.target.value)} className={field} />
          <p className="text-xs text-muted">Sells if the price drops this far below its highest point after you place it, so it locks in gains as the price rises. Whole shares only.</p>
        </div>
      )}
      {side === "sell" && type === "oco" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1"><label htmlFor={`${id}-ot`} className="text-sm font-semibold">Target price</label>
            <input id={`${id}-ot`} inputMode="decimal" value={ocoTake} onChange={(e) => setOcoTake(e.target.value)} className={field} /></div>
          <div className="grid gap-1"><label htmlFor={`${id}-os`} className="text-sm font-semibold">Stop price</label>
            <input id={`${id}-os`} inputMode="decimal" value={ocoStop} onChange={(e) => setOcoStop(e.target.value)} className={field} /></div>
          <p className="col-span-2 text-xs text-muted">Sells at the target or the stop, whichever the price reaches first; filling one cancels the other. Whole shares only.</p>
        </div>
      )}
      {type === "limit" && (
        <div className="grid gap-1">
          <label htmlFor={`${id}-lim`} className="text-sm font-semibold">Limit price</label>
          <input id={`${id}-lim`} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder={String(+t.price.toPrecision(6))} className={field} />
          <p className="text-xs text-muted">{side === "buy" ? "Buys only at this price or lower." : "Sells only at this price or higher."}</p>
        </div>
      )}
      {side === "buy" && t.brackets && (
        <fieldset className="grid gap-2">
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={legs} onChange={(e) => setLegs(e.target.checked)} className="h-5 w-5 accent-accent" />Add a stop-loss and take-profit</label>
          {legs && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1"><label htmlFor={`${id}-sl`} className="text-sm font-semibold">Stop-loss</label>
                <input id={`${id}-sl`} inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} className={field} /></div>
              <div className="grid gap-1"><label htmlFor={`${id}-tp`} className="text-sm font-semibold">Take-profit</label>
                <input id={`${id}-tp`} inputMode="decimal" value={take} onChange={(e) => setTake(e.target.value)} className={field} /></div>
              <p className="col-span-2 text-xs text-muted">With these, Alpaca buys whole shares only, and sells automatically at either price.</p>
            </div>
          )}
        </fieldset>
      )}
      {done && <p role="status" className="rounded-md bg-up-soft p-3 text-sm text-up">{done} <Link href="/trade" className="font-semibold underline">See it on the Trade page</Link></p>}
      <Button type="submit" disabled={side === "buy" ? !num(amount) : !num(qty)}>Review {side}</Button>
      <p className="text-xs text-muted">Signals and forecasts are statistics, not advice. Only trade what you can afford to lose.</p>
    </form>
  );
}
