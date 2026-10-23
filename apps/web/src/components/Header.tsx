import Link from "next/link";
import { Bell, Star } from "lucide-react";
import type { Viewer } from "@/lib/data";
import { ButtonLink } from "./ui";
import { MobileNav } from "./client/MobileNav";
import { ThemeToggle } from "./client/ThemeToggle";

const LINKS = [
  { href: "/forecasts", label: "Forecasts" },
  { href: "/markets/crypto", label: "Markets" },
  { href: "/trade", label: "Trade" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/indicators", label: "Indicators" },
  { href: "/track-record", label: "Track record" },
];

const iconLink = "grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-surface-sunken hover:text-fg";

export function Header({ viewer }: { viewer: Viewer }) {
  const signedIn = !!viewer.user;
  return (
    <header className="sticky top-0 z-header h-header border-b bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-wide items-center gap-4 px-4 lg:gap-6 lg:px-6">
        <Link href="/" className="flex items-center gap-2 whitespace-nowrap font-bold text-fg">
          {/* The FX mark on its own dark tile reads the same in light and dark mode. */}
          <img src="/brand/mark-64.png" alt="" width={32} height={32} className="h-8 w-8 rounded-md" />
          FXDEZ
        </Link>
        {signedIn && <nav aria-label="Main" className="hidden gap-5 text-sm text-muted md:flex">
          {LINKS.map((l) => <Link key={l.href} href={l.href} className="hover:text-fg">{l.label}</Link>)}
        </nav>}
        <div className="flex-1" />
        {signedIn && (
          <>
            <Link href="/watchlist" className={`${iconLink} hidden md:grid`} aria-label="Watchlist"><Star aria-hidden className="h-4 w-4" /></Link>
            <Link href="/alerts" className={`${iconLink} hidden md:grid`} aria-label="Alerts"><Bell aria-hidden className="h-4 w-4" /></Link>
          </>
        )}
        <ThemeToggle />
        {signedIn ? (
          <Link href="/account" className="hidden h-8 w-8 place-items-center rounded-pill bg-accent-soft text-xs font-bold text-accent md:grid" aria-label={`Account: ${viewer.user!.name}`}>
            {viewer.user!.name.slice(0, 1).toUpperCase()}
          </Link>
        ) : (
          <ButtonLink href="/sign-in" variant="ghost" size="sm" className="hidden md:inline-flex">Sign in</ButtonLink>
        )}
        {signedIn && <MobileNav links={LINKS} signedIn={signedIn} />}
      </div>
    </header>
  );
}
