import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { themeScript } from "@/components/client/ThemeToggle";
import { Toaster } from "@/components/client/Toaster";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { privateMode } from "@/lib/data";
import { viewer } from "@/lib/session";
import { isPublicPath } from "@/lib/paths";

export const metadata: Metadata = {
  title: { default: "Proofcast: price forecasts with every result kept", template: "%s · Proofcast" },
  robots: { index: false, follow: false }, // private build: keep it out of search engines
  description: "Short-term forecasts, technical signals and long-term scenarios for crypto and other markets, with every forecast scored in public.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const v = await viewer();
  const path = (await headers()).get("x-pathname") ?? "/";
  const isPublic = isPublicPath(path);
  if (privateMode() && !v.user && !isPublic) redirect(path === "/" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(path)}`);
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
      </body>
    </html>
  );
}
