"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the page from the server every `seconds` while it's on screen, and as soon as it comes back into view. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") router.refresh(); };
    const id = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [router, seconds]);
  return null;
}
