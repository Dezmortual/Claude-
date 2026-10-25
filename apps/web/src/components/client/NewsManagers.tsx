"use client";
// Keyword monitors and your own feeds on the News page.
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { Feed, Monitor } from "@/lib/data";
import { Button, cx } from "../ui";
import { toast } from "./Toaster";

const field = "h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-fg";

async function call(method: string, url: string, body?: unknown) {
  const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message ?? "That didn't work");
  return j;
}

export function MonitorManager({ monitors }: { monitors: Monitor[] }) {
  const id = useId();
  const router = useRouter();
  const [label, setLabel] = useState(""), [keywords, setKeywords] = useState("");
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState<Record<string, boolean>>({});
  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try { await fn(); toast(done); router.refresh(); return true; } catch (e) { toast(e instanceof Error ? e.message : String(e), "error"); return false; } finally { setBusy(false); }
  }
  const words = keywords.split(",").map((k) => k.trim()).filter(Boolean);
  return (
    <div className="grid gap-4">
      <form className="grid gap-3 rounded-lg border bg-surface p-4 md:grid-cols-[1fr_2fr_auto] md:items-end"
        onSubmit={async (e) => { e.preventDefault(); if (await run(() => call("POST", "/api/v1/me/news-monitors", { label, keywords: words }), `Watching for ${words.join(", ")}`)) { setLabel(""); setKeywords(""); } }}>
        <div className="grid gap-1"><label htmlFor={`${id}-l`} className="text-xs font-semibold">Monitor name</label>
          <input id={`${id}-l`} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="Rate decisions" className={field} /></div>
        <div className="grid gap-1"><label htmlFor={`${id}-k`} className="text-xs font-semibold">Keywords, separated by commas</label>
          <input id={`${id}-k`} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Fed, rate cut, Powell" className={field} /></div>
        <Button type="submit" disabled={!label.trim() || !words.length || busy}>Add monitor</Button>
      </form>
      {monitors.length > 0 && (
        <ul className="grid gap-2">
          {monitors.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-surface p-3">
              <div className="min-w-0 flex-1">
                <p className={cx("font-semibold", !m.enabled && "text-muted")}>{m.label}</p>
                <p className="text-xs text-muted">{m.keywords.join(", ")} · {m.hits} match{m.hits === 1 ? "" : "es"}</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={on[m.id] ?? m.enabled} disabled={busy} className="h-5 w-5 accent-accent" aria-label={`${m.label} on`}
                  onChange={async (e) => {
                    const want = e.target.checked;
                    setOn({ ...on, [m.id]: want }); // show it straight away; put it back if the save fails
                    if (!(await run(() => call("PATCH", `/api/v1/me/news-monitors/${m.id}`, { enabled: want }), want ? `${m.label} on` : `${m.label} paused`))) setOn({ ...on, [m.id]: !want });
                  }} />
                <span aria-hidden>On</span>
              </label>
              <Button size="sm" variant="ghost" disabled={busy} aria-label={`Delete ${m.label}`}
                onClick={() => run(() => call("DELETE", `/api/v1/me/news-monitors/${m.id}`), `${m.label} deleted`)}><Trash2 aria-hidden className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">New stories are checked every 30 minutes. A match is listed below and sent as a push notification (mute and quiet hours apply). Keywords match whole words, any case.</p>
    </div>
  );
}

export function FeedManager({ feeds }: { feeds: Feed[] }) {
  const id = useId();
  const router = useRouter();
  const [name, setName] = useState(""), [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = await call("POST", "/api/v1/me/news-feeds", { name, url });
      toast(`${f.name} added: ${f.stories} stor${f.stories === 1 ? "y" : "ies"}`); setName(""); setUrl(""); router.refresh();
    } catch (err) { toast(err instanceof Error ? err.message : String(err), "error"); } finally { setBusy(false); }
  }
  async function remove(f: Feed) {
    setBusy(true);
    try { await call("DELETE", `/api/v1/me/news-feeds/${f.id}`); toast(`${f.name} removed`); router.refresh(); }
    catch (err) { toast(err instanceof Error ? err.message : String(err), "error"); } finally { setBusy(false); }
  }
  return (
    <div className="grid gap-4">
      <form onSubmit={add} className="grid gap-3 rounded-lg border bg-surface p-4 md:grid-cols-[1fr_2fr_auto] md:items-end">
        <div className="grid gap-1"><label htmlFor={`${id}-n`} className="text-xs font-semibold">Feed name</label>
          <input id={`${id}-n`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="My favourite blog" className={field} /></div>
        <div className="grid gap-1"><label htmlFor={`${id}-u`} className="text-xs font-semibold">RSS or Atom address</label>
          <input id={`${id}-u`} value={url} inputMode="url" onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/feed.xml" className={field} /></div>
        <Button type="submit" loading={busy} disabled={!name.trim() || !url.trim()}>Add feed</Button>
      </form>
      {feeds.length > 0 && (
        <ul className="grid gap-2">
          {feeds.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-surface p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{f.name}</p>
                <p className="truncate text-xs text-muted">{f.url}</p>
                <p className={cx("text-xs", f.status && f.status !== "ok" ? "text-down" : "text-muted")}>
                  {f.status && f.status !== "ok" ? `Last read failed: ${f.status}` : `${f.stories} stories kept`}
                </p>
              </div>
              <Button size="sm" variant="ghost" disabled={busy} aria-label={`Remove ${f.name}`} onClick={() => remove(f)}><Trash2 aria-hidden className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
