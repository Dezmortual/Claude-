"use client";
import { Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "./Toaster";

type Mode = "guest" | "no-plan" | "ok";

export function WatchStar({ slug, name, on: initial, mode, withLabel }: { slug: string; name: string; on: boolean; mode: Mode; withLabel?: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const cls = "inline-flex h-10 min-w-tap items-center justify-center gap-2 rounded-md px-2 text-sm font-semibold hover:bg-surface-sunken disabled:opacity-50";
  const label = on ? `Remove ${name} from watchlist` : `Add ${name} to watchlist`;
  const icon = <Star aria-hidden className={`h-4 w-4 ${on ? "fill-current text-accent" : "text-muted"}`} />;

  if (mode === "guest") return <Link href={`/sign-in?next=/assets/${slug}`} className={cls} aria-label={`Sign in to watch ${name}`}>{icon}{withLabel && "Watch"}</Link>;
  if (mode === "no-plan") return <Link href="/pricing?need=watchlist" className={cls} aria-label={`Watchlists start on the Crypto plan`}>{icon}{withLabel && "Watch"}</Link>;

  async function flip() {
    setBusy(true);
    const res = on
      ? await fetch(`/api/v1/me/watchlist/${slug}`, { method: "DELETE" })
      : await fetch("/api/v1/me/watchlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asset: slug }) });
    setBusy(false);
    if (res.ok || res.status === 409) {
      setOn(!on);
      toast(on ? `${name} removed from your watchlist` : `${name} added to your watchlist`);
      router.refresh();
    } else {
      toast((await res.json().catch(() => null))?.message ?? "Couldn't update your watchlist", "error");
    }
  }
  return (
    <button type="button" onClick={flip} disabled={busy} aria-pressed={on} aria-label={withLabel ? undefined : label} className={cls}>
      {icon}{withLabel && (on ? "Watching" : "Watch")}
    </button>
  );
}
