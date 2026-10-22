// DataTable "full" variant from components.md: sticky header + first column, sortable headers as links,
// locked rows with a reason (never blurred numbers), card list under md.
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { planFor, type ForecastPage, type ForecastRow, type Tab, type Verdict } from "@/lib/data";
import { price as fmtPrice, pct } from "@/lib/format";
import { hubHref } from "@/lib/query";
import { WatchStar } from "./client/WatchStar";
import { AssetCell, AssetMark, EmptyState, PriceChange, SignalBadge, TrendPill, cx } from "./ui";

interface Col { key: string; label: string; help?: string; sort?: string; cell: (r: ForecastRow) => ReactNode }

const horizon = (h: "1d" | "7d" | "1m" | "1y" | "5y" | "10y") => (r: ForecastRow) => {
  const x = r.horizons?.[h];
  if (!x) return "—";
  return (
    <span className="grid justify-items-end">
      <span className="tabular text-fg">{fmtPrice(x.mid, r.asset.quoteUnit)}</span>
      <PriceChange value={x.changePct} className="text-xs" />
    </span>
  );
};

export const INVESTING_COLS: Col[] = [
  { key: "price", label: "Price", sort: "price", cell: (r) => (
    <span className="grid justify-items-end"><span className="tabular text-fg">{fmtPrice(r.price, r.asset.quoteUnit)}</span><PriceChange value={r.change24hPct} suffix="24h" className="text-xs" /></span>) },
  { key: "1d", label: "Next day", sort: "1d", cell: horizon("1d") },
  { key: "7d", label: "7 days", sort: "7d", cell: horizon("7d") },
  { key: "1m", label: "1 month", sort: "1m", cell: horizon("1m") },
  { key: "1y", label: "1 year*", help: "Scenario, not a forecast", sort: "1y", cell: horizon("1y") },
  { key: "5y", label: "5 years*", help: "Scenario, not a forecast", sort: "5y", cell: horizon("5y") },
  { key: "10y", label: "10 years*", help: "Scenario, not a forecast", sort: "10y", cell: horizon("10y") },
  { key: "signal", label: "7-day signal", sort: "signal", cell: (r) => <SignalBadge signal={r.signal!} pUp={r.pUp} /> },
  { key: "macd", label: "MACD", cell: (r) => <TrendPill tone={r.metrics!.macd === "bullish" ? "up" : r.metrics!.macd === "bearish" ? "down" : "flat"}>{cap(r.metrics!.macd)}</TrendPill> },
  { key: "maCross", label: "50/200 cross", cell: (r) => <TrendPill tone={r.metrics!.maCross === "golden" ? "up" : r.metrics!.maCross === "death" ? "down" : "flat"}>{r.metrics!.maCross === "golden" ? "Golden" : r.metrics!.maCross === "death" ? "Death" : "None"}</TrendPill> },
  { key: "ma200", label: "vs 200-day", cell: (r) => <TrendPill tone={(r.metrics!.pctFromMa200 ?? 0) >= 0 ? "up" : "down"}>{pct(r.metrics!.pctFromMa200, 1)}</TrendPill> },
  { key: "volatility", label: "Volatility", sort: "volatility", cell: (r) => <span className="whitespace-nowrap">{cap(r.metrics!.volatilityLabel)} <span className="tabular text-muted">{r.metrics!.volatilityPct.toFixed(0)}%</span></span> },
  { key: "sharpe", label: "Sharpe 1y", sort: "sharpe", cell: (r) => <span className="tabular">{r.metrics!.sharpe?.toFixed(2) ?? "—"}</span> },
  { key: "dividend", label: "Dividend", sort: "dividend", cell: (r) => <span className="tabular">{r.metrics!.dividendYieldPct ? `${r.metrics!.dividendYieldPct.toFixed(2)}%` : "—"}</span> },
];

const verdict = (tf: "5m" | "30m" | "1h") => (r: ForecastRow) => <SignalBadge signal={(r.intraday?.[tf] ?? "unavailable") as Verdict} />;

