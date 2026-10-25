"use client";
// A desk note on the latest headlines, written on request and kept for an hour.
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Markdown } from "../Markdown";
import { Button } from "../ui";
import { toast } from "./Toaster";

export function HeadlineNote({ configured }: { configured: boolean }) {
  const [note, setNote] = useState<{ text: string; count: number; at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    const r = await fetch("/api/v1/assistant/headlines", { method: "POST" });
    const j = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) { toast(j?.message ?? "Couldn't write the note", "error"); return; }
    setNote(j);
  }
  if (!configured) return null;
  return (
    <div className="grid gap-3 rounded-lg border bg-surface p-4">
      {note ? (
        <>
          <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Desk note · {note.count} headlines · {new Date(note.at).toISOString().slice(11, 16)} UTC</p>
          <Markdown text={note.text} />
          <p className="text-xs text-muted">Written by Claude from the headlines only, not the full stories. Check a story before acting on it.</p>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="secondary" onClick={load} loading={busy}><Sparkles aria-hidden className="h-4 w-4" />Summarise the latest headlines</Button>
          <span className="text-xs text-muted">The main themes in a few short paragraphs, with links. About a cent; kept for an hour.</span>
        </div>
      )}
    </div>
  );
}
