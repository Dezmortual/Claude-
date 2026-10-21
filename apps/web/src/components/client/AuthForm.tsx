"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { safeNext } from "@/lib/query";

type Mode = "sign-in" | "sign-up" | "forgot";

const input = "h-12 w-full rounded-md border border-input bg-surface px-3 text-base text-fg placeholder:text-subtle aria-[invalid=true]:border-danger md:h-10 md:text-sm";

function Field({ label, error, children, id }: { label: string; error?: string; children: React.ReactNode; id: string }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      {children}
      {error && <p id={`${id}-err`} className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function Password({ id, name, autoComplete, error }: { id: string; name: string; autoComplete: string; error?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required minLength={name === "password" && autoComplete === "new-password" ? 8 : undefined}
        aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} className={`${input} pr-20`} />
      <button type="button" onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-1 top-1 h-10 rounded-md px-3 text-xs font-semibold text-muted hover:bg-surface-sunken md:top-0">
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export function AuthForm({ mode, next = "/forecasts" }: { mode: Mode; next?: string }) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(f.entries()) as Record<string, string>;
    const errs: Record<string, string> = {};
    if (mode === "sign-up") {
      if (!body.name?.trim()) errs.name = "Enter your name";
      if ((body.password ?? "").length < 8) errs.password = "Use at least 8 characters";
      else if (body.password !== body.confirm) errs.confirm = "The passwords don't match";
      if (!f.get("acceptTerms")) errs.acceptTerms = "Accept the terms to continue";
    }
    setField(errs);
    setError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, acceptTerms: !!f.get("acceptTerms") }) });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.message ?? "Something went wrong. Try again.");
      return;
    }
    if (mode === "forgot") { setSent(true); return; }
    router.push(safeNext(next));
    router.refresh();
  }

  if (sent) {
    return (
      <div role="status" className="grid gap-3 text-sm">
        <p className="text-base font-semibold text-fg">Check your inbox</p>
        <p className="text-muted">If an account uses that email, a reset link is on its way. It expires in an hour.</p>
        <p className="text-muted">Demo build: email sending arrives with the backend, so no message is sent yet.</p>
        <Link href="/sign-in" className="font-semibold text-accent hover:underline">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {mode !== "forgot" && (
        <>
          <button type="button" disabled title="Google sign-in arrives with the backend"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md border bg-surface text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 md:h-10">
            Continue with Google <span className="text-xs font-normal text-muted">(soon)</span>
          </button>
          <div className="flex items-center gap-3 text-xs text-subtle"><span className="h-px flex-1 bg-border" />or with email<span className="h-px flex-1 bg-border" /></div>
        </>
      )}
      {error && <p role="alert" className="rounded-md bg-down-soft p-3 text-sm text-down">{error}</p>}
      {mode === "sign-up" && (
        <Field id={`${id}-name`} label="Name" error={field.name}>
          <input id={`${id}-name`} name="name" autoComplete="name" required maxLength={80} aria-invalid={!!field.name} aria-describedby={field.name ? `${id}-name-err` : undefined} className={input} />
        </Field>
      )}
      <Field id={`${id}-email`} label="Email" error={field.email}>
        <input id={`${id}-email`} name="email" type="email" autoComplete="email" required inputMode="email" className={input} />
      </Field>
      {mode !== "forgot" && (
        <Field id={`${id}-pw`} label="Password" error={field.password}>
          <Password id={`${id}-pw`} name="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} error={field.password} />
        </Field>
      )}
      {mode === "sign-up" && (
        <>
          <Field id={`${id}-pw2`} label="Confirm password" error={field.confirm}>
            <Password id={`${id}-pw2`} name="confirm" autoComplete="new-password" error={field.confirm} />
          </Field>
          <div className="grid gap-1">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="acceptTerms" className="mt-0.5 h-5 w-5 accent-accent" aria-invalid={!!field.acceptTerms} />
              <span>I agree to the <Link href="/legal/terms" className="text-accent underline">Terms</Link> and the <Link href="/legal/privacy" className="text-accent underline">Privacy policy</Link>, and I understand forecasts are not financial advice.</span>
            </label>
            {field.acceptTerms && <p className="text-xs text-danger">{field.acceptTerms}</p>}
          </div>
        </>
      )}
      {mode === "sign-in" && <Link href="/forgot-password" className="justify-self-start text-sm font-semibold text-accent hover:underline">Forgot your password?</Link>}
      <button type="submit" disabled={busy} aria-busy={busy}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-accent text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60 md:h-10">
        {busy && <span aria-hidden className="h-3 w-3 animate-spin rounded-pill border-2 border-current border-r-transparent" />}
        {mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Send reset link"}
      </button>
    </form>
  );
}
