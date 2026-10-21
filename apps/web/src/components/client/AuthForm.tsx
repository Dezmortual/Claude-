"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { safeNext } from "@/lib/query";

type Mode = "sign-in" | "sign-up" | "forgot" | "reset";

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

export function AuthForm({ mode, next = "/forecasts", token }: { mode: Mode; next?: string; token?: string }) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<null | "reset" | "verify" | "done">(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(f.entries()) as Record<string, string>;
    const errs: Record<string, string> = {};
    if (mode === "reset") {
      if ((body.password ?? "").length < 8) errs.password = "Use at least 8 characters";
      else if (body.password !== body.confirm) errs.confirm = "The passwords don't match";
    }
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
    const payload = mode === "sign-up" ? { ...body, acceptTerms: !!f.get("acceptTerms") } : mode === "reset" ? { token, password: body.password } : body;
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.message ?? "Something went wrong. Try again.");
      return;
    }
    if (mode === "forgot") { setSent("reset"); return; }
    if (mode === "sign-up") { setSent("verify"); return; }
    if (mode === "reset") { setSent("done"); return; }
    router.push(safeNext(next));
    router.refresh();
  }

  if (sent) {
    const copy = {
      reset: ["Check your inbox", "If an account uses that email, a reset link is on its way. It works once and expires in an hour."],
      verify: ["Confirm your email", "We've sent you a link. Open it to finish setting up, then sign in. It expires in 24 hours."],
      done: ["Password changed", "You've been signed out everywhere else. Sign in with your new password."],
    }[sent];
    return (
      <div role="status" className="grid gap-3 text-sm">
        <p className="text-base font-semibold text-fg">{copy[0]}</p>
        <p className="text-muted">{copy[1]}</p>
        <Link href="/sign-in" className="font-semibold text-accent hover:underline">Go to sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {error && <p role="alert" className="rounded-md bg-down-soft p-3 text-sm text-down">{error}</p>}
      {mode === "sign-up" && (
        <Field id={`${id}-name`} label="Name" error={field.name}>
          <input id={`${id}-name`} name="name" autoComplete="name" required maxLength={80} aria-invalid={!!field.name} aria-describedby={field.name ? `${id}-name-err` : undefined} className={input} />
        </Field>
      )}
      {mode !== "reset" && <Field id={`${id}-email`} label="Email" error={field.email}>
        <input id={`${id}-email`} name="email" type="email" autoComplete="email" required inputMode="email" className={input} />
      </Field>}
      {mode !== "forgot" && (
        <Field id={`${id}-pw`} label={mode === "reset" ? "New password" : "Password"} error={field.password}>
          <Password id={`${id}-pw`} name="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} error={field.password} />
        </Field>
      )}
      {(mode === "sign-up" || mode === "reset") && (
        <Field id={`${id}-pw2`} label="Confirm password" error={field.confirm}>
          <Password id={`${id}-pw2`} name="confirm" autoComplete="new-password" error={field.confirm} />
        </Field>
      )}
      {mode === "sign-up" && (
        <>
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
        {{ "sign-in": "Sign in", "sign-up": "Create account", forgot: "Send reset link", reset: "Set new password" }[mode]}
      </button>
    </form>
  );
}
