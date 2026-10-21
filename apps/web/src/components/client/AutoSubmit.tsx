"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Progressive enhancement for a GET filter form: selects apply on change through the client router, so the page
// updates in place and keyboard focus stays on the select. Without JS the Apply button submits the form normally.
export function AutoSubmit({ formId }: { formId: string }) {
  const router = useRouter();
  useEffect(() => {
    const f = document.getElementById(formId) as HTMLFormElement | null;
    if (!f) return;
    const go = (e?: Event) => {
      e?.preventDefault();
      const p = new URLSearchParams();
      for (const [k, v] of new FormData(f).entries()) {
        const s = String(v).trim();
        if (s && s !== "all") p.set(k, s);
      }
      const qs = p.toString();
      router.replace(`${f.getAttribute("action") ?? location.pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    };
    const selects = Array.from(f.querySelectorAll("select"));
    selects.forEach((s) => s.addEventListener("change", go));
    f.addEventListener("submit", go);
    f.querySelector("[data-apply]")?.classList.add("sr-only");
    return () => { selects.forEach((s) => s.removeEventListener("change", go)); f.removeEventListener("submit", go); };
  }, [formId, router]);
  return null;
}
