import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { ForecastTable } from "@/components/ForecastTable";
import { TabSwitch } from "@/components/HubControls";
import { Sparkline } from "@/components/Sparkline";
import { AssetMark, Badge, ButtonLink, Card, DemoNote, EmptyState, PriceChange, Section, SignalBadge, cx } from "@/components/ui";
import { dashboard, getWatchlist, listForecasts, listMarkets, watchlistSlugs } from "@/lib/data";
import { dateTime, pct, price as fmtPrice } from "@/lib/format";
import { parseForecastQuery, type SP } from "@/lib/query";
import { viewer } from "@/lib/session";

export const metadata = { title: { absolute: "Proofcast: forecasts with the misses left in" } };

function greeting(tz: string) {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: tz, hour: "2-digit", hour12: false }));
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const v = await viewer();
  const sp = await searchParams;
  const q = parseForecastQuery(sp, { perPage: 10 });
  const tz = v.user?.timezone ?? "UTC";
  const [d, crypto, watch, starred] = await Promise.all([
    dashboard(v),
    listForecasts(v, { ...q, market: "crypto", perPage: 10, page: 1 }),
    v.user ? getWatchlist(v) : Promise.resolve([]),
    watchlistSlugs(v),
  ]);
  const starMode = !v.user ? "guest" : v.plan.watchlistAlerts ? "ok" : "no-plan";
  const first = v.user?.name.split(" ")[0];
  const kpis: { label: string; value: string; note: string; tone?: "up" | "down" }[] = [
    { label: "Live assets", value: String(d.counts.live), note: `across ${listMarkets(v).length} markets` },
    { label: "Buy signals", value: String(d.counts.bullish), note: "7-day outlook", tone: "up" },
    { label: "Sell signals", value: String(d.counts.bearish), note: "7-day outlook", tone: "down" },
    d.record.hitRate == null
      ? { label: "Track record", value: "Soon", note: "first scores land a day after publishing" }
      : { label: "Direction right", value: pct(d.record.hitRate * 100, 0).replace("+", ""), note: `${d.record.scored.toLocaleString("en-US")} forecasts scored` },
  ];

  return (
    <div className="space-y-12">
      <section aria-labelledby="dash-h" className="relative overflow-hidden rounded-xl bg-gradient-to-br from-panel to-panel-2 p-6 text-on-panel shadow-premium md:p-10">
        {/* A faint forecast fan and grid, the logo's motif. Decorative only. */}
        <svg aria-hidden viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" className="pointer-events-none absolute inset-0 h-full w-full text-on-panel">
          <defs>
            <pattern id="dash-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M20 0H0V20" fill="none" stroke="currentColor" strokeOpacity={0.06} strokeWidth={0.5} />
            </pattern>
          </defs>
          <rect x="200" width="200" height="200" fill="url(#dash-grid)" />
          <path d="M150 170 C230 150 290 110 400 40 L400 150 C300 160 230 168 150 170Z" fill="currentColor" fillOpacity={0.05} />
          <path d="M150 170 C230 158 300 120 400 85" fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1.2} className="text-highlight" />
          <circle cx="150" cy="170" r="3" className="fill-highlight" />
        </svg>

        <div className="relative space-y-8">
          <div className="space-y-2">
            <p className="text-2xs uppercase tracking-wide text-on-panel-muted">{greeting(tz)}{first ? `, ${first}` : ""}</p>
            <h1 id="dash-h" className="text-xl md:text-display">Your markets today</h1>
            <p className="max-w-prose text-sm text-on-panel-muted">
              Forecasts last published {dateTime(d.runAt, tz)}. Every one is locked when it&apos;s made and scored when it&apos;s due.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-lg bg-on-panel/10 p-4 ring-1 ring-on-panel/10 backdrop-blur">
                <dt className="text-2xs uppercase tracking-wide text-on-panel-muted">{k.label}</dt>
                <dd className={cx("tabular mt-1 text-xl", k.tone === "up" ? "text-panel-up" : k.tone === "down" ? "text-panel-down" : "text-on-panel")}>{k.value}</dd>
                <dd className="text-xs text-on-panel-muted">{k.note}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap gap-3">
            <Link href="/forecasts" className="inline-flex h-10 items-center gap-2 rounded-md bg-on-panel px-4 text-sm font-semibold text-panel hover:bg-on-panel/90">
              All forecasts <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
            <Link href="/track-record" className="inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold text-on-panel ring-1 ring-on-panel/30 hover:bg-on-panel/10">
              Track record
            </Link>
          </div>
        </div>
      </section>

      <Section id="markets" title="Markets" action={<Link href="/forecasts?market=all" className="text-sm font-semibold text-accent hover:underline">Every asset</Link>}>
        <ul className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          {d.cards.map(({ market, row: r, spark }) => (
            <li key={market.code}>
              <Link href={`/assets/${r.asset.slug}`} prefetch={false}
                className="group flex h-full flex-col gap-3 rounded-lg border bg-surface p-3 shadow-card transition hover:-translate-y-0.5 hover:shadow-premium md:p-4">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-2xs uppercase tracking-wide text-subtle">{market.name}</span>
                  {r.demo ? <DemoNote /> : r.signal && <SignalBadge signal={r.signal} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-fg group-hover:underline">{r.asset.name}</span>
                  <span className="font-mono text-xs text-subtle">{r.asset.ticker}{!r.demo && r.asset.meta.proxy && ` · via ${r.asset.meta.proxy}`}</span>
                </span>
                {r.locked ? <span className="text-sm text-muted">No prices yet</span> : (
                  <>
                    <span className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between md:gap-2">
                      <span className="tabular text-lg text-fg">{fmtPrice(r.price, r.asset.quoteUnit)}</span>
                      <PriceChange value={r.change24hPct} suffix="24h" className="text-xs" />
                    </span>
                    <Sparkline values={spark} />
                    <span className="hidden text-xs text-muted md:block">30-day closes</span>
                  </>
                )}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/markets/crypto" className="flex h-full flex-col justify-between gap-3 rounded-lg bg-accent-soft p-3 text-accent transition hover:-translate-y-0.5 hover:shadow-premium md:p-4">
              <span className="text-2xs uppercase tracking-wide">All markets</span>
              <span className="text-lg font-semibold">{d.counts.live} live assets, {listMarkets(v).length} markets</span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold">Browse <ArrowRight aria-hidden className="h-4 w-4" /></span>
            </Link>
          </li>
        </ul>
      </Section>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:gap-6">
        <Section id="strongest" title="Strongest signals" className="lg:col-span-2">
          <Card className="divide-y">
            {d.strongest.length === 0 ? (
              <p className="p-6 text-sm text-muted">No live signals yet.</p>
            ) : d.strongest.map((r) => (
              <Link key={r.asset.slug} href={`/assets/${r.asset.slug}/signals`} prefetch={false}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 hover:bg-surface-sunken">
                <AssetMark ticker={r.asset.ticker} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r.asset.name}</span>
                  <span className="font-mono text-xs text-subtle">{r.asset.ticker} · {listMarkets(v).find((m) => m.code === r.asset.market)?.name}</span>
                </span>
                <span className="grid justify-items-end">
                  <span className="tabular text-sm">{fmtPrice(r.horizons?.["7d"]?.mid, r.asset.quoteUnit)}</span>
                  <PriceChange value={r.horizons?.["7d"]?.changePct} suffix="7d" className="text-xs" />
                </span>
                <SignalBadge signal={r.signal!} pUp={r.pUp} />
              </Link>
            ))}
          </Card>
        </Section>

        <Section id="watchlist" title="Watchlist" action={<Link href="/watchlist" className="text-sm font-semibold text-accent hover:underline">Open</Link>}>
          <Card className="divide-y">
            {watch.length === 0 ? (
              <EmptyState icon={<Star aria-hidden className="h-6 w-6" />} title="Your watchlist is empty"
                action={<ButtonLink href="/forecasts" variant="secondary">Find assets</ButtonLink>}>Star any asset to keep it here.</EmptyState>
            ) : watch.slice(0, 6).map((r) => (
              <Link key={r.asset.slug} href={`/assets/${r.asset.slug}`} prefetch={false} className="flex items-center gap-3 p-4 hover:bg-surface-sunken">
                <AssetMark ticker={r.asset.ticker} />
                <span className="min-w-0 flex-1 truncate font-semibold">{r.asset.name}</span>
                {r.locked ? <Badge>No data</Badge> : (
                  <span className="grid justify-items-end">
                    <span className="tabular text-sm">{fmtPrice(r.price, r.asset.quoteUnit)}</span>
                    <PriceChange value={r.change24hPct} className="text-xs" />
                  </span>
                )}
              </Link>
            ))}
          </Card>
        </Section>
      </div>

      <Section id="today" title="Crypto signals right now" action={<Link href="/forecasts?market=crypto" className="text-sm font-semibold text-accent hover:underline">Full table</Link>}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabSwitch tab={q.tab} base="/" current={q} dayLocked={!v.plan.dayTrading} />
          <span className="text-xs text-subtle">As of {dateTime(crypto.runAt, tz)}</span>
        </div>
        {crypto.tabLocked ? (
          <Card className="p-6 text-sm text-muted">Intraday signals are on the Crypto plan and up. <Link className="font-semibold text-accent underline" href="/pricing?plan=crypto">See plans</Link></Card>
        ) : (
          <ForecastTable data={crypto} tab={q.tab} visible={["price", "1d", "7d", "1m", "signal", "volatility"]} base="/" current={q}
            watchlist={starred} starMode={starMode} />
        )}
      </Section>
    </div>
  );
}
