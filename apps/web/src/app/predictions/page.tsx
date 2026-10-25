import Link from "next/link";
import { redirect } from "next/navigation";
import { PredictionList } from "@/components/Predictions";
import { Banner, Button, Card, EmptyState, Label } from "@/components/ui";
import { DataError, predictions } from "@/lib/data";
import { viewer } from "@/lib/session";

export const metadata = { title: "Prediction markets" };

export default async function Predictions({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/predictions");
  const q = (await searchParams).q?.slice(0, 80) ?? "";
  let r: Awaited<ReturnType<typeof predictions>> | null = null, problem: string | null = null;
  try { r = await predictions(v, q); } catch (e) { if (e instanceof DataError) problem = e.message; else throw e; }
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Label><Link href="/macro" className="hover:underline">Economy</Link></Label>
        <h1 className="text-xl md:text-display">Prediction markets</h1>
        <p className="max-w-prose text-muted">
          What traders on Polymarket are paying for &ldquo;yes&rdquo; on the 200 busiest open questions: 62% yes means a share that pays $1 if it happens costs 62 cents.
          The crowd&apos;s odds, often wrong, updated every 10 minutes. Polymarket isn&apos;t available to trade in every country; this page only reads its public prices.
        </p>
        <form method="get" className="flex max-w-md items-end gap-2">
          <div className="grid flex-1 gap-1"><label htmlFor="pq" className="text-xs font-semibold">Search questions</label>
            <input id="pq" name="q" defaultValue={q} placeholder="Fed, bitcoin, election…" className="h-10 rounded-md border border-input bg-surface px-3 text-sm text-fg" /></div>
          <Button type="submit" size="sm" variant="secondary">Search</Button>
        </form>
      </div>
      {problem && <Banner tone="warning">{problem}</Banner>}
      {r?.stale && <Banner tone="warning">Polymarket isn&apos;t answering, so these are the odds from {new Date(r.fetchedAt).toISOString().slice(11, 16)} UTC.</Banner>}
      {r && (r.markets.length ? <PredictionList items={r.markets.slice(0, 60)} />
        : <Card><EmptyState title="No open markets match">Try a shorter search.</EmptyState></Card>)}
    </div>
  );
}
