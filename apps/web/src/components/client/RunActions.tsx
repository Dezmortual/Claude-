"use client";
import { Pin, PinOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "../ui";
import { toast } from "./Toaster";

export function RunActions({ id, pinned }: { id: string; pinned: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function call(method: "PATCH" | "DELETE", done: string) {
    setBusy(true);
    const r = await fetch(`/api/v1/backtests/${id}`, { method, headers: { "content-type": "application/json" }, body: method === "PATCH" ? JSON.stringify({ pinned: !pinned }) : undefined });
    setBusy(false);
    if (!r.ok) { toast((await r.json().catch(() => null))?.message ?? "That didn't work", "error"); return; }
    toast(done);
    if (method === "DELETE") router.push("/backtest#runs"); else router.refresh();
  }
  return (
    <div className="flex flex-wrap gap-2">
      <ButtonLink href={`/backtest?run=${id}`} size="sm">Open in the lab</ButtonLink>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => call("PATCH", pinned ? "Unpinned" : "Pinned: it won't be cleared out")}>
        {pinned ? <><PinOff aria-hidden className="h-4 w-4" />Unpin</> : <><Pin aria-hidden className="h-4 w-4" />Pin</>}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm("Delete this backtest?")) call("DELETE", "Backtest deleted"); }}>
        <Trash2 aria-hidden className="h-4 w-4" />Delete
      </Button>
    </div>
  );
}
