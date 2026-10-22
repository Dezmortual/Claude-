import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { AutoRefresh } from "@/components/client/AutoRefresh";
import { Badge, Card, Label, Section, cx } from "@/components/ui";
import { dataStatus } from "@/lib/data";
import { viewer } from "@/lib/session";

export const metadata = { title: "Data status" };

/** Is the data flowing? Each source's last refresh, problems as they open and close, and the scheduled runs. */
export default async function Status() {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/status");
  const s = await dataStatus(v);
  const tz = v.user.timezone;
  const t = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60_000); return m < 1 ? "just now" : m < 120 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
  const open = s.incidents.filter((i) => !i.resolvedAt);
  return (
    <div className="space-y-10">
      <AutoRefresh seconds={60} />
      <div className="space-y-3">
        <Label>Data status</Label>
        <h1 className="text-xl md:text-display">Is the data flowing?</h1>
        <div role="status" className={cx("flex items-start gap-3 rounded-lg p-4", open.length ? "bg-warning-soft" : "bg-up-soft")}>
          {open.length ? <AlertTriangle aria-hidden className="mt-1 h-5 w-5 flex-none text-warning" /> : <CheckCircle2 aria-hidden className="mt-1 h-5 w-5 flex-none text-up" />}
          <div>
            <p className="font-semibold">{open.length ? `${open.length} problem${open.length === 1 ? "" : "s"} right now` : "Everything is running"}</p>
            {open.map((i) => <p key={i.id} className="text-sm">{i.detail} <span className="text-muted">(since {t(i.startedAt)})</span></p>)}
            <p className="text-xs text-muted">You get a push notification and an email when a problem starts and when it clears.</p>
          </div>
        </div>
      </div>

      <Section id="sources" title="Price sources">
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {s.sources.map((x) => (
            <li key={x.source}><Card className="grid h-full gap-1 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{x.label}</h3>
                {x.open ? <Badge tone="warning">Problem</Badge> : <Badge tone="up">OK</Badge>}
              </div>
              <p className="text-sm text-muted">{x.assets} asset{x.assets === 1 ? "" : "s"} · last refreshed {x.lastRefresh ? `${ago(x.lastRefresh)} (${t(x.lastRefresh)})` : "never"}</p>
              {x.open && <p className="text-sm text-warning">{x.open}</p>}
            </Card></li>
          ))}
        </ul>
        {s.demoAssets > 0 && <p className="text-sm text-muted">{s.demoAssets === 1 ? "1 asset runs" : `${s.demoAssets} assets run`} on demo data: {s.demoAssets === 1 ? "its source isn't" : "their sources aren't"} set up. Demo assets are never checked or scored.</p>}
      </Section>

      <Section id="runs" title="Latest scheduled runs">
        <div tabIndex={0} role="region" aria-label="Latest scheduled runs" className="relative overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">Latest scheduled runs, newest first</caption>
            <thead><tr className="text-2xs uppercase tracking-wide text-subtle">
              <th scope="col" className="px-3 py-2 text-left">Started</th><th scope="col" className="px-3 py-2 text-left">Job</th>
              <th scope="col" className="px-3 py-2 text-left">Result</th><th scope="col" className="px-3 py-2 text-right">Took</th>
            </tr></thead>
            <tbody>
              {s.runs.map((r) => (
                <tr key={r.startedAt + r.job} className="border-t">
                  <td className="whitespace-nowrap px-3 py-2">{t(r.startedAt)}</td><td className="px-3 py-2">{r.job}</td>
                  <td className={cx("px-3 py-2 font-semibold", r.status === "ok" ? "text-up" : r.status === "failed" ? "text-down" : "text-muted")}>{r.status === "ok" ? "OK" : r.status === "failed" ? "Failed" : "Running"}</td>
                  <td className="tabular px-3 py-2 text-right">{r.seconds === null ? "—" : `${r.seconds.toFixed(1)} s`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="history" title="Problem history">
        {!s.incidents.length ? <p className="text-sm text-muted">No problems recorded yet.</p> : (
          <ul className="grid gap-2">
            {s.incidents.map((i) => (
              <li key={i.id} className="rounded-lg border bg-surface p-3 text-sm">
                <p>{i.detail}</p>
                <p className="text-xs text-muted">{t(i.startedAt)} → {i.resolvedAt ? t(i.resolvedAt) : <span className="font-semibold text-warning">still open</span>}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
