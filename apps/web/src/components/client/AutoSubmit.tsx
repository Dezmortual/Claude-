"use client";
import { useEffect } from "react";

// Progressive enhancement: selects submit their GET form on change. Without JS the Apply button does it.
export function AutoSubmit({ formId }: { formId: string }) {
  useEffect(() => {
    const f = document.getElementById(formId) as HTMLFormElement | null;
    if (!f) return;
    const submit = () => f.requestSubmit();
    const selects = Array.from(f.querySelectorAll("select"));
    selects.forEach((s) => s.addEventListener("change", submit));
    f.querySelector("[data-apply]")?.classList.add("sr-only");
    return () => selects.forEach((s) => s.removeEventListener("change", submit));
  }, [formId]);
  return null;
}
