import Link from "next/link";
import { redirect } from "next/navigation";
import { Banner, Button, Card, Label } from "@/components/ui";
import { PLANS } from "@/lib/data";
import { money } from "@/lib/format";
import { viewer } from "@/lib/session";
import { confirmCheckout } from "./actions";

export const metadata = { title: "Checkout" };

export default async function Checkout({ searchParams }: { searchParams: Promise<{ plan?: string; interval?: string }> }) {
  const sp = await searchParams;
  const plan = PLANS.find((p) => p.code === sp.plan && p.code !== "free");
  const interval = sp.interval === "month" ? "month" : "year";
  if (!plan) redirect("/pricing");
  const v = await viewer();
  if (!v.user) redirect(`/sign-up?next=${encodeURIComponent(`/checkout?plan=${plan.code}&interval=${interval}`)}`);
  const total = interval === "year" ? plan.priceYearCents : plan.priceMonthCents;
  const same = v.plan.code === plan.code;

  return (
    <div className="mx-auto grid max-w-md gap-6">
      <div className="space-y-1">
        <Label>Checkout</Label>
        <h1 className="text-xl">{plan.name} plan</h1>
      </div>
      <Banner tone="warning">
        Demo checkout: no card is asked for and nothing is charged. Payments are switched on in a later step.
      </Banner>
      <Card className="grid gap-4 p-6">
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Plan</dt><dd className="font-semibold">{plan.name}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Billing</dt><dd>{interval === "year" ? "Yearly" : "Monthly"}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Markets</dt><dd className="text-right">{plan.markets.length === 7 ? "All seven" : plan.markets.join(", ")}</dd></div>
          <div className="flex justify-between border-t pt-2 text-base"><dt>Due today</dt><dd className="tabular font-semibold">{money(total)}</dd></div>
        </dl>
        <p className="text-xs text-muted">Renews every {interval}. Cancel any time from your account; you keep access until the end of the period you paid for.</p>
        {same ? (
          <p className="text-sm">You&apos;re already on this plan. <Link href="/account" className="font-semibold text-accent underline">Manage it</Link></p>
        ) : (
          <form action={confirmCheckout} className="grid gap-2">
            <input type="hidden" name="plan" value={plan.code} />
            <input type="hidden" name="interval" value={interval} />
            <Button type="submit" size="lg">Start {plan.name}</Button>
          </form>
        )}
        <Link href="/pricing" className="text-center text-sm text-muted hover:text-fg">Back to plans</Link>
      </Card>
    </div>
  );
}
