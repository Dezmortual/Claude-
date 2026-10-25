"use client";
// The research assistant's chat: ask, wait while it looks things up, read the answer with its sources.
import { Search, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/data";
import { Markdown } from "../Markdown";
import { Button, cx } from "../ui";
import { toast } from "./Toaster";

const STARTERS = [
  "What are the strongest signals right now, and does the news agree?",
  "How is my portfolio doing, and where is most of its risk?",
  "What's moving inflation and interest rates this month?",
  "Write a short research note on Bitcoin: price, signals, news and prediction markets.",
];

export function AssistantChat({ conversationId, initial, initialNote, spent, limit }: { conversationId: string | null; initial: ChatMessage[]; initialNote: string | null; spent: number; limit: number }) {
  const id = useId();
  const router = useRouter();
  const [msgs, setMsgs] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(initialNote);
  const [usage, setUsage] = useState({ spent, limit });
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length, busy]);

  async function send(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true); setNote(null);
    setMsgs((m) => [...m, { seq: -1, role: "user", text: q.trim(), tools: [], note: null }]);
    setText("");
    const r = await fetch("/api/v1/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId, text: q }) });
    const j = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) { toast(j?.message ?? "The assistant didn't answer", "error"); setMsgs((m) => m.slice(0, -1)); setText(q); return; }
    setMsgs(j.messages); setNote(j.note); setUsage({ spent: j.spent, limit: j.limit });
    if (!conversationId) router.replace(`/assistant?c=${j.id}`, { scroll: false });
    router.refresh();
  }

  async function remove() {
    if (!conversationId || !confirm("Delete this conversation?")) return;
    const r = await fetch(`/api/v1/assistant/${conversationId}`, { method: "DELETE" });
    if (!r.ok) { toast("Couldn't delete it", "error"); return; }
    toast("Conversation deleted");
    router.push("/assistant"); router.refresh();
  }

  return (
    <div className="grid gap-4">
      {!msgs.length && (
        <div className="grid gap-2 sm:grid-cols-2">
          {STARTERS.map((s) => (
            <button key={s} type="button" onClick={() => send(s)} disabled={busy}
              className="rounded-lg border bg-surface p-4 text-left text-sm hover:bg-surface-sunken disabled:opacity-50">{s}</button>
          ))}
        </div>
      )}
      <ol className="grid gap-4" aria-label="Conversation">
        {msgs.map((m, i) => (
          <li key={`${m.seq}-${i}`} className={cx("grid gap-2 rounded-lg p-4", m.role === "user" ? "ml-8 bg-accent-soft" : "mr-2 border bg-surface")}>
            <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">{m.role === "user" ? "You" : "Assistant"}</p>
            {m.tools.length > 0 && (
              <p className="flex flex-wrap items-center gap-1 text-xs text-muted"><Search aria-hidden className="h-3 w-3" />{m.tools.join(" · ")}</p>
            )}
            {m.role === "user" ? <p className="whitespace-pre-wrap text-sm">{m.text}</p> : m.text ? <Markdown text={m.text} /> : <p className="text-sm text-muted">No answer text.</p>}
          </li>
        ))}
        {busy && <li className="mr-2 rounded-lg border bg-surface p-4 text-sm text-muted" role="status"><Sparkles aria-hidden className="mr-1 inline h-4 w-4 animate-pulse text-accent" />Looking things up and writing an answer. This can take up to a minute.</li>}
      </ol>
      {note && <p role="status" className="rounded-md bg-surface-sunken p-3 text-sm text-warning">{note}</p>}
      <div ref={end} />
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="grid gap-2">
        <label htmlFor={`${id}-q`} className="text-sm font-semibold">{msgs.length ? "Ask a follow-up" : "Ask about markets, your portfolio or the news"}</label>
        <textarea id={`${id}-q`} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(text); } }}
          className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-fg" placeholder="e.g. Why is gold up this week?" />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy} disabled={!text.trim()}>Ask</Button>
          {conversationId && <Button type="button" variant="ghost" onClick={remove} disabled={busy}><Trash2 aria-hidden className="h-4 w-4" />Delete conversation</Button>}
          <span className="text-xs text-muted">Spent today: ${usage.spent.toFixed(2)} of ${usage.limit.toFixed(2)}</span>
        </div>
      </form>
    </div>
  );
}
