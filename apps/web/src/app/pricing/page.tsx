import Link from "next/link";
import { Check, X } from "lucide-react";
import { Badge, Banner, ButtonLink, Card, Label, PageTitle, cx } from "@/components/ui";
import { PLANS, type Plan } from "@/lib/data";
import { money } from "@/lib/format";
import { viewer } from "@/lib/session";

export const metadata = { title: "Pricing", description: "Plans for crypto, forex and every other market. Cancel any time." };

const FEATURES: [string, (p: Plan) => boolean | string][] = [
  ["10 largest crypto assets", () => true],
  ["Long-term scenarios and daily signal, every asset", () => true],
  ["All crypto assets", (p) => !p.publicOnly],
  ["Intraday signals (5 min, 30 min, 1 hour)", (p) => p.dayTrading],
  ["Forex", (p) => p.markets.includes("forex")],
  ["Stocks, indices, ETFs, commodities, bonds", (p) => p.markets.includes("stocks")],
  ["Watchlist", (p) => p.watchlistAlerts],
  ["Price and signal alerts", (p) => (p.maxAlerts === null ? "Unlimited" : p.maxAlerts ? `Up to ${p.maxAlerts}` : false)],
];

export default async function Pricing({ searchParams }: { searchParams: Promise<{ interval?: string; plan?: string; need?: string }> }) {
  const sp = await searchParams;
  const v = await viewer();
  const yearly = sp.interval !== "month";
  const interval = yearly ? "year" : "month";
  const href = (p: Plan) => (p.code === "free" ? (v.user ? "/forecasts" : "/sign-up") : `/checkout?plan=${p.code}&interval=${interval}`);

  return (
    <div className="space-y-10">
      <PageTitle eyebrow="Pricing" title="Pick the markets you follow">
        Start free with the largest crypto assets. Every plan shows the same honest track record, and you can cancel whenever you like.
      </PageTitle>

      {sp.need === "watchlist" && <Banner>Watchlists and alerts start on the <b>Crypto</b> plan.</Banner>}
      <Banner tone="warning">Draft prices for this build. Payments aren&apos;t switched on yet, so checkout is a demo and nothing is charged.</Banner>

      <nav aria-label="Billing period" className="inline-flex rounded-pill bg-surface-sunken p-1">
        {[["year", "Yearly"], ["month", "Monthly"]].map(([k, l]) => (
          <Link key={k} href={`/pricing?interval=${k}${sp.plan ? `&plan=${sp.plan}` : ""}`} scroll={false} aria-current={interval === k ? "page" : undefined}
            className={cx("inline-flex h-10 items-center gap-2 rounded-pill px-4 text-sm font-semibold", interval === k ? "bg-surface shadow-card" : "text-muted hover:text-fg")}>
            {l}{k === "year" && <Badge tone="up">Save 20%</Badge>}
          </Link>
        ))}
      </nav>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => {
          const current = !!v.user && v.plan.code === p.code;
          const featured = sp.plan ? sp.plan === p.code : p.highlight;
          const monthly = yearly ? p.priceYearCents / 12 : p.priceMonthCents;
          return (
            <li key={p.code}>
              <Card className={cx("flex h-full flex-col gap-4 rounded-xl p-6", featured && "border-2 border-accent shadow-raised")}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg">{p.name}</h2>
                  {p.highlight && <Badge tone="accent">Most chosen</Badge>}
                </div>
                <p className="text-sm text-muted">{p.blurb}</p>
                <div>
                  <span className="tabular text-xl">{money(Math.round(monthly))}</span>
                  <span className="text-muted"> / month</span>
                  {p.priceMonthCents > 0 && <p className="text-xs text-muted">{yearly ? `${money(p.priceYearCents)} billed once a year` : "Billed monthly"}</p>}
                </div>
                <ul className="grid gap-2 text-sm">
                  {FEATURES.map(([label, has]) => {
                    const val = has(p);
                    return (
                      <li key={label} className={cx("flex gap-2", !val && "text-subtle")}>
                        {val ? <Check aria-hidden className="mt-0.5 h-4 w-4 flex-none text-up" /> : <X aria-hidden className="mt-0.5 h-4 w-4 flex-none" />}
                        <span>{label}{typeof val === "string" && `: ${val}`}<span className="sr-only">{val ? ", included" : ", not included"}</span></span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-auto">
                  {current ? (
                    <span className="flex h-10 items-center justify-center rounded-md bg-surface-sunken text-sm font-semibold text-muted">Your plan</span>
                  ) : (
                    <ButtonLink href={href(p)} variant={featured ? "primary" : "secondary"} className="w-full">
                      {p.code === "free" ? "Start free" : `Choose ${p.name}`}
                    </ButtonLink>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="pq" className="max-w-prose space-y-3">
        <Label>Questions</Label>
        <h2 id="pq" className="text-lg">Before you choose</h2>
        {[
          ["Can I cancel?", "Yes, from your account page, in two clicks. You keep access until the end of the period you paid for."],
          ["Do you offer refunds?", "Refunds are set out in our terms, which are being finalised before payments go live."],
          ["Is a paid plan more accurate?", "No. Every plan gets the same model. Paid plans add assets, markets, timeframes and alerts, not better numbers."],
          ["Is this financial advice?", "No. Forecasts are statistics about past behaviour, identical for everyone."],
        ].map(([q, a]) => (
          <details key={q} className="rounded-md border bg-surface p-4"><summary className="cursor-pointer font-semibold">{q}</summary><p className="mt-2 text-sm text-muted">{a}</p></details>
        ))}
      </section>
    </div>
  );
}
