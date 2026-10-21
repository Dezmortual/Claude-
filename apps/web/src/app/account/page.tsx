import { redirect } from "next/navigation";
import { DeleteForm, ProfileForm } from "@/components/client/AccountForms";
import { Badge, Banner, Button, ButtonLink, Card, Label, Section } from "@/components/ui";
import { listAlerts, watchlistSlugs } from "@/lib/data";
import { dateTime, money } from "@/lib/format";
import { viewer } from "@/lib/session";
import { signOutAction, toggleCancel } from "./actions";

export const metadata = { title: "Account" };

export default async function Account({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/account");
  const { welcome } = await searchParams;
  const s = v.subscription;
  const tz = v.user.timezone;
  return (
    <div className="space-y-10">
      <div className="space-y-2"><Label>Account</Label><h1 className="text-xl">Hello, {v.user.name}</h1></div>
      {welcome && s && <Banner>You&apos;re on the {v.plan.name} plan. Everything it includes is unlocked now.</Banner>}

      <Section id="billing" title="Plan and billing">
        <Card className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-lg">{v.plan.name} {s?.cancelAtPeriodEnd && <Badge tone="warning">Ends {dateTime(s.currentPeriodEnd, tz).split(",")[0]}</Badge>}</p>
            {s ? (
              <p className="text-sm text-muted">
                {money(s.interval === "year" ? v.plan.priceYearCents : v.plan.priceMonthCents)} a {s.interval}.{" "}
                {s.cancelAtPeriodEnd ? `Access continues until ${dateTime(s.currentPeriodEnd, tz)}, then you move to Free.` : `Renews on ${dateTime(s.currentPeriodEnd, tz)}.`}
              </p>
            ) : <p className="text-sm text-muted">The 10 largest crypto assets and daily signals.</p>}
            <p className="text-xs text-subtle">Demo billing: no card on file and nothing is charged.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/pricing" variant={s ? "secondary" : "primary"}>{s ? "Change plan" : "Upgrade"}</ButtonLink>
            {s && (
              <form action={toggleCancel}>
                {s.cancelAtPeriodEnd && <input type="hidden" name="resume" value="1" />}
                <Button type="submit" variant="ghost">{s.cancelAtPeriodEnd ? "Keep my plan" : "Cancel plan"}</Button>
              </form>
            )}
          </div>
        </Card>
      </Section>

      <Section id="usage" title="Your setup">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card className="p-4"><Label>Watchlist</Label><p className="mt-1 text-lg">{watchlistSlugs(v).length} assets</p></Card>
          <Card className="p-4"><Label>Alerts</Label><p className="mt-1 text-lg">{v.plan.watchlistAlerts ? `${listAlerts(v).filter((a) => a.isActive).length} active` : "Not on this plan"}</p></Card>
        </div>
      </Section>

      <Section id="profile" title="Profile">
        <Card className="max-w-xl p-5"><ProfileForm name={v.user.name} email={v.user.email} timezone={tz} /></Card>
      </Section>

      <Section id="danger" title="Sign out or leave">
        <div className="grid max-w-xl gap-4">
          <form action={signOutAction}><Button type="submit" variant="secondary">Sign out</Button></form>
          <DeleteForm email={v.user.email} />
        </div>
      </Section>
    </div>
  );
}
