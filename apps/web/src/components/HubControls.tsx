import Link from "next/link";
import { CandlestickChart, LineChart, Lock, Search } from "lucide-react";
import type { Market, Tab } from "@/lib/data";
import { hubHref } from "@/lib/query";
import { AutoSubmit } from "./client/AutoSubmit";
import { cx } from "./ui";

const chip = "inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-pill border px-3 text-sm font-medium";

export function TabSwitch({ tab, base, current, dayLocked }: { tab: Tab; base: string; current: Record<string, unknown>; dayLocked: boolean }) {
  const item = (t: Tab, label: string, Icon: typeof LineChart) => (
    <Link href={hubHref(base, current, { tab: t, page: 1, sort: undefined, dir: undefined })} scroll={false} aria-current={tab === t ? "page" : undefined}
      className={cx("inline-flex h-10 items-center gap-2 rounded-pill px-4 text-sm font-semibold", tab === t ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}>
      <Icon aria-hidden className="h-4 w-4" />{label}{t === "day_trading" && dayLocked && <Lock aria-label="needs a plan" className="h-3 w-3" />}
    </Link>
  );
  return (
    <nav aria-label="View" className="inline-flex rounded-pill bg-surface-sunken p-1">
      {item("investing", "Investing", LineChart)}
      {item("day_trading", "Day trading", CandlestickChart)}
    </nav>
  );
}

export function MarketChips({ markets, active, base, current }: { markets: Market[]; active: string; base: string; current: Record<string, unknown> }) {
  return (
    <nav aria-label="Market" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
      {[{ code: "all", name: "All markets", locked: false } as const, ...markets].map((m) => (
        <Link key={m.code} href={hubHref(base, current, { market: m.code, page: 1 })} scroll={false} aria-current={active === m.code ? "page" : undefined}
          className={cx(chip, active === m.code ? "border-accent bg-accent text-on-accent" : "bg-surface hover:bg-surface-sunken", m.locked && active !== m.code && "text-subtle")}>
          {m.locked && <Lock aria-hidden className="h-3 w-3" />}{m.name}{m.locked && <span className="sr-only">, needs an upgrade</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Filters({ q, signal, volatility, keep, action }: { q: string; signal: string; volatility: string; keep: Record<string, string | undefined>; action: string }) {
  const sel = "h-10 rounded-md border border-input bg-surface px-3 text-sm text-fg";
  return (
    <form id="hub-filters" action={action} method="get" role="search" className="flex flex-wrap items-end gap-3">
      {Object.entries(keep).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <label className="grid min-w-0 flex-1 basis-56 gap-1 text-sm">
        <span className="sr-only">Search assets</span>
        <span className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-subtle" />
          <input type="search" name="q" defaultValue={q} placeholder="Search by name or ticker" maxLength={60}
            className="h-10 w-full rounded-md border border-input bg-surface pl-10 pr-3 text-sm text-fg placeholder:text-subtle" />
        </span>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-semibold text-muted">Signal</span>
        <select name="signal" defaultValue={signal} className={sel}>
          <option value="all">Any signal</option>
          <option value="strong_buy">Strong buy (65%+ up)</option>
          <option value="buy">Buy (55–65% up)</option>
          <option value="neutral">Neutral (45–55%)</option>
          <option value="sell">Sell (55–65% down)</option>
          <option value="strong_sell">Strong sell (65%+ down)</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-semibold text-muted">Volatility</span>
        <select name="volatility" defaultValue={volatility} className={sel}>
          <option value="all">Any</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
        </select>
      </label>
      <button type="submit" data-apply className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-on-accent">Apply</button>
      <AutoSubmit formId="hub-filters" />
    </form>
  );
}

export function Pagination({ page, pages, total, perPage, base, current }: { page: number; pages: number; total: number; perPage: number; base: string; current: Record<string, unknown> }) {
  if (total === 0) return null;
  const from = (page - 1) * perPage + 1, to = Math.min(page * perPage, total);
  const nums = Array.from(new Set([1, page - 1, page, page + 1, pages])).filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const btn = "inline-flex h-10 min-w-tap items-center justify-center rounded-md border bg-surface px-3 text-sm font-semibold hover:bg-surface-sunken";
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted">{from}–{to} of {total}</span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-muted">Rows
          {[10, 20, 50, 100].map((n) => (
            <Link key={n} href={hubHref(base, current, { perPage: n, page: 1 })} scroll={false} aria-current={n === perPage ? "true" : undefined}
              className={cx("rounded-sm px-1", n === perPage ? "font-semibold text-fg" : "hover:text-fg")}>{n}</Link>
          ))}
        </span>
        {pages > 1 && (
          <>
            {page > 1 ? <Link className={btn} href={hubHref(base, current, { page: page - 1 })} scroll={false}>Previous</Link>
              : <span className={cx(btn, "opacity-50")} aria-disabled="true">Previous</span>}
            {nums.map((n, i) => (
              <span key={n} className="flex items-center gap-2">
                {i > 0 && n - nums[i - 1] > 1 && <span aria-hidden className="text-subtle">…</span>}
                <Link href={hubHref(base, current, { page: n })} scroll={false} aria-current={n === page ? "page" : undefined}
                  className={cx(btn, n === page && "border-accent bg-accent text-on-accent hover:bg-accent-hover")}>{n}</Link>
              </span>
            ))}
            {page < pages ? <Link className={btn} href={hubHref(base, current, { page: page + 1 })} scroll={false}>Next</Link>
              : <span className={cx(btn, "opacity-50")} aria-disabled="true">Next</span>}
          </>
        )}
      </div>
    </nav>
  );
}
