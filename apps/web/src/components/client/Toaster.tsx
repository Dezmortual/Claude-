"use client";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";

type T = { id: number; text: string; tone: "success" | "error" };

export function toast(text: string, tone: T["tone"] = "success") {
  window.dispatchEvent(new CustomEvent("app-toast", { detail: { text, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const { text, tone } = (e as CustomEvent).detail;
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs, { id, text, tone }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 5000);
    };
    window.addEventListener("app-toast", on);
    return () => window.removeEventListener("app-toast", on);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-toast grid w-full max-w-sm gap-2 px-4">
      {items.map((t) => (
        <div key={t.id} role={t.tone === "error" ? "alert" : "status"}
          className="pointer-events-auto flex items-center gap-3 rounded-lg border bg-surface px-4 py-3 text-sm shadow-raised">
          {t.tone === "success" ? <Check aria-hidden className="h-4 w-4 text-up" /> : <X aria-hidden className="h-4 w-4 text-danger" />}
          <span className="flex-1">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
