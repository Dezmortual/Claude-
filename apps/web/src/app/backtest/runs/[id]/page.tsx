import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EquityChart } from "@/components/EquityChart";
import { RunActions } from "@/components/client/RunActions";
import { TradesChart } from "@/components/client/TradesChart";
import { Badge, Banner, Card, Label, Section, StatCard, cx } from "@/components/ui";
import { DataError, getRun } from "@/lib/data";
import { price } from "@/lib/format";
import type { Metrics } from "@/lib/indicators/strategy";
import { viewer } from "@/lib/session";

export const metadata = { title: "Backtest" };

const p = (x: number | null, d = 1) => (x === null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}%`);
const n = (x: number | null, d = 2) => (x === null ? "—" : x.toFixed(d));
const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const REASON = { rule: "Exit rule", stop: "Stop-loss", target: "Take-profit", time: "Time limit", end: "Still open at the end" } as const;

/** Plain words for the luck test, from the deflated Sharpe probability. */
function luckWords(luck: number | null, tries: number) {
  if (luck === null) return "Too few bars to judge.";
  const pct = Math.round(luck * 100);
  const after = tries > 1 ? ` after counting all ${tries.toLocaleString("en-US")} versions tried` : "";
  if (luck >= 0.95) return `${pct}% chance the edge is real${after}. That clears the usual bar, but it is still the past.`;
  if (luck >= 0.75) return `${pct}% chance the edge is real${after}. Promising, not convincing: test it on other assets and periods.`;
  return `${pct}% chance the edge is real${after}. This could easily be luck.`;
}

function MetricsGrid({ m }: { m: Metrics }) {
  const beat = m.totalReturn - m.buyHold;
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <li><StatCard label="Return" value={p(m.totalReturn)} tone={m.totalReturn >= 0 ? "up" : "down"}
        sub={`${beat >= 0 ? "Beat" : "Trailed"} buy and hold (${p(m.buyHold)}) by ${Math.abs(beat).toFixed(1)} points`} /></li>
      <li><StatCard label="Worst drop" value={p(m.maxDrawdown)} tone="down" sub={`Buy and hold: ${p(m.buyHoldDrawdown)}`} /></li>
      <li><StatCard label="Per year" value={p(m.cagr)} sub={m.cagr === null ? "Under half a year of trading" : `over ${m.years.toFixed(1)} years`} /></li>
      <li><StatCard label="Sharpe ratio" value={n(m.sharpe)} sub={`Sortino ${n(m.sortino)} · return per unit of risk`} /></li>
      <li><StatCard label="Trades" value={String(m.trades)} sub={m.trades < 30 ? "Under 30 trades: too few to lean on" : `${n(m.avgBars, 0)} bars held on average`} tone={m.trades < 30 ? "muted" : undefined} /></li>
      <li><StatCard label="Win rate" value={m.winRate === null ? "—" : `${m.winRate.toFixed(0)}%`} sub={`Average win ${p(m.avgWin)}, loss ${p(m.avgLoss)}`} /></li>
      <li><StatCard label="Profit factor" value={n(m.profitFactor)} sub={`Gains ÷ losses · expectancy ${p(m.expectancy, 2)} a trade`} /></li>
      <li><StatCard label="Time in the market" value={`${m.exposure.toFixed(0)}%`} sub={`Costs paid: ${m.costsPct.toFixed(2)}% of the start`} /></li>
    </ul>
  );
}

export default async function Run({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  const { id } = await params;
  if (!v.user) redirect(`/sign-in?next=/backtest/runs/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const run = await getRun(v, id).catch((e) => { if (e instanceof DataError && e.code === "not_found") notFound(); throw e; });
  const { metrics: m, luck, tries, note } = run.summary;
  const s = run.spec, sw = run.sweep;
  const label = `${run.assetName} ${run.timeframe === "1d" ? "daily" : "weekly"}, ${day(m.from)} to ${day(m.to)}`;
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Label><Link href="/backtest" className="hover:underline">Backtest lab</Link></Label>
        <h1 className="text-xl md:text-display">{run.name}</h1>
        <p className="text-muted">{label} · {s.side === "long" ? "long" : "short"} · costs {s.feePct}% fee + {s.slippagePct}% slippage each way
          {run.pinned && <Badge className="ml-2">Pinned</Badge>}</p>
        <RunActions id={run.id} pinned={run.pinned} />
      </div>
      {note && <Banner tone="info">{note}</Banner>}
      {m.trades === 0 && <Banner tone="warning">The entry rule never fired in this period, so there were no trades. Try looser settings, a longer period or another asset.</Banner>}

      <Section id="results" title={sw ? "Best settings over the whole period" : "Results"}>
        {sw && <p className="max-w-prose text-sm text-muted">These are the best of {sw.rows.length > 1 ? "every combination" : "the settings"} on the whole period, so they flatter. The walk-forward test below is the honest number.</p>}
        <MetricsGrid m={m} />
        <Card className={cx("space-y-1 p-5", luck !== null && luck < 0.75 && "border-warning")}>
          <h3 className="font-semibold">Luck test</h3>
          <p className="text-sm">{luckWords(luck, tries)}</p>
          <p className="text-xs text-muted">The deflated Sharpe ratio: how likely the Sharpe ratio is above zero given how many bars there were, how lumpy the
            returns were, and how many versions of this idea have been run ({tries.toLocaleString("en-US")} so far). Each new run or sweep adds to that count.</p>
        </Card>
        <Card className="p-4"><EquityChart title={`Growth of 1 on ${label}`} curves={[
          { label: "Strategy", points: run.equity.strategy, tone: "line" }, { label: "Buy and hold", points: run.equity.hold, tone: "hold", dashed: true }]} /></Card>
      </Section>

      {sw && (
        <Section id="walk-forward" title="Walk-forward test">
          <p className="max-w-prose text-sm text-muted">
            The first 40% of the period is history only. Then, three times over, the best settings on everything so far are picked and traded on the
            next stretch, which they never saw. Joined together, that is roughly what tuning this strategy would have earned.
          </p>
          {sw.outOfSample ? (
            <>
              <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <li><StatCard label="Unseen-data return" value={p(sw.outOfSample.metrics.totalReturn)} tone={sw.outOfSample.metrics.totalReturn >= 0 ? "up" : "down"}
                  sub={`Buy and hold: ${p(sw.outOfSample.metrics.buyHold)}`} /></li>
                <li><StatCard label="Worst drop" value={p(sw.outOfSample.metrics.maxDrawdown)} tone="down" /></li>
                <li><StatCard label="Sharpe ratio" value={n(sw.outOfSample.metrics.sharpe)} sub={`Whole period, best settings: ${n(m.sharpe)}`} /></li>
                <li><StatCard label="Trades" value={String(sw.outOfSample.metrics.trades)} /></li>
              </ul>
              <Card className="p-4"><EquityChart title="Walk-forward growth of 1" curves={[{ label: "Walk-forward", points: sw.outOfSample.equity, tone: "ind-1" }]} /></Card>
              <div tabIndex={0} role="region" aria-label="Walk-forward stretches" className="overflow-x-auto rounded-lg border bg-surface">
                <table className="w-full min-w-[560px] text-sm">
                  <caption className="sr-only">Each stretch: the settings chosen on the past, and how they did on the stretch after</caption>
                  <thead className="bg-surface-sunken text-2xs uppercase tracking-wide text-subtle"><tr>
                    <th scope="col" className="px-3 py-2 text-left">Traded</th><th scope="col" className="px-3 py-2 text-left">Settings picked before it</th>
                    <th scope="col" className="px-3 py-2 text-right">Sharpe when picked</th><th scope="col" className="px-3 py-2 text-right">Return after</th></tr></thead>
                  <tbody>{sw.folds.map((f) => (
                    <tr key={f.testFrom} className="border-t">
                      <td className="px-3 py-2">{day(f.testFrom)} to {day(f.testTo)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{Object.entries(f.params).map(([k, x]) => `${k} ${x}`).join(", ")}</td>
                      <td className="tabular px-3 py-2 text-right">{n(f.trainSharpe)}</td>
                      <td className={cx("tabular px-3 py-2 text-right font-semibold", f.test.totalReturn >= 0 ? "text-up" : "text-down")}>{p(f.test.totalReturn)}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            </>
          ) : <p className="text-sm text-muted">The period is too short to split into stretches. Use a longer period or daily bars.</p>}
          <h3 className="font-semibold">Every combination, best first</h3>
          <div tabIndex={0} role="region" aria-label="Sweep results" className="overflow-x-auto rounded-lg border bg-surface">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">The {sw.rows.length} best combinations on the whole period</caption>
              <thead className="bg-surface-sunken text-2xs uppercase tracking-wide text-subtle"><tr>
                <th scope="col" className="px-3 py-2 text-left">Settings</th><th scope="col" className="px-3 py-2 text-right">Return</th>
                <th scope="col" className="px-3 py-2 text-right">Worst drop</th><th scope="col" className="px-3 py-2 text-right">Sharpe</th><th scope="col" className="px-3 py-2 text-right">Trades</th></tr></thead>
              <tbody>{sw.rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{Object.entries(r.params).map(([k, x]) => `${k} ${x}`).join(", ")}</td>
                  <td className={cx("tabular px-3 py-2 text-right", r.metrics.totalReturn >= 0 ? "text-up" : "text-down")}>{p(r.metrics.totalReturn)}</td>
                  <td className="tabular px-3 py-2 text-right">{p(r.metrics.maxDrawdown)}</td>
                  <td className="tabular px-3 py-2 text-right">{n(r.metrics.sharpe)}</td>
                  <td className="tabular px-3 py-2 text-right">{r.metrics.trades}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </Section>
      )}

      <Section id="trades" title="Trades on the chart">
        <Card className="p-4"><TradesChart runId={run.id} trades={run.trades} label={`${run.assetName} prices with ${run.trades.length} trades marked; the table below lists them`} /></Card>
        {!run.trades.length ? null : (
          <div tabIndex={0} role="region" aria-label="Trades table" className="overflow-x-auto rounded-lg border bg-surface">
            <table className="w-full min-w-[600px] text-sm">
              <caption className="sr-only">Every trade, newest first{run.trades.length >= 300 ? " (the latest 300)" : ""}</caption>
              <thead className="bg-surface-sunken text-2xs uppercase tracking-wide text-subtle"><tr>
                <th scope="col" className="px-3 py-2 text-left">In</th><th scope="col" className="px-3 py-2 text-left">Out</th>
                <th scope="col" className="px-3 py-2 text-right">Bars</th><th scope="col" className="px-3 py-2 text-left">Why out</th><th scope="col" className="px-3 py-2 text-right">Result</th></tr></thead>
              <tbody>{[...run.trades].reverse().map((t) => (
                <tr key={t.entryTs} className="border-t">
                  <td className="px-3 py-2">{day(t.entryTs)} at {price(t.entryPrice)}</td>
                  <td className="px-3 py-2">{day(t.exitTs)} at {price(t.exitPrice)}</td>
                  <td className="tabular px-3 py-2 text-right">{t.bars}</td>
                  <td className="px-3 py-2">{REASON[t.reason]}</td>
                  <td className={cx("tabular px-3 py-2 text-right font-semibold", t.returnPct >= 0 ? "text-up" : "text-down")}>{p(t.returnPct, 2)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Section>

      <Section id="rules" title="What was tested">
        <Card className="grid gap-1 p-5 text-sm">
          <p><span className="font-semibold">Enter when </span><code className="break-all font-mono text-xs">{s.entry}</code></p>
          <p><span className="font-semibold">Exit when </span>{s.exit ? <code className="break-all font-mono text-xs">{s.exit}</code> : "the entry rule stops holding"}</p>
          <p><span className="font-semibold">Settings </span><code className="font-mono text-xs">{Object.entries(s.params).map(([k, x]) => `${k} = ${x}`).join(", ") || "none"}</code></p>
          <p className="text-muted">Stop {s.stopPct ? `${s.stopPct}%` : "none"} · target {s.takePct ? `${s.takePct}%` : "none"} · time limit {s.maxBars ? `${s.maxBars} bars` : "none"}.
            Rules are read at each close and traded at the next open; stops fill at their price, or at the open on a gap.</p>
        </Card>
      </Section>
    </div>
  );
}
