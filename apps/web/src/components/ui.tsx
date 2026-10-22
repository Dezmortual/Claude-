// Primitives from replica/design/components.md. Tokens only: Tailwind role classes, no hex, no raw px.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, ChevronsDown, ChevronsUp, Info, Lock, SearchX } from "lucide-react";
import { SIGNAL_LABEL, pct } from "@/lib/format";
import type { Verdict } from "@/lib/data";

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

// ---------------------------------------------------------------- Button

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-surface text-fg border hover:bg-surface-sunken",
  ghost: "text-fg hover:bg-surface-sunken",
  danger: "bg-danger text-white hover:opacity-90",
  link: "text-accent underline-offset-4 hover:underline px-0",
};
const SIZE: Record<Size, string> = { sm: "h-8 px-3", md: "h-10 px-4", lg: "h-12 px-5 text-base" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap transition-colors duration-fast",
    "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANT[variant], variant !== "link" && SIZE[size], extra,
  );
}

export function Button({ variant = "primary", size = "md", loading, className, children, ...rest }:
  ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button {...rest} aria-busy={loading || undefined} disabled={rest.disabled || loading} className={buttonClass(variant, size, className)}>
      {loading && <span aria-hidden className="h-3 w-3 animate-spin rounded-pill border-2 border-current border-r-transparent" />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "primary", size = "md", className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...rest} className={buttonClass(variant, size, className)} />;
}

// ---------------------------------------------------------------- Layout bits

export function Card({ className, ...rest }: ComponentProps<"div">) {
  return <div {...rest} className={cx("rounded-lg border bg-surface shadow-card", className)} />;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("text-2xs uppercase tracking-wide text-subtle", className)}>{children}</span>;
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 space-y-2">
      {eyebrow && <Label>{eyebrow}</Label>}
      <h1 className="text-xl text-fg">{title}</h1>
      {children && <div className="max-w-prose text-base text-muted">{children}</div>}
    </div>
  );
}

export function Section({ id, title, action, children, className }: { id?: string; title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className={cx("scroll-mt-16 space-y-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={id ? `${id}-h` : undefined} className="text-lg text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- Badges and data display

const BADGE = {
  neutral: "bg-surface-sunken text-muted",
  accent: "bg-accent-soft text-accent",
  warning: "bg-warning-soft text-warning",
  up: "bg-up-soft text-up",
  down: "bg-down-soft text-down",
};

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof BADGE; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-pill px-2 text-xs font-semibold", BADGE[tone], className)}>{children}</span>;
}

const SIGNAL_CLASS: Record<Verdict, string> = {
  strong_buy: "bg-up-soft text-signal-strong-buy font-bold",
  buy: "bg-up-soft text-signal-buy",
  neutral: "bg-surface-sunken text-signal-neutral",
  sell: "bg-down-soft text-signal-sell",
  strong_sell: "bg-down-soft text-signal-strong-sell font-bold",
  unavailable: "bg-surface-sunken text-subtle",
};

export function SignalBadge({ signal, pUp, className }: { signal: Verdict; pUp?: number | null; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-pill px-2 text-xs font-semibold", SIGNAL_CLASS[signal], className)}>
      {signal === "strong_buy" && <ChevronsUp aria-hidden className="h-4 w-4" />}
      {signal === "strong_sell" && <ChevronsDown aria-hidden className="h-4 w-4" />}
      {SIGNAL_LABEL[signal]}
      {pUp != null && <span className="font-medium">· {Math.round(pUp * 100)}% up</span>}
    </span>
  );
}

export function TrendPill({ tone, children }: { tone: "up" | "down" | "flat"; children: ReactNode }) {
  return (
    <span className={cx("inline-flex h-6 items-center whitespace-nowrap rounded-pill border border-current px-2 text-xs font-medium",
      tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-flat")}>{children}</span>
  );
}

export function PriceChange({ value, suffix, className, bold }: { value: number | null | undefined; suffix?: string; className?: string; bold?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className={cx("text-subtle", className)}>—</span>;
  const dir = value > 0.005 ? "up" : value < -0.005 ? "down" : "flat";
  const word = dir === "up" ? "up" : dir === "down" ? "down" : "unchanged";
  return (
    <span className={cx("tabular whitespace-nowrap", dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-flat", bold && "font-semibold", className)}>
      <span aria-hidden>{dir === "up" ? "▲ " : dir === "down" ? "▼ " : "– "}</span>
      <span aria-hidden>{pct(value)}{suffix ? ` ${suffix}` : ""}</span>
      <span className="sr-only">{word} {Math.abs(value).toFixed(2)} percent{suffix ? ` ${suffix}` : ""}</span>
    </span>
  );
}

export function AssetMark({ ticker }: { ticker: string }) {
  return (
    <span aria-hidden className="grid h-6 w-6 flex-none place-items-center rounded-pill bg-accent-soft text-2xs font-bold text-accent">
      {ticker.replace(/[^A-Z0-9]/gi, "").slice(0, 1)}
    </span>
  );
}

export function AssetCell({ name, ticker, href, demo }: { name: string; ticker: string; href: string; demo?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <AssetMark ticker={ticker} />
      <div className="min-w-0">
        <Link href={href} prefetch={false} title={name} className="block truncate font-semibold text-fg hover:underline">{name}</Link>
        <span className="font-mono text-xs text-subtle">{ticker}</span>{demo && <Badge tone="warning" className="ml-2">Demo</Badge>}
      </div>
    </div>
  );
}

export function StatCard({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "up" | "down" | "muted" }) {
  return (
    <Card className="p-4">
      <Label>{label}</Label>
      <div className={cx("tabular mt-1 text-xl", tone === "up" ? "text-up" : tone === "down" ? "text-down" : tone === "muted" ? "text-subtle" : "text-fg")}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

// ---------------------------------------------------------------- Feedback

const BANNER = {
  info: { cls: "bg-accent-soft text-accent", Icon: Info },
  warning: { cls: "bg-warning-soft text-warning", Icon: AlertTriangle },
  risk: { cls: "bg-surface-sunken text-muted", Icon: Info },
};

export function Banner({ tone = "info", children, className }: { tone?: keyof typeof BANNER; children: ReactNode; className?: string }) {
  const { cls, Icon } = BANNER[tone];
  return (
    <div role={tone === "warning" ? "status" : undefined} className={cx("flex gap-3 rounded-md p-3 text-sm", cls, className)}>
      <Icon aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-4 py-10 text-center">
      <span className="text-subtle">{icon ?? <SearchX aria-hidden className="h-6 w-6" />}</span>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx("block h-3 animate-pulse rounded-sm bg-surface-sunken", className)} />;
}

export function Paywall({ planName, href, children, compact }: { planName: string; href: string; children?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx("flex flex-wrap items-center gap-3 rounded-md border border-dashed bg-surface-sunken text-sm", compact ? "p-3" : "p-5")}>
      <Lock aria-hidden className="h-4 w-4 flex-none text-subtle" />
      <span className="min-w-0 flex-1 text-muted">{children ?? <>This is on the <b className="text-fg">{planName}</b> plan.</>}</span>
      <ButtonLink href={href} size="sm">See {planName}</ButtonLink>
    </div>
  );
}

/** Shown on every data surface while the data layer is the demo one. */
export function DemoNote({ className }: { className?: string }) {
  return (
    <Badge tone="warning" className={className}>
      Demo data
    </Badge>
  );
}
