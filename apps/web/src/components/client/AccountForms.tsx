"use client";
import { useActionState } from "react";
import { deleteAction, saveProfile } from "@/app/account/actions";

const field = "h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-fg";
const ZONES = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo", "Europe/London", "Europe/Berlin",
  "Europe/Istanbul", "Africa/Lagos", "Africa/Johannesburg", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"];

export function ProfileForm({ name, email, timezone }: { name: string; email: string; timezone: string }) {
  const [state, action, pending] = useActionState(saveProfile, null);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-1"><label htmlFor="pf-name" className="text-sm font-semibold">Name</label>
        <input id="pf-name" name="name" defaultValue={name} maxLength={80} required autoComplete="name" className={field} /></div>
      <div className="grid gap-1"><label htmlFor="pf-email" className="text-sm font-semibold">Email</label>
        <input id="pf-email" value={email} readOnly aria-describedby="pf-email-h" className={`${field} bg-surface-sunken text-muted`} />
        <p id="pf-email-h" className="text-xs text-muted">Changing your email comes with the account service.</p></div>
      <div className="grid gap-1"><label htmlFor="pf-tz" className="text-sm font-semibold">Time zone</label>
        <select id="pf-tz" name="timezone" defaultValue={timezone} className={field}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select>
        <p className="text-xs text-muted">Used for every date and time we show you.</p></div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} aria-busy={pending} className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">Save changes</button>
        <span role="status" className={`text-sm ${state?.error ? "text-danger" : "text-up"}`}>{state?.error ?? state?.ok ?? ""}</span>
      </div>
    </form>
  );
}

export function DeleteForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(deleteAction, null);
  return (
    <details className="rounded-md border border-danger p-4">
      <summary className="cursor-pointer font-semibold text-danger">Delete my account</summary>
      <form action={action} className="mt-3 grid gap-3">
        <p className="text-sm text-muted">This removes your account, watchlist, alerts and settings from the database straight away. It can&apos;t be undone.</p>
        <div className="grid gap-1"><label htmlFor="del-confirm" className="text-sm font-semibold">Type <span className="font-mono">{email}</span> to confirm</label>
          <input id="del-confirm" name="confirm" autoComplete="off" aria-invalid={!!state?.error} aria-describedby={state?.error ? "del-err" : undefined} className={field} /></div>
        {state?.error && <p id="del-err" role="alert" className="text-sm text-danger">{state.error}</p>}
        <button type="submit" disabled={pending} className="h-10 justify-self-start rounded-md bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50">Delete account</button>
      </form>
    </details>
  );
}
