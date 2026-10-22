// Proofcast service worker: shows alert notifications and opens the asset when one is tapped.
// It caches nothing, so every page is always fresh from the server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Proofcast", {
    body: d.body || "", tag: d.tag, data: { url: d.url || "/alerts" },
    icon: "/icons/icon-192.png", badge: "/icons/badge-96.png",
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const tab = tabs.find((c) => c.url.startsWith(self.location.origin));
    if (tab) { await tab.focus(); return tab.navigate(url); }
    return self.clients.openWindow(url);
  })());
});
