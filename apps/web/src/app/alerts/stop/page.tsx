import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, Card, Label } from "@/components/ui";
import { alertByStopToken, stopAlertByToken } from "@/lib/data";
import { describeAlert as describe } from "@/lib/format";

export const metadata = { title: "Stop an alert" };

/** The stop link in alert emails. It asks before stopping: mail scanners open links, and an open alone shouldn't
 *  switch anything off. Mail apps' own unsubscribe button stops it in one click via the API. */
export default async function StopAlert({ searchParams }: { searchParams: Promise<{ t?: string; done?: string }> }) {
  const { t = "", done } = await searchParams;
  const found = await alertByStopToken(t);
  async function stop() {
    "use server";
    await stopAlertByToken(t);
    redirect(`/alerts/stop?t=${t}&done=1`);
  }
  return (
    <div className="mx-auto max-w-prose space-y-4">
      <Label>Alerts</Label>
      {!found ? (
        <>
          <h1 className="text-xl">This stop link isn&apos;t valid</h1>
          <p className="text-muted">The alert may have been deleted. You can manage every alert on the <Link href="/alerts" className="font-semibold text-accent underline">Alerts</Link> page.</p>
        </>
      ) : !found.alert.isActive ? (
        <>
          <h1 className="text-xl">{done ? "Stopped" : "Already stopped"}</h1>
          <Card className="p-4 text-sm">{describe(found.alert, found.assetName)}</Card>
          <p className="text-muted">You won&apos;t get this alert again. It&apos;s paused, not deleted: turn it back on any time on the <Link href="/alerts" className="font-semibold text-accent underline">Alerts</Link> page.</p>
        </>
      ) : (
        <>
          <h1 className="text-xl">Stop this alert?</h1>
          <Card className="p-4 text-sm">{describe(found.alert, found.assetName)}</Card>
          <form action={stop}><Button type="submit">Stop this alert</Button></form>
          <p className="text-sm text-muted">To pause everything for a while, or get one summary a day instead, use the delivery settings on the <Link href="/alerts#delivery" className="font-semibold text-accent underline">Alerts</Link> page.</p>
        </>
      )}
    </div>
  );
}
