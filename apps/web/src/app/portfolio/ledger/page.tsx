import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { PortfolioNav } from "@/components/PortfolioNav";
import { BrokerImport, DeleteEntry, EntryForm } from "@/components/client/PortfolioForms";
import { Badge, Card, EmptyState, Label, Section, cx } from "@/components/ui";
import { brokerReady, ledger, portfolio } from "@/lib/data";
import { price } from "@/lib/format";
import { viewer } from "@/lib/session";

export const metadata = { title: "Portfolio ledger" };
const KIND = { buy: "Bought", sell: "Sold", dividend: "Dividend", fee: "Fee" } as const;
const qty = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 8 });

export default async function Ledger() {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/portfolio/ledger");
  const [rows, p] = await Promise.all([ledger(v), portfolio(v)]);
  const imported = rows.filter((r) => r.source === "alpaca").length;
  const held = p.positions.map((x) => ({ slug: x.asset.slug, name: x.asset.name }));
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Label>Portfolio</Label>
        <h1 className="text-xl md:text-display">Ledger</h1>
        <PortfolioNav at="/portfolio/ledger" />
        <p className="max-w-prose text-muted">Every purchase, sale, dividend and fee. Holdings, profit and the performance page are all worked out from this list.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Section id="entries" title={`All entries (${rows.length})`}>
          {!rows.length ? <Card><EmptyState icon={<BookOpen aria-hidden className="h-6 w-6" />} title="Nothing recorded yet">Add a purchase on the Holdings page, or import your Alpaca trades.</EmptyState></Card> : (
            <div tabIndex={0} role="region" aria-label="Ledger table" className="overflow-x-auto rounded-lg border bg-surface">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">Ledger entries, newest first</caption>
                <thead className="bg-surface-sunken text-2xs uppercase tracking-wide text-subtle"><tr>
                  <th scope="col" className="px-3 py-2 text-left">Date</th><th scope="col" className="px-3 py-2 text-left">What</th>
                  <th scope="col" className="px-3 py-2 text-right">Amount</th><th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{rows.map((r) => {
                  const what = `${KIND[r.kind]} ${r.kind === "buy" || r.kind === "sell" ? `${qty(r.quantity!)} ` : ""}${r.name}`;
                  const money = r.kind === "buy" || r.kind === "sell" ? (r.price !== null ? r.quantity! * r.price : null) : r.amount;
                  return (
                    <tr key={`${r.table}-${r.id}`} className="border-t">
                      <td className="whitespace-nowrap px-3 py-2">{r.on ?? <span className="text-muted">No date</span>}</td>
                      <td className="px-3 py-2">{what}{r.price !== null && <span className="text-muted"> at {price(r.price)}</span>}
                        {r.source === "alpaca" && <Badge className="ml-2">Alpaca</Badge>}{r.note && <span className="block text-xs text-muted">{r.note}</span>}</td>
                      <td className={cx("tabular px-3 py-2 text-right", (r.kind === "sell" || r.kind === "dividend") && "text-up")}>
                        {money === null ? "—" : `${r.kind === "buy" || r.kind === "fee" ? "−" : "+"}${price(money)}`}</td>
                      <td className="px-3 py-2 text-right"><DeleteEntry id={r.id} label={`${what}${r.on ? ` on ${r.on}` : ""}`} holding={r.table === "holding"} /></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </Section>
        <div className="space-y-6">
          <Section id="record" title="Record a sale, dividend or fee">
            <Card className="p-5"><EntryForm options={held} today={new Date().toISOString().slice(0, 10)} /></Card>
          </Section>
          <Section id="import" title="From your broker">
            <Card className="space-y-3 p-5 text-sm">
              {brokerReady() ? <>
                <p className="text-muted">Adds the trades filled in your Alpaca account as ledger entries, each one once. Practice-account trades aren&apos;t real money; you can take them all out again.</p>
                <BrokerImport imported={imported} />
              </> : <p className="text-muted">Add your Alpaca keys in Vercel to import trades from it.</p>}
            </Card>
          </Section>
        </div>
      </div>
    </div>
  );
}
