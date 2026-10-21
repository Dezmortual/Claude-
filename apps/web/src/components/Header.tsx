import Link from "next/link";
import { Bell, Star } from "lucide-react";
import type { Viewer } from "@/lib/data";
import { ButtonLink } from "./ui";
import { MobileNav } from "./client/MobileNav";
import { ThemeToggle } from "./client/ThemeToggle";

const LINKS = [
  { href: "/forecasts", label: "Forecasts" },
  { href: "/markets/crypto", label: "Markets" },
  { href: "/pricing", label: "Pricing" },
  { href: "/track-record", label: "Track record" },
];

const iconLink = "grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-surface-sunken hover:text-fg";

export function Header({ viewer }: { viewer: Viewer }) {
  const signedIn = !!viewer.user;
  return (
    <header className="sticky top-0 z-header h-header border-b bg-surface">
      <div className="mx-auto flex h-full max-w-wide items-center gap-4 px-4 lg:gap-6 lg:px-6">
        <Link href="/" className="flex items-center gap-2 whitespace-nowrap font-bold text-fg">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-md bg-accent text-sm text-on-accent">A</span>
          App name
        </Link>
        <nav aria-label="Main" className="hidden gap-5 text-sm text-muted md:flex">
          {LINKS.map((l) => <Link key={l.href} href={l.href} className="hover:text-fg">{l.label}</Link>)}
        </nav>
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
          <div className="hidden items-center gap-2 md:flex">
            <ButtonLink href="/sign-in" variant="ghost" size="sm">Sign in</ButtonLink>
            <ButtonLink href="/sign-up" size="sm">Create account</ButtonLink>
          </div>
        )}
        <MobileNav links={LINKS} signedIn={signedIn} />
      </div>
    </header>
  );
}
