import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetHeader } from "@/components/AssetHeader";
import { ContributionCalc, ScenarioCalc } from "@/components/client/Calculators";
import { PriceChart } from "@/components/client/PriceChart";
import { LedgerTable } from "@/components/LedgerTable";
import { TradeTicket } from "@/components/client/TradeTicket";
import { Suspense } from "react";
import { Pulse } from "@/components/client/Pulse";
import { OutlookCards } from "@/components/OutlookCards";
import { MoodSummary, NewsList } from "@/components/News";
import { PredictionList } from "@/components/Predictions";
import { ScenarioChart } from "@/components/ScenarioChart";
import { Banner, Card, Label, Paywall, PriceChange, Section, StatCard } from "@/components/ui";
import { assetPredictions, forecastLedger, listIndicators, listNews, newsMood, assetBars, assetForecast, assetScenarios, assetSignals, assetSummary, getAsset, relatedAssets, type PathRow } from "@/lib/data";
import { compact, dateTime, pct, price as fmtPrice } from "@/lib/format";
import { viewer } from "@/lib/session";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const a = getAsset((await params).slug);
  return a ? { title: `${a.name} forecast`, description: `${a.name} (${a.ticker}) next-day, weekly and monthly forecast ranges, technical signals and long-term scenarios.` } : {};
}

