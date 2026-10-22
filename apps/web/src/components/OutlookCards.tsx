import type { OutlookCard } from "@/lib/data";
import { price } from "@/lib/format";
import { Badge, Card, PriceChange, cx } from "./ui";

const signed = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x)}%`;

/** Where the scenarios sit inside the range of the asset's real past moves of the same length. */
function Range({ c }: { c: OutlookCard }) {
  const h = c.history!;
  const lo = Math.min(h.worstPct, c.bearPct), hi = Math.max(h.bestPct, c.bullPct), at = (x: number) => `${((x - lo) / (hi - lo || 1)) * 100}%`;
  return (
    <div aria-hidden className="relative mt-2 h-6">
      <span className="absolute top-2 h-2 rounded-pill bg-surface-sunken" style={{ left: at(h.worstPct), width: `calc(${at(h.bestPct)} - ${at(h.worstPct)})` }} />
      <span className="absolute top-1 h-4 w-1 rounded-pill bg-text-muted" style={{ left: at(h.medianPct) }} />
      {([["bear", c.bearPct, "bg-down"], ["base", c.basePct, "bg-accent"], ["bull", c.bullPct, "bg-up"]] as const).map(([k, v, cls]) => (
        <span key={k} className={cx("absolute top-1 h-4 w-2 -translate-x-1/2 rounded-pill", cls)} style={{ left: at(v) }} />
      ))}
    </div>
  );
}

export function OutlookCards({ cards, unit, name }: { cards: OutlookCard[]; unit: string; name: string }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((c) => {
        const h = c.history;
        const since = h && new Date(h.since).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
        return (
          <li key={c.years}>
            <Card className="grid h-full content-start gap-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{c.year} <span className="font-normal text-muted">· in {c.years === 1 ? "1 year" : `${c.years} years`}</span></h3>
                {c.passesAth && <Badge tone="up">Above its record high</Badge>}
              </div>
              <p className="tabular text-xl">{price(c.base, unit)}</p>
              <p className="text-sm"><PriceChange value={c.basePct} /> <span className="text-muted">base case</span></p>
              <p className="text-xs text-muted">
                <span className="text-down">Bear {price(c.bear, unit)} ({signed(c.bearPct)})</span> · <span className="text-up">Bull {price(c.bull, unit)} ({signed(c.bullPct)})</span>
              </p>
              <div className="mt-1 border-t pt-2 text-xs text-muted">
                {h ? (
                  <>
                    <p>
                      {name}&apos;s own {c.years}-year moves since {since}: {signed(h.worstPct)} to {signed(h.bestPct)}, median {signed(h.medianPct)},
                      up in {Math.round(h.upShare * 100)}%. The base case is above {Math.round(h.baseBeats * 100)}% of them.
                    </p>
                    <Range c={c} />
                    <p className="sr-only">Bar: grey is the range of past moves with a mark at the median; red, purple and green are the bear, base and bull cases.</p>
                  </>
                ) : (
                  <p>Not enough stored history to compare {c.years}-year moves. Treat this one as arithmetic only.</p>
                )}
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
