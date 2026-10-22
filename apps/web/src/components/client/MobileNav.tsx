"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function MobileNav({ links, signedIn }: { links: { href: string; label: string }[]; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="grid h-10 w-10 place-items-center rounded-md text-fg hover:bg-surface-sunken md:hidden" aria-label="Menu">
        <Menu aria-hidden className="h-5 w-5" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-modal bg-overlay/50" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-modal w-full max-w-xs bg-surface p-4 shadow-pop">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">Menu</Dialog.Title>
            <Dialog.Close className="grid h-10 w-10 place-items-center rounded-md hover:bg-surface-sunken" aria-label="Close menu">
              <X aria-hidden className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <nav aria-label="Main" className="grid gap-1">
            {[...links, ...(signedIn ? [{ href: "/glance", label: "Glance" }, { href: "/watchlist", label: "Watchlist" }, { href: "/alerts", label: "Alerts" }, { href: "/account", label: "Account" }]
              : [{ href: "/sign-in", label: "Sign in" }, { href: "/sign-up", label: "Create account" }])].map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex min-h-tap items-center rounded-md px-3 text-base hover:bg-surface-sunken">
                {l.label}
              </Link>
            ))}
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
