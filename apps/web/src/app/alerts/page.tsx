import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { AlertForm, AlertRow } from "@/components/client/AlertsManager";
import { Banner, Card, EmptyState, Label, Paywall } from "@/components/ui";
import { alertableAssets, getAsset, listAlerts } from "@/lib/data";
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
  const alerts = listAlerts(v);
  const active = alerts.filter((a) => a.isActive).length;
  const limit = v.plan.maxAlerts;
  const limitText = limit === null ? "Your plan has no alert limit." : `${active} of ${limit} active alerts used.`;
  return (
    <>
      {head}
      <Banner tone="warning" className="mb-6">Demo build: alerts are saved, but checking prices and sending emails starts with the live data service.</Banner>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr]">
        <Card className="h-fit space-y-4 p-5">
          <h2 className="text-lg">New alert</h2>
          <AlertForm options={alertableAssets(v)} preset={asset} limitText={limitText} />
        </Card>
        <section aria-labelledby="your-alerts" className="space-y-3">
          <h2 id="your-alerts" className="text-lg">Saved ({alerts.length})</h2>
          {alerts.length ? (
            <ul className="grid gap-2">{alerts.map((a) => <AlertRow key={a.id} alert={a} name={getAsset(a.assetSlug)?.name ?? a.assetSlug} />)}</ul>
          ) : (
            <Card><EmptyState icon={<Bell aria-hidden className="h-6 w-6" />} title="No alerts yet">Create one on the left. A good first one: tell me when Bitcoin&apos;s daily signal turns strong buy.</EmptyState></Card>
          )}
        </section>
      </div>
    </>
  );
}
