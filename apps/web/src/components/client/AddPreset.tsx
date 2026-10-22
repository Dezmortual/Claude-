"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { IndicatorDef } from "@/lib/indicators/presets";
import { Button } from "../ui";
import { toast } from "./Toaster";

/** Copies a library indicator into yours, unchanged. */
export function AddPreset({ preset }: { preset: IndicatorDef }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    const { name, lines, display, buyRule, sellRule } = preset;
    const r = await fetch("/api/v1/me/indicators", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, lines, display, buyRule, sellRule }) });
    setBusy(false);
    if (!r.ok) { toast((await r.json().catch(() => null))?.message ?? "Couldn't add it", "error"); return; }
    toast(`${preset.name} added`);
    router.refresh();
  }
  return <Button size="sm" onClick={add} loading={busy} aria-label={`Add ${preset.name}`}>Add</Button>;
}
