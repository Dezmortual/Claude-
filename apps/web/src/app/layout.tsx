import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { themeScript } from "@/components/client/ThemeToggle";
import { Toaster } from "@/components/client/Toaster";
import { ServiceWorker } from "@/components/client/ServiceWorker";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { privateMode } from "@/lib/data";
import { viewer } from "@/lib/session";
import { appUrl } from "@/lib/appurl";
import { guestHome, isPublicPath } from "@/lib/paths";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()), // absolute URL for the social image
  title: { default: "FXDEZ: price forecasts with every result kept", template: "%s · FXDEZ" },
  robots: { index: false, follow: false }, // private build: keep it out of search engines
  appleWebApp: { capable: true, title: "FXDEZ", statusBarStyle: "black-translucent" },
  description: "Short-term forecasts, technical signals and long-term scenarios for crypto and other markets, with every forecast scored in public.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0f18" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const v = await viewer();
  const path = (await headers()).get("x-pathname") ?? "/";
  const isPublic = isPublicPath(path);
  if (privateMode() && !v.user && !isPublic) redirect(path === "/" ? guestHome() : `/sign-in?next=${encodeURIComponent(path)}`);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-md focus:bg-surface focus:p-3">
          Skip to content
        </a>
        <Header viewer={v} />
        <main id="main" className="mx-auto max-w-content px-4 py-8 lg:px-6">{children}</main>
        <Footer />
        <Toaster />
        <ServiceWorker />
      </body>
    </html>
  );
}