function RangeTable({ rows, unit, caption, first }: { rows: PathRow[]; unit: string; caption: string; first: string }) {
  return (
    <div tabIndex={0} role="region" aria-label="Scrollable table" className="relative overflow-x-auto rounded-lg border bg-surface">
      <table className="w-full text-sm">
        <caption className="px-4 pt-4 text-left text-sm font-semibold">{caption}</caption>
        <thead>
          <tr className="text-2xs uppercase tracking-wide text-subtle">
            <th scope="col" className="px-4 py-2 text-left">{first}</th>
            <th scope="col" className="px-4 py-2 text-right">Low</th>
            <th scope="col" className="px-4 py-2 text-right">Midpoint</th>
            <th scope="col" className="px-4 py-2 text-right">High</th>
            <th scope="col" className="px-4 py-2 text-right">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.periodStart} className="border-t">
              <th scope="row" className="whitespace-nowrap px-4 py-2 text-left font-normal">{r.label}</th>
              <td className="tabular px-4 py-2 text-right text-muted">{fmtPrice(r.low, unit)}</td>
              <td className="tabular px-4 py-2 text-right font-semibold">{fmtPrice(r.mid, unit)}</td>
              <td className="tabular px-4 py-2 text-right text-muted">{fmtPrice(r.high, unit)}</td>
              <td className="px-4 py-2 text-right"><PriceChange value={r.changePct} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AssetForecast({ params }: P) {
  const { slug } = await params;
  const v = await viewer();
  if (!getAsset(slug)) notFound();
  const { asset, quote, metrics, locked, unlockPlan } = await assetSummary(v, slug);
  const forecast = locked ? null : await assetForecast(v, slug);
  const sc = await assetScenarios(slug);
  const chart = await assetBars(v, slug, "3m", 250);
  const pulse = await assetSignals(v, slug);
  const ledger = v.user && !locked ? await forecastLedger(v, { asset: slug }) : null;
  const unit = asset.quoteUnit;
  const session = ["forex", "stocks", "commodities", "indices", "etfs", "bonds"].includes(asset.market);
  const step = session ? "session" : "day";
  const upgrade = `/pricing?plan=${unlockPlan.code}`;
  const st = forecast?.points.filter((p) => p.kind === "forecast") ?? [];
  const tz = v.user?.timezone ?? "UTC";
  const H_LABEL = { "1d": session ? "Next session" : "Next day", "7d": session ? "5 sessions" : "7 days", "1m": session ? "21 sessions" : "1 month" } as const;

  return (
    <div className="space-y-12">
      <AssetHeader asset={asset} quote={quote} metrics={metrics} viewer={v} current="forecast" title={`${asset.name} price forecast`} />

      {quote.status === "diverged" && (
        <Banner tone="warning">Our two price sources disagree by {pct(quote.crosscheckSpreadPct)} right now. Forecasts use the primary source; treat the latest move with care.</Banner>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="From all-time high" value={pct(metrics.ath.pctFrom, 1)} tone={metrics.ath.pctFrom < 0 ? "down" : "up"}
          sub={`High ${fmtPrice(metrics.ath.price, unit)} on ${new Date(metrics.ath.date).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}`} />
        <StatCard label="90-day range" value={<span className="text-lg">{fmtPrice(metrics.range.d90.lo, unit)} – {fmtPrice(metrics.range.d90.hi, unit)}</span>}
          sub={`20-day: ${fmtPrice(metrics.range.d20.lo, unit)} – ${fmtPrice(metrics.range.d20.hi, unit)}`} />
        <StatCard label="Volatility, 30 days" value={`${metrics.volatilityPct.toFixed(0)}%`} sub={`${metrics.volatilityLabel[0].toUpperCase()}${metrics.volatilityLabel.slice(1)} for this market, annualised`} />
        {asset.meta.maxSupply ? (
          <StatCard label="Maximum supply" value={compact(asset.meta.maxSupply)} sub={`${asset.ticker} that can ever exist`} />
        ) : (
          <StatCard label="Trend" value={metrics.maCross === "golden" ? "Above" : "Below"} tone={metrics.maCross === "golden" ? "up" : "down"}
            sub={`50-day average vs 200-day; price ${pct(metrics.pctFromMa200, 1)} from the 200-day`} />
        )}
      </div>

      <Section id="chart" title="Price and forecast range">
        <Card className="p-4 md:p-6">
          <PriceChart slug={slug} name={asset.name} unit={unit} initial={chart.bars} initialWarmup={chart.warmup} indicators={v.user ? await listIndicators(v) : undefined} forecast={forecast?.points ?? null} intradayLocked={locked} />
        </Card>
      </Section>

      <Section id="short-term" title="Short-term forecast">
        {forecast ? (
          <>
            <p className="text-sm text-subtle">From the {dateTime(forecast.runAt, tz)} run, starting at {fmtPrice(forecast.basePrice, unit)}.</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {st.map((p) => (
                <Card key={p.horizon} className="space-y-2 p-4">
                  <Label>{H_LABEL[p.horizon as keyof typeof H_LABEL]}</Label>
                  <div className="tabular text-xl">{fmtPrice(p.mid, unit)}</div>
                  <PriceChange value={p.changePct} />
                  <p className="text-xs text-muted">80% range {fmtPrice(p.low, unit)} – {fmtPrice(p.high, unit)}</p>
                  <p className="text-xs text-muted">Rose {Math.round(p.pUp! * 100)}% of the time from a similar setup</p>
                </Card>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <RangeTable rows={forecast.paths.day} unit={unit} caption={`Next 14 ${step}s`} first={session ? "Session" : "Day"} />
              <div className="space-y-4">
                <RangeTable rows={forecast.paths.week} unit={unit} caption="Next 4 weeks" first="Week" />
                <Card className="space-y-3 p-4">
                  <h3 className="text-base font-semibold">What would that mean for me?</h3>
                  <ScenarioCalc base={forecast.basePrice} ranges={st.map((p) => ({ key: p.horizon, label: H_LABEL[p.horizon as keyof typeof H_LABEL], low: p.low, mid: p.mid, high: p.high }))} />
                </Card>
              </div>
            </div>
            <RangeTable rows={forecast.paths.month} unit={unit} caption="Next 12 months (widening range)" first="Month" />
          </>
        ) : (
          <Paywall planName={unlockPlan.name} href={upgrade}>
            Short-term forecasts for {asset.name} are on the <b className="text-fg">{unlockPlan.name}</b> plan. Long-term scenarios and the daily signal stay free.
          </Paywall>
        )}
      </Section>

      {v.user && (
        <Section id="trade" title={`Trade ${asset.name}`} action={<Link prefetch={false} href="/trade" className="text-sm font-semibold text-accent hover:underline">Your account</Link>}>
          <Card className="max-w-xl p-5"><Suspense fallback={<p className="text-sm text-muted">Loading the order ticket…</p>}><TradeTicket slug={slug} /></Suspense></Card>
        </Section>
      )}

      {v.user && asset.market !== "bonds" && await (async () => {
        const [items, mood] = await Promise.all([listNews(v, { slug, limit: 6 }), newsMood(v, slug)]);
        return (
          <Section id="news" title={`${asset.name} in the news`}
            action={<Link prefetch={false} href={`/news?slug=${slug}`} className="text-sm font-semibold text-accent hover:underline">All {asset.name} news</Link>}>
            <MoodSummary day={mood.day} week={mood.week} what={asset.name} />
            {items.length ? <NewsList items={items} tz={v.user!.timezone} showAssets={false} />
              : <p className="text-sm text-muted">No stories about {asset.name} in the last 45 days.</p>}
          </Section>
        );
      })()}

      {v.user && await (async () => {
        const odds = await assetPredictions(v, slug);
        return odds.length ? (
          <Section id="predictions" title={`What prediction markets say about ${asset.name}`}
            action={<Link prefetch={false} href={`/predictions?q=${encodeURIComponent(asset.name)}`} className="text-sm font-semibold text-accent hover:underline">More</Link>}>
            <PredictionList items={odds} />
            <p className="text-xs text-muted">Polymarket traders&apos; prices for &ldquo;yes&rdquo;: the crowd&apos;s odds, not ours.</p>
          </Section>
        ) : null;
      })()}

      {ledger && (
        <Section id="record" title="This asset's forecast record"
          action={<Link prefetch={false} href={`/track-record/ledger?asset=${slug}`} className="text-sm font-semibold text-accent hover:underline">All {ledger.total.toLocaleString("en-US")} forecasts</Link>}>
          {!ledger.rows.length ? (
            <p className="text-sm text-muted">No forecasts published for {asset.name} yet. Live assets get new ones every hour.</p>
          ) : (
            <>
              <p className="max-w-prose text-sm text-muted">
                The latest forecasts for {asset.name}, as they were published. {ledger.scored
                  ? `Of ${ledger.scored.toLocaleString("en-US")} scored so far, ${Math.round((ledger.hits / ledger.scored) * 100)}% got the direction right and ${Math.round((ledger.inside / ledger.scored) * 100)}% landed inside the range.`
                  : "None has reached its date yet."}
              </p>
              <LedgerTable rows={ledger.rows.slice(0, 9)} tz={v.user!.timezone} caption={`Latest forecasts for ${asset.name}`} showAsset={false} />
            </>
          )}
        </Section>
      )}

      <Section id="signals" title="Technical pulse" action={<Link prefetch={false} href={`/assets/${slug}/signals`} className="text-sm font-semibold text-accent hover:underline">All signals</Link>}>
        <p className="max-w-prose text-sm text-muted">Ten moving averages and ten oscillators, each read as buy, neutral or sell on closed bars only. The verdict is the balance of the twenty.</p>
        <Pulse cards={pulse} upgradeHref={upgrade} tz={v.user?.timezone ?? "UTC"} />
      </Section>

      <Section id="long-term" title="Long-term scenarios">
        <p className="max-w-prose text-sm text-muted">{sc.assumptions.note}</p>
        <OutlookCards cards={sc.cards} unit={unit} name={asset.name} />
        <p className="max-w-prose text-xs text-muted">
          Past moves come from overlapping windows of the stored daily prices, so they lean heavily on the same few years. They show how
          wide the real outcomes have been, not what comes next.
        </p>
        <Card className="p-4 md:p-6 text-muted"><ScenarioChart s={sc} now={quote.price} unit={unit} name={asset.name} /></Card>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div tabIndex={0} role="region" aria-label="Scrollable table" className="relative overflow-x-auto rounded-lg border bg-surface">
            <table className="w-full text-sm">
              <caption className="px-4 pt-4 text-left text-sm font-semibold">By year</caption>
              <thead><tr className="text-2xs uppercase tracking-wide text-subtle">
                <th scope="col" className="px-4 py-2 text-left">Year</th><th scope="col" className="px-4 py-2 text-right">Bear</th>
                <th scope="col" className="px-4 py-2 text-right">Base</th><th scope="col" className="px-4 py-2 text-right">Bull</th>
                <th scope="col" className="px-4 py-2 text-right">Base vs today</th></tr></thead>
              <tbody>
                {sc.years.map((y) => (
                  <tr key={y.year} className="border-t">
                    <th scope="row" className="px-4 py-2 text-left font-normal">{y.year}</th>
                    <td className="tabular px-4 py-2 text-right text-down">{fmtPrice(y.bear, unit)}</td>
                    <td className="tabular px-4 py-2 text-right font-semibold">{fmtPrice(y.base, unit)}</td>
                    <td className="tabular px-4 py-2 text-right text-up">{fmtPrice(y.bull, unit)}</td>
                    <td className="px-4 py-2 text-right"><PriceChange value={y.baseRoiPct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-4">
            <Card className="space-y-2 p-4">
              <h3 className="text-base font-semibold">The assumptions</h3>
              <ul className="grid gap-1 text-sm">
                <li><span className="text-down">Bear</span>: {pct(sc.assumptions.bearCagrPct, 0)} a year</li>
                <li>Base: {pct(sc.assumptions.baseCagrPct, 0)} a year</li>
                <li><span className="text-up">Bull</span>: {pct(sc.assumptions.bullCagrPct, 0)} a year</li>
              </ul>
              <p className="text-xs text-muted">Change them and the picture changes completely. That is the point: these are for planning, not for timing.</p>
            </Card>
            <Card className="space-y-3 p-4">
              <h3 className="text-base font-semibold">Investing a fixed amount each month</h3>
              <ContributionCalc cagr={{ bear: sc.assumptions.bearCagrPct / 100, base: sc.assumptions.baseCagrPct / 100, bull: sc.assumptions.bullCagrPct / 100 }} />
            </Card>
          </div>
        </div>
      </Section>

      <Section id="method" title="How this is calculated">
        <ol className="grid max-w-prose list-decimal gap-2 pl-5 text-sm text-muted">
          <li>Prices come from a primary source and are compared with a second one; a gap beyond our threshold is flagged on this page.</li>
          <li>For each horizon we look at the last two years of {step}-by-{step} history, keep the moments when {asset.name} was in the same trend state as today (above or below its 50-day average) and measure what happened next.</li>
          <li>The midpoint is the median of those outcomes; the range covers the middle 80% of them. The signal is the share that ended higher.</li>
          <li>Technical signals use only bars that have closed, so a forming bar never changes a verdict.</li>
          <li>Long-term scenarios are fixed growth rates, stated above, applied to today&apos;s price.</li>
          <li>Every forecast is stored when published and scored on its target date. Results appear on the <Link href="/track-record" className="text-accent underline">track record</Link>.</li>
        </ol>
      </Section>

      <Section id="faq" title="Questions">
        <div className="grid gap-2">
          {[
            [`Will ${asset.name} go up tomorrow?`, forecast ? `Nobody knows. From setups like today's, it closed higher ${Math.round(st[0].pUp! * 100)}% of the time over the next ${step}. The range above shows how far it usually moved.` : "The short-term numbers are on paid plans; the daily signal above is free."],
            ["Should I buy?", "We can't tell you that. This page describes how prices behaved in the past; it doesn't know your goals, your timeline or your risk."],
            ["Why is the 12-month range so wide?", "Uncertainty grows with time. We widen the range with the square root of the horizon, which is how the spread of random price paths grows."],
            ["How often does this update?", "Prices are checked every minute, signals on each closed bar, forecasts every hour."],
          ].map(([q, a]) => (
            <details key={q} className="rounded-md border bg-surface p-4">
              <summary className="cursor-pointer font-semibold">{q}</summary>
              <p className="mt-2 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section id="related" title={`More ${asset.market === "crypto" ? "crypto" : "in this market"}`}>
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {relatedAssets(slug).map((a) => (
            <li key={a.slug}><Link prefetch={false} href={`/assets/${a.slug}`} className="flex min-h-tap items-center justify-between rounded-md border bg-surface px-3 py-2 text-sm font-semibold hover:bg-surface-sunken">
              <span className="truncate">{a.name}</span><span className="font-mono text-xs text-subtle">{a.ticker}</span></Link></li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
