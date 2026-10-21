import Link from "next/link";
import type { Market } from "@/lib/data";
import { cx } from "./ui";

export function MarketNav({ markets, active, page }: { markets: Market[]; active: string; page: "overview" | "assets" }) {
  return (
    <div className="space-y-4">
      <nav aria-label="Markets" className="-mx-4 flex gap-2 relative overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {markets.map((m) => (
          <Link key={m.code} href={`/markets/${m.code}${page === "assets" ? "/assets" : ""}`} aria-current={active === m.code ? "page" : undefined}
            className={cx("inline-flex h-8 items-center whitespace-nowrap rounded-pill border px-3 text-sm font-medium",
              active === m.code ? "border-accent bg-accent text-on-accent" : "bg-surface hover:bg-surface-sunken")}>{m.name}</Link>
        ))}
      </nav>
      <nav aria-label="Market pages" className="flex gap-1 border-b">
        {[["overview", "Overview", `/markets/${active}`], ["assets", "All assets", `/markets/${active}/assets`]].map(([k, l, h]) => (
          <Link key={k} href={h} aria-current={page === k ? "page" : undefined}
            className={cx("-mb-px border-b-2 px-3 py-3 text-sm font-semibold", page === k ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}>{l}</Link>
        ))}
      </nav>
    </div>
  );
}

export const MARKET_BLURB: Record<string, string> = {
  crypto: "Trades around the clock, so horizons count calendar days. The most volatile market here: expect wide ranges.",
  forex: "Currency pairs, quoted as the second currency per one unit of the first. Horizons count trading sessions.",
  stocks: "Large US companies. Ranges exclude dividends; earnings dates can move prices far outside them.",
  commodities: "Metals and oil, priced in US dollars. Supply shocks are the usual reason a range breaks.",
  indices: "Baskets of shares that track a whole market. Usually calmer than single stocks.",
  etfs: "Funds that trade like shares. Each follows an index or a commodity.",
  bonds: "Government bond yields, in percent. A rising yield means a falling bond price.",
};
