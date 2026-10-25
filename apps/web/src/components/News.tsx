// News rows and the mood summary, shared by the News page and asset pages. Every story links out to its source;
// text is plain (feeds are stripped of HTML when read).
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { Article } from "@/lib/data";
import { cx } from "./ui";

const MOOD = { positive: { label: "Positive", cls: "bg-up-soft text-up" }, neutral: { label: "Neutral", cls: "bg-surface-sunken text-muted" },
  negative: { label: "Negative", cls: "bg-down-soft text-down" } } as const;

export function ago(iso: string, now = Date.now()) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

export function MoodChip({ a }: { a: Pick<Article, "mood" | "moodWords"> }) {
  const m = MOOD[a.mood];
  return (
    <span className={cx("inline-flex items-center rounded-pill px-2 py-0.5 text-2xs font-semibold", m.cls)}>
      {m.label}<span className="sr-only"> mood</span>{a.moodWords.length > 0 && <span className="ml-1 font-normal">· {a.moodWords.slice(0, 3).join(", ")}</span>}
    </span>
  );
}

export function NewsList({ items, tz, showAssets = true, matched }: { items: Article[]; tz: string; showAssets?: boolean; matched?: Map<string, string> }) {
  return (
    <ul className="divide-y rounded-lg border bg-surface">
      {items.map((a) => (
        <li key={a.id} className="grid gap-1 p-4">
          <a href={a.url} target="_blank" rel="noopener noreferrer nofollow" className="group inline-flex items-start gap-1 font-semibold hover:underline">
            <span>{a.title}</span><ExternalLink aria-hidden className="mt-1 h-3 w-3 shrink-0 text-subtle" /><span className="sr-only"> (opens {a.source})</span>
          </a>
          {a.summary && <p className="line-clamp-2 text-sm text-muted">{a.summary}</p>}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-semibold text-fg">{a.source}{a.own && " · your feed"}</span>
            <time dateTime={a.publishedAt} title={new Date(a.publishedAt).toLocaleString("en-GB", { timeZone: tz })}>{ago(a.publishedAt)}</time>
            <MoodChip a={a} />
            {matched?.get(a.id) && <span className="rounded-pill bg-accent-soft px-2 py-0.5 text-2xs font-semibold text-accent">{matched.get(a.id)}</span>}
            {showAssets && a.slugs.map((s) => <Link key={s.slug} href={`/assets/${s.slug}#news`} className="rounded-pill border px-2 py-0.5 hover:bg-surface-sunken">{s.name}</Link>)}
          </div>
        </li>
      ))}
    </ul>
  );
}

type Span = { total: number; positive: number; neutral: number; negative: number; mean: number };
export function MoodSummary({ day, week, what }: { day: Span; week: Span; what: string }) {
  const row = (label: string, s: Span) => (
    <div className="grid gap-1">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="text-muted">{s.total ? `${s.total} stories: ${s.positive} positive, ${s.neutral} neutral, ${s.negative} negative` : "No stories"}</span>
      </div>
      {s.total > 0 && (
        <div aria-hidden className="flex h-2 overflow-hidden rounded-pill bg-surface-sunken">
          <span className="bg-up" style={{ width: `${(s.positive / s.total) * 100}%` }} />
          <span className="bg-text-subtle" style={{ width: `${(s.neutral / s.total) * 100}%` }} />
          <span className="bg-down" style={{ width: `${(s.negative / s.total) * 100}%` }} />
        </div>
      )}
    </div>
  );
  return (
    <div className="grid gap-3 rounded-lg border bg-surface p-4">
      {row("Last 24 hours", day)}
      {row("Last 7 days", week)}
      <p className="text-xs text-muted">Mood of the news about {what}, from a word list: words like &ldquo;surges&rdquo; or &ldquo;probe&rdquo; in each headline. A rough read, not a signal.</p>
    </div>
  );
}
