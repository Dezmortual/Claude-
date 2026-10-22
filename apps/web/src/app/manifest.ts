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
  };
}
