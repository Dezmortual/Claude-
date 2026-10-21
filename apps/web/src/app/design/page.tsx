import { AssetCell, Badge, Banner, Button, ButtonLink, Card, EmptyState, Label, Paywall, PriceChange, Section, SignalBadge, Skeleton, StatCard, TrendPill } from "@/components/ui";

export const metadata = { title: "Design system", robots: { index: false } };

const LONG = "The Extraordinarily Long Named Decentralised Settlement Token"; // 60 characters: the long-content state

export default function Design() {
  return (
    <div className="space-y-12">
      <div className="space-y-2">
        <Label>Design system</Label>
        <h1 className="text-xl">Primitives</h1>
        <p className="max-w-prose text-muted">Every component from replica/design/components.md, built on the tokens only. Toggle the theme in the header to check dark mode.</p>
      </div>
      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button><Button disabled>Disabled</Button><Button loading>Saving</Button>
          <Button size="sm">Small</Button><Button size="lg">Large</Button><ButtonLink href="#" variant="link">Link</ButtonLink>
        </div>
      </Section>
      <Section title="Signals, trends and changes">
        <div className="flex flex-wrap items-center gap-2">
          {(["strong_buy", "buy", "neutral", "sell", "strong_sell", "unavailable"] as const).map((s) => <SignalBadge key={s} signal={s} />)}
          <SignalBadge signal="buy" pUp={0.61} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <TrendPill tone="up">Golden</TrendPill><TrendPill tone="down">Death</TrendPill><TrendPill tone="flat">Neutral</TrendPill>
          <PriceChange value={2.07} /><PriceChange value={-1.98} suffix="24h" /><PriceChange value={0} /><PriceChange value={null} />
          <Badge>Neutral</Badge><Badge tone="accent">Accent</Badge><Badge tone="warning">Stale · 6 min</Badge>
        </div>
      </Section>
      <Section title="Cards and long content">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Market cap" value="$1.70T" sub="Rank 1" />
          <StatCard label="From high" value="−33.0%" tone="down" sub="ATH $126,173" />
          <StatCard label="Unavailable" value="—" tone="muted" sub="Not provided by source" />
          <Card className="p-4"><AssetCell name={LONG} ticker="LONGTOKEN" href="#" /></Card>
        </div>
      </Section>
      <Section title="States">
        <Banner>Information banner.</Banner>
        <Banner tone="warning">Price is 6 minutes old; showing the last confirmed value.</Banner>
        <Banner tone="risk">Forecasts are estimates, not advice.</Banner>
        <Paywall planName="Pro" href="/pricing">Forex forecasts are on the <b className="text-fg">Pro</b> plan.</Paywall>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card><EmptyState title="Nothing matches" action={<Button size="sm" variant="secondary">Clear filters</Button>}>Try a weaker signal.</EmptyState></Card>
          <Card className="grid gap-3 p-5" aria-busy="true"><span className="sr-only">Loading</span><Skeleton className="w-1/3" /><Skeleton /><Skeleton className="w-2/3" /></Card>
        </div>
      </Section>
    </div>
  );
}
