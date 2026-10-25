import Link from "next/link";
import { redirect } from "next/navigation";
import { PortfolioNav } from "@/components/PortfolioNav";
import { DeleteLimit, LimitForm, TargetsForm } from "@/components/client/PortfolioForms";
import { Badge, Card, EmptyState, Label, Section, StatCard, cx } from "@/components/ui";
import { LIMIT_MARKETS, getAsset, limitStatus, portfolio, portfolioRisk, rebalancePlan, targets } from "@/lib/data";
import { price } from "@/lib/format";
import { viewer } from "@/lib/session";

export const metadata = { title: "Portfolio risk" };
const p = (x: number | null, d = 1) => (x === null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}%`);
const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const qty = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 6 });
const STATE = { ok: ["Within", "up"], near: ["Close to it", "warning"], over: ["Over", "down"] } as const;

export default async function Risk() {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/portfolio/risk");
  const [r, plan, t, limits, pf] = await Promise.all([portfolioRisk(v), rebalancePlan(v), targets(v), limitStatus(v), portfolio(v)]);
  const opts = pf.holdableAssets.map((a) => ({ slug: a.slug, name: a.name }));
  const held = pf.positions.map((x) => ({ slug: x.asset.slug, name: x.asset.name }));
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Label>Portfolio</Label>
        <h1 className="text-xl md:text-display">Risk and rebalancing</h1>
        <PortfolioNav at="/portfolio/risk" />
        <p className="max-w-prose text-muted">How your mix of holdings today would have swung over the last year, what a fall in one market would cost, and where it could be in a year.
          These describe the past and plausible ranges, not what will happen.</p>
      </div>
      {!r ? <Card><EmptyState title="Nothing to measure yet">Add a holding first.</EmptyState></Card> : (
        <>
          <Section id="risk" title="Swings">
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <li><StatCard label="Volatility" value={`${r.risk.vol.toFixed(0)}% a year`} sub="Typical yearly swing, up or down" /></li>
              <li><StatCard label="A bad day (95%)" value={`−${price((r.risk.var95 / 100) * r.total)}`} tone="down" sub={`1 day in 20 loses at least ${r.risk.var95.toFixed(1)}%`} /></li>
              <li><StatCard label="The worst days" value={`−${price((r.risk.cvar95 / 100) * r.total)}`} tone="down" sub={`Average of the worst 1 in 20: ${r.risk.cvar95.toFixed(1)}%`} /></li>
              <li><StatCard label={`Beta to ${r.bench.name}`} value={r.risk.beta === null ? "—" : r.risk.beta.toFixed(2)} sub="1 moves with it; 0 ignores it" /></li>
            </ul>
            <p className="text-xs text-muted">Over the last {r.risk.days} days with today&apos;s weights. Worst single day: {p(r.risk.worstDay.pct)} on {day(r.risk.worstDay.ts)}.
              {" "}{r.risk.worstStretch.map((w) => `Worst ${w.days} days: ${p(w.pct)} (${day(w.from)} to ${day(w.to)})`).join(". ")}.</p>
          </Section>

          <Section id="drivers" title="What drives the risk">
            <div tabIndex={0} role="region" aria-label="Risk by holding table" className="overflow-x-auto rounded-lg border bg-surface">
              <table className="w-full min-w-[420px] text-sm">
                <caption className="sr-only">Each holding's share of the value and of the swings</caption>
                <thead className="bg-surface-sunken text-2xs uppercase tracking-wide text-subtle"><tr><th scope="col" className="px-3 py-2 text-left">Holding</th>
                  <th scope="col" className="px-3 py-2 text-right">Share of value</th><th scope="col" className="px-3 py-2 text-right">Share of risk</th></tr></thead>
                <tbody>{r.risk.contributions.map((c) => (
                  <tr key={c.slug} className="border-t"><td className="px-3 py-2">{getAsset(c.slug)?.name}</td>
                    <td className="tabular px-3 py-2 text-right">{(c.weight * 100).toFixed(1)}%</td>
                    <td className={cx("tabular px-3 py-2 text-right", c.share > c.weight + 0.05 && "font-semibold text-down")}>{(c.share * 100).toFixed(1)}%</td></tr>
                ))}</tbody>
              </table>
            </div>
            {r.risk.correlation.slugs.length > 1 && (
              <div tabIndex={0} role="region" aria-label="How holdings move together table" className="overflow-x-auto rounded-lg border bg-surface">
                <table className="w-full min-w-[480px] text-xs">
                  <caption className="px-3 pt-3 text-left text-sm font-semibold">How they move together (1 = in step, 0 = unrelated, −1 = opposite)</caption>
                  <thead><tr><th scope="col" className="px-2 py-2"><span className="sr-only">Holding</span></th>
                    {r.risk.correlation.slugs.map((s) => <th key={s} scope="col" className="px-2 py-2 text-right">{getAsset(s)?.ticker}</th>)}</tr></thead>
                  <tbody>{r.risk.correlation.slugs.map((a, i) => (
                    <tr key={a} className="border-t"><th scope="row" className="px-2 py-2 text-left">{getAsset(a)?.ticker}</th>
                      {r.risk.correlation.m[i].map((x, j) => <td key={j} className={cx("tabular px-2 py-2 text-right", i !== j && x > 0.7 && "font-semibold text-warning")}>{x.toFixed(2)}</td>)}</tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Section>

          <Section id="stress" title="If a market falls">
            <ul className="grid gap-2 md:grid-cols-2">
              {r.shocks.map((s) => (
                <li key={s.label}><Card className="flex items-center justify-between gap-3 p-4"><span>{s.label}</span>
                  <span className="tabular font-semibold text-down">{price(s.change)} ({p(s.pct)})</span></Card></li>
              ))}
            </ul>
          </Section>

          <Section id="simulation" title="Where it could be">
            {!r.sim ? <p className="text-sm text-muted">Needs at least 30 days of prices.</p> : (
              <>
                <div tabIndex={0} role="region" aria-label="Simulation table" className="overflow-x-auto rounded-lg border bg-surface">
                  <table className="w-full min-w-[560px] text-sm">
                    <caption className="sr-only">Value after each horizon in 2,000 replays of the last year</caption>
                    <thead className="bg-surface-sunken text-2xs uppercase tracking-wide text-subtle"><tr><th scope="col" className="px-3 py-2 text-left">After</th>
                      <th scope="col" className="px-3 py-2 text-right">Bad (1 in 20)</th><th scope="col" className="px-3 py-2 text-right">Middle</th>
                      <th scope="col" className="px-3 py-2 text-right">Good (1 in 20)</th><th scope="col" className="px-3 py-2 text-right">Chance of a loss</th></tr></thead>
                    <tbody>{r.sim.map((h) => (
                      <tr key={h.days} className="border-t"><th scope="row" className="px-3 py-2 text-left font-normal">{h.days === 365 ? "1 year" : `${h.days} days`}</th>
                        <td className="tabular px-3 py-2 text-right text-down">{price(h.p5 * r.total)}</td>
                        <td className="tabular px-3 py-2 text-right font-semibold">{price(h.p50 * r.total)}</td>
                        <td className="tabular px-3 py-2 text-right text-up">{price(h.p95 * r.total)}</td>
                        <td className="tabular px-3 py-2 text-right">{Math.round(h.lossChance * 100)}%</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className="text-xs text-muted">2,000 replays of the last year&apos;s daily moves for today&apos;s mix, shuffled in 5-day blocks. If next year is calmer or wilder than the last, so is the truth.</p>
              </>
            )}
          </Section>
        </>
      )}

      <Section id="rebalance" title="Rebalance to targets">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5"><TargetsForm options={opts} initial={t} current={pf.positions.map((x) => ({ slug: x.asset.slug, weight: x.weight }))} /></Card>
          {plan ? (
            <Card className="grid gap-3 p-5">
              <h3 className="font-semibold">Trades to get there</h3>
              <ul className="grid gap-2 text-sm">
                {plan.trades.filter((x) => Math.abs(x.trade) >= 0.01).map((x) => (
                  <li key={x.slug} className="flex flex-wrap justify-between gap-2">
                    <span><span className={x.trade > 0 ? "font-semibold text-up" : "font-semibold text-down"}>{x.trade > 0 ? "Buy" : "Sell"}</span> {x.name}</span>
                    <span className="tabular">{price(Math.abs(x.trade))}{x.qty !== null && <span className="text-muted"> · {qty(Math.abs(x.qty))} {x.unit}</span>}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">Moves {price(plan.turnover)} ({plan.turnoverPct.toFixed(1)}% of the portfolio), before costs and taxes. Nothing is traded from here: use each asset&apos;s <Link href="/trade" className="underline">order ticket</Link> if you want to.</p>
            </Card>
          ) : <Card className="p-5 text-sm text-muted">Set target weights to see the trades that would get you there.</Card>}
        </div>
      </Section>

      <Section id="limits" title="Limits">
        <Card className="p-5"><LimitForm holdings={held} markets={LIMIT_MARKETS} /></Card>
        {limits.length > 0 && (
          <ul className="grid gap-2">
            {limits.map((l) => (
              <li key={l.id}><Card className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1"><p className="font-semibold">{l.label}</p>
                  <p className="text-xs text-muted">{l.worst ? `${l.worst.name}: ${l.worst.pct.toFixed(1)}% now` : "Nothing it applies to yet"}</p></div>
                <Badge tone={STATE[l.state][1]}>{STATE[l.state][0]}</Badge>
                <DeleteLimit id={l.id} label={l.label} />
              </Card></li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