export const DAY_COLS: Col[] = [
  INVESTING_COLS[0],
  { key: "5m", label: "5 min", cell: verdict("5m") },
  { key: "30m", label: "30 min", cell: verdict("30m") },
  { key: "1h", label: "1 hour", cell: verdict("1h") },
  INVESTING_COLS[1],
  { key: "volatility", label: "Volatility", sort: "volatility", cell: INVESTING_COLS[11].cell },
];

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ForecastTable({ data, tab, visible, base, current, watchlist, starMode }: {
  data: ForecastPage; tab: Tab; visible: string[]; base: string; current: Record<string, unknown>;
  watchlist: string[]; starMode: "guest" | "no-plan" | "ok";
}) {
  const cols = tab === "day_trading" ? DAY_COLS : INVESTING_COLS.filter((c) => visible.includes(c.key));
  const sort = current.sort as string | undefined;
  const dir = (current.dir as string | undefined) ?? (sort === "asset" ? "asc" : "desc");

  if (!data.rows.length) {
    return (
      <div className="rounded-lg border bg-surface">
        <EmptyState title="No assets match these filters" action={<Link href={base} className="text-sm font-semibold text-accent hover:underline">Clear filters</Link>}>
          Try a weaker signal, another market or a shorter search.
        </EmptyState>
      </div>
    );
  }

  const header = (label: string, key?: string, help?: string) => {
    if (!key) return <span title={help}>{label}</span>;
    const active = sort === key;
    const nextDir = active ? (dir === "asc" ? "desc" : "asc") : key === "asset" ? "asc" : "desc";
    const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <Link href={hubHref(base, current, { sort: key, dir: nextDir, page: 1 })} scroll={false} title={help}
        className={cx("inline-flex items-center gap-1 hover:text-fg", active && "text-fg")}>
        {label}<Icon aria-hidden className="h-3 w-3" />
      </Link>
    );
  };
  const ariaSort = (key?: string) => (key && sort === key ? (dir === "asc" ? "ascending" : "descending") : undefined);

  return (
    <>
      {/* md and up: the table */}
      <div tabIndex={0} role="region" aria-label="Forecast table, scrolls sideways" className="hidden relative overflow-x-auto rounded-lg border bg-surface md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Forecasts, {data.total} assets, page {data.page} of {data.pages}</caption>
          <thead>
            <tr className="bg-surface-sunken text-2xs uppercase tracking-wide text-subtle">
              <th scope="col" aria-sort={ariaSort("asset")} className="sticky left-0 z-dropdown bg-surface-sunken px-3 py-3 text-left">{header("Asset", "asset")}</th>
              {cols.map((c) => <th key={c.key} scope="col" aria-sort={ariaSort(c.sort)} className="whitespace-nowrap px-3 py-3 text-right">{header(c.label, c.sort, c.help)}</th>)}
              <th scope="col" className="px-2"><span className="sr-only">Watch</span></th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.asset.slug} className="group border-t">
                <th scope="row" className="sticky left-0 z-dropdown max-w-xs bg-surface px-3 py-2 text-left font-normal group-hover:bg-surface-sunken">
                  <AssetCell name={r.asset.name} ticker={r.asset.ticker} href={`/assets/${r.asset.slug}`} demo={r.demo} />
                </th>
                {r.locked ? (
                  <td colSpan={cols.length} className="px-3 py-2 text-left group-hover:bg-surface-sunken">
                    <Link prefetch={false} href={`/pricing?plan=${planFor(r.asset).code}`} className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
                      <Lock aria-hidden className="h-4 w-4" />
                      <span><span className="sr-only">Locked. </span>{r.asset.name} forecasts are on the <b className="text-accent">{planFor(r.asset).name}</b> plan</span>
                    </Link>
                  </td>
                ) : (
                  cols.map((c) => <td key={c.key} className="tabular whitespace-nowrap px-3 py-2 text-right group-hover:bg-surface-sunken">{c.cell(r)}</td>)
                )}
                <td className="px-2 text-right group-hover:bg-surface-sunken">
                  {!r.locked && <WatchStar slug={r.asset.slug} name={r.asset.name} on={watchlist.includes(r.asset.slug)} mode={starMode} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* under md: cards */}
      <ul className="grid gap-2 md:hidden" aria-label="Forecasts">
        {data.rows.map((r) => {
          const h = r.horizons?.[tab === "day_trading" ? "1d" : "7d"];
          return (
            <li key={r.asset.slug}>
              <Link prefetch={false} href={r.locked ? `/pricing?plan=${planFor(r.asset).code}` : `/assets/${r.asset.slug}`}
                className="flex items-center justify-between gap-3 rounded-lg border bg-surface p-3 hover:bg-surface-sunken">
                <span className="flex min-w-0 items-center gap-2">
                  <AssetMark ticker={r.asset.ticker} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{r.asset.name}</span>
                    <span className="block font-mono text-xs text-subtle">{r.asset.ticker}{!r.locked && ` · ${fmtPrice(r.price, r.asset.quoteUnit)}`}</span>
                  </span>
                </span>
                {r.locked ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted"><Lock aria-hidden className="h-3 w-3" />{planFor(r.asset).name}</span>
                ) : (
                  <span className="grid justify-items-end gap-1">
                    <PriceChange value={h?.changePct} suffix={tab === "day_trading" ? "1d" : "7d"} className="text-sm" />
                    <SignalBadge signal={tab === "day_trading" ? (r.intraday?.["1h"] ?? "unavailable") : r.signal!} />
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
