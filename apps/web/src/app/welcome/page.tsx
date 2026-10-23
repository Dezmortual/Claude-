import Image from "next/image";
import { Bell, BarChart3, Clock, ListChecks, ShieldCheck, Undo2 } from "lucide-react";
import { Badge, ButtonLink, Card, Label, Section } from "@/components/ui";
import { publicLanding } from "@/lib/paths";
import { viewer } from "@/lib/session";

// The landing page (replica/launch/landing.md). Public only with PUBLIC_LANDING=true; otherwise the signed-in owner
// can preview it. Every claim here must be true of the running product: unbuilt fixes are labelled as in progress.

export async function generateMetadata() {
  return {
    title: { absolute: "FXDEZ: forecasts that keep score, misses included" },
    description: "Price ranges and buy-or-sell signals for crypto and other markets. Every forecast is locked when it's made and scored when it's due.",
    robots: publicLanding() ? { index: true, follow: true } : { index: false, follow: false },
  };
}

const PROBLEMS = [
  ["You only see the wins", "Many signal apps show the calls that worked and drop the rest, or add percentages together in ways that flatter them. With no record of the misses, there's no telling skill from luck."],
  ["Paying is easy. Leaving isn't.", "Everything sits behind a paywall, trials turn into charges, and cancelling means hunting through chats and emails."],
] as const;

const STEPS = [
  [BarChart3, "Pick an asset", "See where its price could be tomorrow, in a week and in a month: a range covering 80% of past outcomes, and how often it ended higher."],
  [ListChecks, "Check the reading", "Every signal shows the twenty indicators behind it, each read as buy, neutral or sell on closed bars."],
  [Bell, "Get told when it changes", "Set an alert on a price level or a signal flip. It fires once, then waits."],
] as const;

const FEATURES = [
  [ShieldCheck, "A track record you can check", "Forecasts are locked the hour they're published and scored when their date passes. Hit rate, range coverage and median error, by market and horizon, misses counted.", null],
  [ListChecks, "The why behind every signal", "Open any signal to see the moving averages and oscillators that make it up, on every timeframe from 5 minutes to a week.", null],
  [Clock, "Signals that don't flicker", "Signals are computed on closed bars only, so a buy doesn't turn into a sell and back within the same minute.", null],
  [Bell, "Alerts that leave you alone", "Each alert fires once when its condition is met, then waits out its cooldown. Pause or delete any of them in one click.", null],
  [Undo2, "Every call, one by one", "A ledger of each forecast and signal with its result, including the worst move against it before it played out.", "In progress"],
] as const;

const PLANS = [
  ["Free", "$0", "For checking whether the forecasts are any good.", ["Daily forecasts and signals for every live asset", "The full track record", "Watchlist of 5, and 3 alerts"]],
  ["Trader", "$8 a month", "For acting on signals during the day. $80 a year.", ["Everything in Free", "Intraday signals, 5 minutes to 1 hour", "Unlimited alerts and a daily digest", "Cancel in one click; refunds within 14 days"]],
] as const;

const FAQ = [
  ["Is this financial advice?", "No. It's statistics about how prices behaved in the past, the same for everyone, and it can be wrong."],
  ["How is accuracy measured?", "Each forecast is stored when it's published and can't be edited. When its target time passes, we compare it with the price that bar closed at. The track record page shows the results, misses included."],
  ["Where do the prices come from?", "Public market data: Binance for crypto, Twelve Data for currencies (European Central Bank reference rates as the fallback), Alpaca for stocks and funds, and official government sources for bond yields, with a second source to cross-check crypto prices. Markets without a source are marked as demo data and never scored."],
  ["Can I cancel easily?", "Yes. When paid plans exist, cancelling will be one click on your account page, and you keep access to the end of the period you paid for."],
  ["Is there a phone app?", "Not yet. The site works on phones, and an app is planned."],
] as const;

