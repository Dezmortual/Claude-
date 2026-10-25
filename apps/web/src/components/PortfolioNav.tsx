// The portfolio's sub-pages.
import Link from "next/link";
import { cx } from "./ui";

const TABS = [["/portfolio", "Holdings"], ["/portfolio/performance", "Performance"], ["/portfolio/risk", "Risk and rebalancing"], ["/portfolio/ledger", "Ledger"]] as const;

export function PortfolioNav({ at }: { at: (typeof TABS)[number][0] }) {
  return (
    <nav aria-label="Portfolio" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {TABS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={at === href ? "page" : undefined}
          className={cx("whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold", at === href ? "bg-accent text-on-accent" : "text-muted hover:bg-surface-sunken hover:text-fg")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
