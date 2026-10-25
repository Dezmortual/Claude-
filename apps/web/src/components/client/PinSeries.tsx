"use client";
import { Pin, PinOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../ui";
import { toast } from "./Toaster";

export function PinSeries({ id, name, pinned }: { id: string; name: string; pinned: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function flip() {
    setBusy(true);
    const r = await fetch("/api/v1/me/macro-pins", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, on: !pinned }) });
    setBusy(false);
    if (!r.ok) { toast((await r.json().catch(() => null))?.message ?? "That didn't work", "error"); return; }
    toast(pinned ? `${name} taken off the home screen` : `${name} pinned to the home screen`);
    router.refresh();
  }
  return <Button size="sm" variant="secondary" onClick={flip} disabled={busy}>{pinned ? <><PinOff aria-hidden className="h-4 w-4" />Unpin from home</> : <><Pin aria-hidden className="h-4 w-4" />Pin to home</>}</Button>;
}
