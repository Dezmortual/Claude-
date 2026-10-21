import { redirect } from "next/navigation";
import { DeleteForm, ProfileForm } from "@/components/client/AccountForms";
import { Button, Card, Label, Section } from "@/components/ui";
import { listAlerts, watchlistSlugs } from "@/lib/data";
import { viewer } from "@/lib/session";
import { signOutAction, signOutEverywhereAction } from "./actions";

export const metadata = { title: "Account" };

export default async function Account() {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/account");
  const [watch, alerts] = await Promise.all([watchlistSlugs(v), listAlerts(v)]);
  return (
    <div className="space-y-10">
      <div className="space-y-2"><Label>Account</Label><h1 className="text-xl">Hello, {v.user.name}</h1></div>

      <Section id="access" title="Access">
        <Card className="space-y-1 p-5">
          <p className="text-lg">{v.plan.name}</p>
          <p className="text-sm text-muted">Every market, timeframe and feature, with no billing. This app is private: only the owner email can sign in.</p>
        </Card>
      </Section>

      <Section id="usage" title="Your setup">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card className="p-4"><Label>Watchlist</Label><p className="mt-1 text-lg">{watch.length} assets</p></Card>
          <Card className="p-4"><Label>Alerts</Label><p className="mt-1 text-lg">{alerts.filter((a) => a.isActive).length} active</p></Card>
        </div>
      </Section>

      <Section id="profile" title="Profile">
        <Card className="max-w-xl p-5"><ProfileForm name={v.user.name} email={v.user.email} timezone={v.user.timezone} /></Card>
      </Section>

      <Section id="danger" title="Sessions and leaving">
        <div className="grid max-w-xl gap-4">
          <div className="flex flex-wrap gap-3">
            <form action={signOutAction}><Button type="submit" variant="secondary">Sign out</Button></form>
            <form action={signOutEverywhereAction}><Button type="submit" variant="ghost">Sign out on every device</Button></form>
          </div>
          <DeleteForm email={v.user.email} />
        </div>
      </Section>
    </div>
  );
}
