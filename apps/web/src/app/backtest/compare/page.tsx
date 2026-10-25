import Link from "next/link";
import { redirect } from "next/navigation";
import { EquityChart, type Curve } from "@/components/EquityChart";
import { Banner, Card, Label, Section, cx } from "@/components/ui";
import { DataError, compareRuns, type BacktestRun } from "@/lib/data";
import { viewer } from "@/lib/session";

export const metadata = { title: "Compare backtests" };
const TONES: Curve["tone"][] = ["line", "ind-1", "ind-2", "ind-3"];
const p = (x: number | null) => (x === null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}%`);

export default async function Compare({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const v = await viewer();
  const ids = ((await searchParams).ids ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (!v.user) redirect(`/sign-in?next=/backtest/compare?ids=${ids.join(",")}`);
  let runs: BacktestRun[] = [], problem: string | null = null;
  try { runs = await compareRuns(v, ids); } catch (e) { if (e instanceof DataError) problem = e.message; else throw e; }
  const rows: [string, (r: BacktestRun) => string, ((r: BacktestRun) => boolean)?][] = [
    ["Period", (r) => `${new Date(r.summary.metrics.from).toISOString().slice(0, 10)} to ${new Date(r.summary.metrics.to).toISOString().slice(0, 10)}`],
    ["Return", (r) => p(r.summary.metrics.totalReturn), (r) => r.summary.metrics.totalReturn >= 0],
    ["Buy and hold", (r) => p(r.summary.metrics.buyHold)],
    ["Worst drop", (r) => p(r.summary.metrics.maxDrawdown)],
    ["Sharpe ratio", (r) => r.summary.metrics.sharpe?.toFixed(2) ?? "—"],
    ["Trades", (r) => String(r.summary.metrics.trades)],
    ["Win rate", (r) => (r.summary.metrics.winRate === null ? "—" : `${r.summary.metrics.winRate.toFixed(0)}%`)],
    ["Luck test", (r) => (r.summary.luck === null ? "—" : `${Math.round(r.summary.luck * 100)}%`)],
  ];
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Label><Link href="/backtest#runs" className="hover:underline">Backtest lab</Link></Label>
        <h1 className="text-xl md:text-display">Compare backtests</h1>
        <p className="max-w-prose text-muted">Each curve starts at 1 on its own first day, on one shared time axis.</p>
      </div>
      {problem ? <Banner tone="warning">{problem}</Banner> : (
        <>
          <Card className="p-4"><EquityChart title="Growth of 1, compared" curves={runs.map((r, i) => ({ label: r.name, points: r.equity.strategy, tone: TONES[i] }))} /></Card>
          <Section id="table" title="Side by side">
            <div tabIndex={0} role="region" aria-label="Comparison table" className="overflow-x-auto rounded-lg border bg-surface">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">The compared runs' results side by side</caption>
                <thead className="bg-surface-sunken text-xs"><tr><th scope="col" className="px-3 py-2 text-left"><span className="sr-only">Measure</span></th>
                  {runs.map((r) => <th key={r.id} scope="col" className="px-3 py-2 text-left"><Link href={`/backtest/runs/${r.id}`} className="font-semibold hover:underline">{r.name}</Link></th>)}</tr></thead>
                <tbody>{rows.map(([k, f, good]) => (
                  <tr key={k} className="border-t"><th scope="row" className="px-3 py-2 text-left font-normal text-muted">{k}</th>
                    {runs.map((r) => <td key={r.id} className={cx("tabular px-3 py-2", good && (good(r) ? "text-up" : "text-down"))}>{f(r)}</td>)}</tr>))}</tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
