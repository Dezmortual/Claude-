"use client";
// A research note that saves itself a second after you stop typing.
import { useEffect, useId, useRef, useState } from "react";

export function NoteEditor({ slug, name, initial }: { slug: string; name: string; initial: string }) {
  const id = useId();
  const [body, setBody] = useState(initial);
  const [state, setState] = useState<"saved" | "editing" | "saving" | "error">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(initial);

  async function save(text: string) {
    setState("saving");
    const r = await fetch(`/api/v1/me/notes/${slug}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: text }) }).catch(() => null);
    if (latest.current === text) setState(r?.ok ? "saved" : "error");
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="grid gap-2">
      <label htmlFor={`${id}-n`} className="sr-only">Your notes on {name}</label>
      <textarea id={`${id}-n`} value={body} rows={5} maxLength={10000} placeholder={`Why you hold or watch ${name}, levels you care about, what would change your mind…`}
        onChange={(e) => { const t = e.target.value; setBody(t); latest.current = t; setState("editing"); clearTimeout(timer.current); timer.current = setTimeout(() => save(t), 1000); }}
        onBlur={() => { if (state === "editing") { clearTimeout(timer.current); save(body); } }}
        className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-fg" />
      <p role="status" className={state === "error" ? "text-xs text-down" : "text-xs text-muted"}>
        {state === "saving" ? "Saving…" : state === "editing" ? "Editing" : state === "error" ? "Couldn't save. Check your connection; your text is still here." : body.trim() ? "Saved" : "Only you can see your notes."}
      </p>
    </div>
  );
}
