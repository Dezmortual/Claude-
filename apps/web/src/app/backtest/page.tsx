import Link from "next/link";
import { redirect } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { BacktestLab } from "@/components/client/BacktestLab";
import { RunList } from "@/components/client/RunList";
import { Banner, Card, EmptyState, Label, Section } from "@/components/ui";
import { DataError, getRun, getStrategy, listAssets, listIndicators, listRuns, listStrategies, MAX_RUNS, type SavedStrategy, type StrategySpecInput } from "@/lib/data";
import { viewer } from "@/lib/session";

export const metadata = { title: "Backtest lab" };

export default async function Backtest({ searchParams }: { searchParams: Promise<{ strategy?: string; run?: string }> }) {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/backtest");
  const sp = await searchParams;
  const uuid = /^[0-9a-f-]{36}$/i;
  let strategy: SavedStrategy | null = null, initial: StrategySpecInput | undefined, problem: string | null = null;
  try {
    if (sp.strategy && uuid.test(sp.strategy)) { strategy = await getStrategy(v, sp.strategy); initial = strategy.spec; }
    else if (sp.run && uuid.test(sp.run)) {
      const r = await getRun(v, sp.run);
      const { strategyId: _s, ranges: _r, ...spec } = r.spec;
      initial = spec;
    }
  } catch (e) { if (e instanceof DataError) problem = e.message; else throw e; }
  const [runs, strategies, indicators] = await Promise.all([listRuns(v), listStrategies(v), listIndicators(v)]);
  const assets = listAssets().filter((a) => a.market !== "bonds").map((a) => ({ slug: a.slug, name: a.name, market: a.market }));
  return (
    <div className="space-y-12">
      <div className="space-y-3">
        <Label>Backtest lab</Label>
        <h1 className="text-xl md:text-display">Test a strategy on past prices</h1>
        <p className="max-w-prose text-muted">
          Pick a ready-made idea, one of your indicators, or write your own rules, then see how it would have traded: with costs, no
          peeking at the next bar, and a luck test that counts every version you tried. A good past result is a reason to look closer, not a promise.
        </p>
      </div>
      {problem && <Banner tone="warning">{problem}</Banner>}

      <Section id="lab" title={strategy ? strategy.name : "New backtest"}>
        <BacktestLab key={`${sp.strategy ?? ""}${sp.run ?? ""}`} assets={assets} indicators={indicators.map((i) => ({ id: i.id, name: i.name, buyRule: i.buyRule, sellRule: i.sellRule }))}
          initial={initial} strategy={strategy && { id: strategy.id, name: strategy.name, notes: strategy.notes, version: strategy.version }} />
        {strategy && strategy.versions.length > 1 && (
          <details className="rounded-lg border bg-surface p-4 text-sm">
            <summary className="cursor-pointer font-semibold">Version history ({strategy.versions.length})</summary>
            <ol className="mt-3 grid gap-2">
              {strategy.versions.map((x) => (
                <li key={x.version} className="grid gap-1 border-t pt-2">
                  <span className="font-semibold">Version {x.version} · {new Date(x.createdAt).toLocaleString("en-GB", { timeZone: v.user!.timezone, dateStyle: "medium", timeStyle: "short" })}</span>
                  <code className="break-all font-mono text-xs text-muted">In: {x.spec.entry}{x.spec.exit ? ` · Out: ${x.spec.exit}` : ""} · {JSON.stringify(x.spec.params)}</code>
                </li>
              ))}
            </ol>
          </details>
        )}
      </Section>

      <Section id="strategies" title="Saved strategies">
        {!strategies.length ? <Card><EmptyState title="None saved yet">Save a strategy from the form above to keep its rules and settings, with every edit kept as a version.</EmptyState></Card> : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {strategies.map((s) => (
              <li key={s.id}><Card className="grid h-full gap-1 p-4">
                <Link href={`/backtest?strategy=${s.id}`} className="font-semibold hover:underline">{s.name}</Link>
                <span className="text-xs text-muted">Version {s.version} · {s.spec.side === "long" ? "Long" : "Short"} · {s.spec.timeframe === "1d" ? "daily" : "weekly"}</span>
                {s.notes && <p className="text-sm text-muted">{s.notes}</p>}
              </Card></li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="runs" title="Past runs">
        {!runs.length ? <Card><EmptyState icon={<FlaskConical aria-hidden className="h-6 w-6" />} title="No backtests yet">Run one from the form above.</EmptyState></Card>
          : <RunList runs={runs} tz={v.user.timezone} />}
        <p className="text-xs text-muted">Your newest {MAX_RUNS} runs are kept; pin one on its page to keep it for good.</p>
      </Section>
    </div>
  );
}
