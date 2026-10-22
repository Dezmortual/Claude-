"use client";
import { useEffect } from "react";

/** Registers /sw.js, which shows alert notifications. It caches nothing. */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
