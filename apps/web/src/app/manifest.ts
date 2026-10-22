import type { MetadataRoute } from "next";

// Makes the app installable ("Add to Home Screen"). The icon is full-bleed with the mark inside the maskable safe zone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Proofcast", short_name: "Proofcast", description: "Price forecasts with every result kept.",
    start_url: "/", scope: "/", display: "standalone", background_color: "#2a0b22", theme_color: "#2a0b22",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the app icon to see these. On Android each can be dragged out as its own home-screen icon.
    shortcuts: [
      { name: "Glance", short_name: "Glance", description: "Your watchlist and latest alerts on one screen", url: "/glance", icons: [{ src: "/icons/shortcuts/glance.png", sizes: "96x96", type: "image/png" }] },
      { name: "Watchlist", short_name: "Watchlist", url: "/watchlist", icons: [{ src: "/icons/shortcuts/watchlist.png", sizes: "96x96", type: "image/png" }] },
      { name: "Alerts", short_name: "Alerts", url: "/alerts", icons: [{ src: "/icons/shortcuts/alerts.png", sizes: "96x96", type: "image/png" }] },
      { name: "Indicators", short_name: "Indicators", url: "/indicators", icons: [{ src: "/icons/shortcuts/indicators.png", sizes: "96x96", type: "image/png" }] },
    ],
  };
}