export default async function Welcome() {
  const v = await viewer();
  const waitlist = process.env.WAITLIST_URL;
  const cta = waitlist
    ? <ButtonLink href={waitlist} size="lg">Get early access</ButtonLink>
    : v.user
      ? <ButtonLink href="/forecasts" size="lg">Open the forecasts</ButtonLink>
      : <ButtonLink href="/sign-in" size="lg">Sign in</ButtonLink>;

  return (
    <div className="space-y-16">
      {!publicLanding() && v.user && (
        <p className="rounded-md bg-surface-sunken p-3 text-sm text-muted">Preview: only you can see this page. Set PUBLIC_LANDING=true to show it to visitors.</p>
      )}

      <section className="grid gap-6 py-6 md:py-10">
        <Label>Price forecasts with receipts</Label>
        <h1 className="max-w-3xl text-xl md:text-display">Forecasts that keep score, misses included.</h1>
        <p className="max-w-prose text-base text-muted">
          FXDEZ publishes price ranges and buy-or-sell signals for crypto and other markets. Each forecast is locked when it&apos;s made
          and scored when it&apos;s due, so the hit rate you see is measured, not claimed.
        </p>
        <div className="flex flex-wrap gap-3">
          {cta}
          <ButtonLink href="#how" size="lg" variant="secondary">How it works</ButtonLink>
        </div>
        <Image src="/welcome/asset-page.webp" width={1440} height={756} priority sizes="(min-width: 1200px) 1200px, 100vw"
          alt="A FXDEZ asset page: Bitcoin's price, the 90-day range, volatility, and a chart with the forecast range"
          className="h-auto w-full rounded-lg border shadow-card" />
      </section>

      <Section id="problem" title="Signal apps grade their own homework">
        <div className="grid gap-4 md:grid-cols-2">
          {PROBLEMS.map(([t, d]) => (
            <Card key={t} className="space-y-2 p-5">
              <h3 className="text-base font-semibold">{t}</h3>
              <p className="text-sm text-muted">{d}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="how" title="How it works">
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {STEPS.map(([I, t, d], i) => (
            <li key={t}>
              <Card className="h-full space-y-2 p-5">
                <span className="flex items-center gap-2 text-accent"><I aria-hidden className="h-5 w-5" /><span className="text-2xs uppercase tracking-wide">Step {i + 1}</span></span>
                <h3 className="text-base font-semibold">{t}</h3>
                <p className="text-sm text-muted">{d}</p>
              </Card>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="features" title="Built to be checked">
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {FEATURES.map(([I, t, d, tag]) => (
            <li key={t}>
              <Card className="flex h-full gap-4 p-5">
                <I aria-hidden className="h-5 w-5 shrink-0 text-accent" />
                <div className="space-y-1">
                  <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">{t}{tag && <Badge>{tag}</Badge>}</h3>
                  <p className="text-sm text-muted">{d}</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="pricing" title="Pricing">
        <p className="max-w-prose text-sm text-muted">Nothing is on sale yet. These are the prices planned for launch, and the track record stays free on every plan.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {PLANS.map(([name, price, who, items]) => (
            <Card key={name} className="space-y-3 p-6">
              <h3 className="text-base font-semibold">{name}</h3>
              <p className="text-xl">{price}</p>
              <p className="text-sm text-muted">{who}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">{items.map((x) => <li key={x}>{x}</li>)}</ul>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="faq" title="Questions">
        <div className="grid gap-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="rounded-md border bg-surface p-4 [&_summary]:cursor-pointer">
              <summary className="font-semibold">{q}</summary>
              <p className="mt-2 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Card className="flex flex-wrap items-center justify-between gap-4 p-6 md:p-8">
        <div className="max-w-prose space-y-1">
          <h2 className="text-lg">See how often it&apos;s right before you trust it</h2>
          <p className="text-sm text-muted">The record starts the day the first forecast is scored, and it&apos;s never edited.</p>
        </div>
        {cta}
      </Card>
    </div>
  );
}
