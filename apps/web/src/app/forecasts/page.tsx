import { cookies } from "next/headers";
import Link from "next/link";
import { ColumnPicker } from "@/components/client/ColumnPicker";
import { ForecastTable } from "@/components/ForecastTable";
import { Filters, MarketChips, Pagination, TabSwitch } from "@/components/HubControls";
import { Banner, ButtonLink, Card, DemoNote, Label, Paywall, PriceChange, Section, cx } from "@/components/ui";
import { ALL_COLUMNS, DEFAULT_COLUMNS, getPrefs, listForecasts, listMarkets, movers, outlook, watchlistSlugs } from "@/lib/data";
import { dateTime } from "@/lib/format";
import { hubHref, parseForecastQuery, type SP } from "@/lib/query";
import { viewer } from "@/lib/session";

export const metadata = {
  title: "Forecasts",
  description: "Next-day, 7-day and 1-month forecasts with probability-based signals, plus long-term scenarios, for every asset in one table.",
};

const HORIZONS = { "1d": "next day", "7d": "7 days", "1m": "1 month" } as const;

export default async function ForecastHub({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const v = await viewer();
  const prefs = getPrefs(v);
  const q = parseForecastQuery(sp, { perPage: prefs.rowsPerPage, tab: prefs.defaultTab });
  const guestCols = (await cookies()).get("cols")?.value?.split(",").filter((c) => ALL_COLUMNS.includes(c));
  const visible = v.user ? prefs.visibleColumns : guestCols?.length ? guestCols : DEFAULT_COLUMNS;
  const data = listForecasts(v, q);
  const markets = listMarkets(v);
  const mh = (["1d", "7d", "1m"].includes(String(sp.mh)) ? sp.mh : "7d") as keyof typeof HORIZONS;
  const mv = movers(v, mh);
  const ol = outlook(v, mh);
  const current = { ...q };
  const base = "/forecasts";
  const starMode = !v.user ? "guest" : v.plan.watchlistAlerts ? "ok" : "no-plan";
  const lockedMarket = q.market !== "all" && markets.find((m) => m.code === q.market)?.locked;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2"><Label>Forecasts</Label><DemoNote /></div>
        <h1 className="text-xl md:text-display">Where each market could be next</h1>
        <p className="max-w-prose text-muted">
          Next-day, 7-day and 1-month ranges for every asset, with the chance of a rise behind each signal. Long-term columns are
          scenarios built from stated growth rates, not predictions. Every published forecast is scored once its date passes.
        </p>
        <p className="text-sm text-subtle">Forecasts from the {dateTime(data.runAt)} run · refreshed hourly</p>
      </header>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabSwitch tab={q.tab} base={base} current={current} dayLocked={!v.plan.dayTrading} />
          {q.tab === "investing" && <ColumnPicker visible={visible} defaults={DEFAULT_COLUMNS} signedIn={!!v.user} rowsPerPage={q.perPage} />}
        </div>
        <MarketChips markets={markets} active={q.market} base={base} current={current} />
        <Filters q={q.q} signal={q.signal} volatility={q.volatility} action={base}
          keep={{ market: q.market !== "all" ? q.market : undefined, tab: q.tab !== "investing" ? q.tab : undefined, sort: q.sort, dir: q.dir }} />

        {data.tabLocked ? (
          <Paywall planName="Crypto" href="/pricing?plan=crypto">
            Intraday signals (5-minute, 30-minute and hourly) are on the <b className="text-fg">Crypto</b> plan and up.
          </Paywall>
        ) : (
          <>
            {lockedMarket && (
              <Banner tone="info">This market isn&apos;t in your plan yet, so its rows are locked. <Link className="font-semibold underline" href="/pricing">Compare plans</Link></Banner>
            )}
            {q.tab === "investing" && visible.some((c) => ["1y", "5y", "10y"].includes(c)) && (
              <p className="text-xs text-subtle">* Scenario: today&apos;s price grown at a fixed base-case rate for the market. Not a forecast.</p>
            )}
            <ForecastTable data={data} tab={q.tab} visible={visible} base={base} current={current}
              watchlist={watchlistSlugs(v)} starMode={starMode} />
            <Pagination page={data.page} pages={data.pages} total={data.total} perPage={q.perPage} base={base} current={current} />
          </>
        )}
      </div>

      <Section id="movers" title="Biggest forecast moves" action={
        <nav aria-label="Horizon" className="inline-flex rounded-pill bg-surface-sunken p-1">
          {(Object.keys(HORIZONS) as (keyof typeof HORIZONS)[]).map((h) => (
            <Link key={h} scroll={false} href={`${hubHref(base, current, { mh: h })}#movers`}
              aria-current={mh === h ? "page" : undefined}
              className={cx("h-8 rounded-pill px-3 text-sm font-semibold leading-8", mh === h ? "bg-surface shadow-card" : "text-muted hover:text-fg")}>
              {HORIZONS[h]}
            </Link>
          ))}
        </nav>
      }>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4">
            <Label>Outlook, {HORIZONS[mh]}</Label>
            <p className="mt-2 text-lg"><span className="text-up">{ol.up} higher</span> · <span className="text-down">{ol.down} lower</span></p>
            <p className="text-sm text-muted">of the {ol.total} assets on your plan</p>
            {ol.strongest && (
              <p className="mt-3 text-sm">Largest expected move: <Link className="font-semibold hover:underline" href={`/assets/${ol.strongest.asset.slug}`}>{ol.strongest.asset.name}</Link>{" "}
                <PriceChange value={ol.strongest.changePct} /></p>
            )}
          </Card>
          {([["Expected to rise most", mv.gainers], ["Expected to fall most", mv.losers]] as const).map(([title, list]) => (
            <Card key={title} className="p-4">
              <Label>{title}</Label>
              {list.length ? (
                <ol className="mt-2 grid gap-1">
                  {list.map((m) => (
                    <li key={m.asset.slug} className="flex min-h-tap items-center justify-between gap-2 border-b last:border-0">
                      <Link href={`/assets/${m.asset.slug}`} className="truncate text-sm font-semibold hover:underline">{m.asset.name}</Link>
                      <PriceChange value={m.changePct} className="text-sm" />
                    </li>
                  ))}
                </ol>
              ) : <p className="mt-2 text-sm text-muted">None expected for this horizon.</p>}
            </Card>
          ))}
        </div>
      </Section>

      {!v.user || v.plan.code === "free" ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="space-y-1">
            <h2 className="text-lg">Every crypto asset, intraday signals and alerts</h2>
            <p className="text-sm text-muted">The free plan covers the 10 largest crypto assets. Paid plans add the rest, more markets, a watchlist and alerts.</p>
          </div>
          <ButtonLink href="/pricing">See plans</ButtonLink>
        </Card>
      ) : null}

      <Section id="faq" title="Reading this table">
        <div className="grid gap-2">
          {[
            ["What does “61% up” mean?", "Over the last two years, when this asset was in the same trend state as today, it closed higher over the next 7 days 61% of the time. Signals bucket that number: 65%+ is a strong buy, 55–65% a buy, 45–55% neutral, and the mirror image for sells."],
            ["How accurate is it?", "We publish the measured hit rate for every horizon on the track record page once forecasts have matured. Until then we make no accuracy claim."],
            ["Why does the 1-year column look so different?", "Long horizons are scenarios: today's price grown at a fixed rate for the market. They help with planning, not timing."],
            ["Is this advice?", "No. It is statistics about past behaviour, the same for everyone, and it can be wrong."],
          ].map(([qq, a]) => (
            <details key={qq} className="rounded-md border bg-surface p-4 [&_summary]:cursor-pointer">
              <summary className="font-semibold">{qq}</summary>
              <p className="mt-2 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
      </Section>
    </div>
  );
}
