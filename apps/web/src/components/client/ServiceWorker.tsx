"use client";
import { useEffect } from "react";

/** Registers /sw.js, which shows alert notifications. It caches nothing. */
export function ServiceWorker() {
  useEffect(() => {
    // Also marks the page as interactive: end-to-end tests wait for this before tapping anything.
    document.documentElement.dataset.hydrated = "1";
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
