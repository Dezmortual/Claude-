import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { AlertForm, AlertRow } from "@/components/client/AlertsManager";
import { Card, EmptyState, Label, Paywall } from "@/components/ui";
import { alertEvents, alertableAssets, deliverySettings, getAsset, listAlerts, listIndicators, type AlertEvent } from "@/lib/data";
import { DeliverySettings } from "@/components/client/DeliverySettings";
import { viewer } from "@/lib/session";

export const metadata = { title: "Alerts" };

export default async function Alerts({ searchParams }: { searchParams: Promise<{ asset?: string }> }) {
  const { asset } = await searchParams;
  const v = await viewer();
  if (!v.user) redirect(`/sign-in?next=${encodeURIComponent(`/alerts${asset ? `?asset=${asset}` : ""}`)}`);
  const head = (
    <div className="mb-6 space-y-2"><Label>Alerts</Label><h1 className="text-xl">Your alerts</h1>
      <p className="max-w-prose text-muted">Get told when a price breaks a level or a signal flips, so you don&apos;t have to keep checking.</p></div>
  );
  if (!v.plan.watchlistAlerts) {
    return <>{head}<Paywall planName="Crypto" href="/pricing?plan=crypto&need=watchlist">Alerts start on the <b className="text-fg">Crypto</b> plan.</Paywall></>;
  }
  const [alerts, events, delivery] = await Promise.all([listAlerts(v), alertEvents(v, 15), deliverySettings(v)]);
  const active = alerts.filter((a) => a.isActive).length;
  const limit = v.plan.maxAlerts;
  const limitText = limit === null ? "Your plan has no alert limit." : `${active} of ${limit} active alerts used.`;
  return (
    <>
      {head}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr]">
        <Card className="h-fit space-y-4 p-5">
          <h2 className="text-lg">New alert</h2>
          <AlertForm options={await alertableAssets(v)} preset={asset} limitText={limitText}
            indicators={(await listIndicators(v)).filter((i) => i.buyRule || i.sellRule).map((i) => ({ id: i.id, name: i.name, buy: !!i.buyRule, sell: !!i.sellRule }))} />
        </Card>
        <div className="space-y-8">
        <section aria-labelledby="your-alerts" className="space-y-3">
          <h2 id="your-alerts" className="text-lg">Saved ({alerts.length})</h2>
          {alerts.length ? (
            <ul className="grid gap-2">{alerts.map((a) => <AlertRow key={a.id} alert={a} name={getAsset(a.assetSlug)?.name ?? a.assetSlug} tz={v.user!.timezone} />)}</ul>
          ) : (
            <Card><EmptyState icon={<Bell aria-hidden className="h-6 w-6" />} title="No alerts yet">Create one on the left. A good first one: tell me when Bitcoin&apos;s daily signal turns strong buy.</EmptyState></Card>
          )}
        </section>
        <section id="delivery" aria-labelledby="delivery-h" className="scroll-mt-16 space-y-3">
          <h2 id="delivery-h" className="text-lg">How alerts reach you</h2>
          <Card className="p-5"><DeliverySettings initial={delivery} tz={v.user!.timezone} /></Card>
        </section>
        <section aria-labelledby="recent-alerts" className="space-y-3">
          <h2 id="recent-alerts" className="text-lg">Recently fired</h2>
          {events.length ? (
            <ul className="grid gap-2">{events.map((e) => <EventRow key={e.id} e={e} tz={v.user!.timezone} />)}</ul>
          ) : (
            <p className="text-sm text-muted">Nothing has fired yet. Each alert that fires shows here with the time of the data it was judged on and when it was sent.</p>
          )}
        </section>
        </div>
      </div>
    </>
  );
}

/** F4: when the data was from, when the alert fired and when each channel sent it, so a late alert shows as late. */
function EventRow({ e, tz }: { e: AlertEvent; tz: string }) {
  const t = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const after = (iso: string) => { const m = Math.round((Date.parse(iso) - Date.parse(e.observedAt ?? e.firedAt)) / 60_000); return m < 1 ? "" : ` (${m < 120 ? `${m} min` : `${Math.round(m / 60)} h`} after the data)`; };
  const channel = (name: string, c: AlertEvent["email"]) =>
    c.status === "skipped" ? null : c.sentAt ? `${name} sent ${t(c.sentAt)}${after(c.sentAt)}`
      : `${name} ${c.status === "failed" ? "failed" : c.status === "muted" ? "not sent (muted or quiet hours)" : c.status === "digest" ? "waiting for the daily summary" : "waiting to send"}`;
  return (
    <li className="rounded-lg border bg-surface p-4">
      <p className="text-sm">{e.message}</p>
      <p className="mt-1 text-xs text-muted">
        {e.observedAt && <>Data up to {t(e.observedAt)} · </>}fired {t(e.firedAt)}
        {[channel("email", e.email), channel("push", e.push)].filter(Boolean).map((x) => ` · ${x}`)}
      </p>
    </li>
  );
}
