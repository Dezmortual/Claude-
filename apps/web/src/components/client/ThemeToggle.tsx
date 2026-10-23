"use client";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

// Sets data-theme on <html>; with no stored choice the OS decides (tokens.css media query).
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setDark(t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  const flip = () => {
    // Read the theme in force now rather than state, which is still unset if the tap comes before the first effect.
    const t = document.documentElement.dataset.theme;
    const isDark = t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
    setDark(!isDark);
  };
  return (
    <button type="button" onClick={flip} aria-pressed={dark ?? false} aria-label="Dark theme"
      className="grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-surface-sunken hover:text-fg">
      {dark ? <Moon aria-hidden className="h-4 w-4" /> : <Sun aria-hidden className="h-4 w-4" />}
    </button>
  );
}

/** Inline before paint so a stored theme never flashes. */
export const themeScript = `try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;
