"use client";
// F6: mute all, quiet hours, and one email per alert or a daily summary. Each change saves straight away.
import { BellOff, Moon, Mail } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import type { DeliveryPatch, DeliverySettings as Settings } from "@/lib/data";
import { Button, cx } from "../ui";
import { toast } from "./Toaster";

const field = "h-10 rounded-md border border-input bg-surface px-3 text-sm text-fg disabled:opacity-50";
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const MUTES = [["1h", "1 hour"], ["8h", "8 hours"], ["24h", "24 hours"], ["indefinitely", "Until I turn it back on"]] as const;

export function DeliverySettings({ initial, tz }: { initial: Settings; tz: string }) {
  const id = useId();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function save(p: DeliveryPatch, done: string) {
    const before = s;
    // Show the choice straight away; the server's reply replaces it, or puts the old one back on failure.
    setS({ ...s, ...(p.quiet !== undefined ? { quiet: p.quiet } : {}), ...(p.emailMode ? { emailMode: p.emailMode } : {}),
      ...(p.digestHour !== undefined ? { digestHour: p.digestHour } : {}) });
    setBusy(true);
    const r = await fetch("/api/v1/me/delivery", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
    setBusy(false);
    if (!r.ok) { setS(before); toast((await r.json().catch(() => null))?.message ?? "Couldn't save that", "error"); return; }
    setS(await r.json());
    toast(done);
  }

  const until = s.mutedUntil && s.mutedUntil !== "indefinitely"
    ? new Date(s.mutedUntil).toLocaleString("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit" }) : null;
  const quiet = s.quiet ?? { start: 22, end: 7 };

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><BellOff aria-hidden className="h-4 w-4 text-accent" />Mute all alerts</h3>
        <p role="status" className={cx("text-sm", s.mutedUntil ? "font-semibold text-warning" : "text-muted")}>
          {!s.mutedUntil ? "Not muted: alerts are sent as they fire." : until ? `Muted until ${until}. Alerts still fire and are listed below, but nothing is sent.` : "Muted until you turn it back on. Alerts still fire and are listed below, but nothing is sent."}
        </p>
        <div className="flex flex-wrap gap-2">
          {s.mutedUntil
            ? <Button size="sm" onClick={() => save({ muteFor: "off" }, "Alerts unmuted")} loading={busy}>Unmute</Button>
            : MUTES.map(([k, l]) => <Button key={k} size="sm" variant="secondary" disabled={busy} onClick={() => save({ muteFor: k }, `Alerts muted${k === "indefinitely" ? "" : ` for ${l}`}`)}>{k === "indefinitely" ? l : `For ${l}`}</Button>)}
        </div>
      </div>

      <fieldset className="grid gap-2 border-t pt-5">
        <legend className="flex items-center gap-2 text-sm font-semibold"><Moon aria-hidden className="h-4 w-4 text-accent" />Quiet hours</legend>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={!!s.quiet} disabled={busy} className="h-5 w-5 accent-accent"
            onChange={(e) => save({ quiet: e.target.checked ? quiet : null }, e.target.checked ? `Quiet from ${hh(quiet.start)} to ${hh(quiet.end)}` : "Quiet hours off")} />
          Hold alerts overnight
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor={`${id}-qs`}>From</label>
          <select id={`${id}-qs`} value={quiet.start} disabled={!s.quiet || busy} className={field}
            onChange={(e) => save({ quiet: { start: +e.target.value, end: quiet.end } }, "Quiet hours saved")}>
            {HOURS.map((h) => <option key={h} value={h}>{hh(h)}</option>)}
          </select>
          <label htmlFor={`${id}-qe`}>to</label>
          <select id={`${id}-qe`} value={quiet.end} disabled={!s.quiet || busy} className={field}
            onChange={(e) => save({ quiet: { start: quiet.start, end: +e.target.value } }, "Quiet hours saved")}>
            {HOURS.map((h) => <option key={h} value={h}>{hh(h)}</option>)}
          </select>
        </div>
        <p className="text-xs text-muted">Emails wait until quiet hours end. Push notifications are dropped, since a late one is no use.</p>
      </fieldset>

      <fieldset className="grid gap-2 border-t pt-5">
        <legend className="flex items-center gap-2 text-sm font-semibold"><Mail aria-hidden className="h-4 w-4 text-accent" />Alert emails</legend>
        <label className="flex items-center gap-3 text-sm">
          <input type="radio" name={`${id}-mode`} checked={s.emailMode === "instant"} disabled={busy} className="h-5 w-5 accent-accent"
            onChange={() => save({ emailMode: "instant" }, "One email per alert")} />
          One email per alert
        </label>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-3">
            <input type="radio" name={`${id}-mode`} checked={s.emailMode === "digest"} disabled={busy} className="h-5 w-5 accent-accent"
              onChange={() => save({ emailMode: "digest" }, `One summary a day at ${hh(s.digestHour)}`)} />
            One summary a day, at
          </label>
          <label htmlFor={`${id}-dh`} className="sr-only">Summary time</label>
          <select id={`${id}-dh`} value={s.digestHour} disabled={busy} className={field}
            onChange={(e) => save({ digestHour: +e.target.value }, `Summary at ${hh(+e.target.value)}`)}>
            {HOURS.map((h) => <option key={h} value={h}>{hh(h)}</option>)}
          </select>
        </div>
        <p className="text-xs text-muted">Push notifications still arrive as alerts fire. Every alert email has a link that stops that alert.</p>
      </fieldset>
      <p className="text-xs text-muted">Times are in your time zone, {tz}. Change it under <Link href="/account" className="font-semibold text-accent underline">Account</Link>.</p>
    </div>
  );
}
