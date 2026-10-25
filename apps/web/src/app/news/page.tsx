import { redirect } from "next/navigation";
import { Newspaper } from "lucide-react";
import { MoodSummary, NewsList } from "@/components/News";
import { FeedManager, MonitorManager } from "@/components/client/NewsManagers";
import { HeadlineNote } from "@/components/client/HeadlineNote";
import { Button, Card, EmptyState, Label, Section } from "@/components/ui";
import { assistantStatus, builtInFeedNames, listAssets, listFeeds, listMonitors, listNews, monitorHits, newsMood, newsSources } from "@/lib/data";
import { NewsQuery } from "@/lib/api/schemas";
import { viewer } from "@/lib/session";

export const metadata = { title: "News" };
const field = "h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-fg";

export default async function News({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/news");
  // Empty choices ("All", "Any") arrive as empty strings: leave them out rather than fail the whole filter.
  const parsed = NewsQuery.safeParse(Object.fromEntries(Object.entries(await searchParams).filter(([, x]) => typeof x === "string" && x.trim())));
  const f = parsed.success ? parsed.data : {};
  const [items, mood, sources, monitors, hits, feeds, ai] = await Promise.all([listNews(v, f), newsMood(v, f.slug), newsSources(v), listMonitors(v), monitorHits(v), listFeeds(v), assistantStatus(v)]);
  const assets = listAssets().filter((a) => a.market !== "bonds");
  const tz = v.user.timezone;
  const filtered = Object.keys(f).length > 0;
  return (
    <div className="space-y-12">
      <div className="space-y-3">
        <Label>News</Label>
        <h1 className="text-xl md:text-display">Market news</h1>
        <p className="max-w-prose text-muted">
          Stories from {builtInFeedNames().join(", ")}, plus any feeds you add, checked every 30 minutes and tagged with the assets they
          mention. Set a monitor to get a push notification when a story matches your keywords.
        </p>
      </div>

      <Section id="feed" title="Latest">
        <form method="get" className="grid gap-3 rounded-lg border bg-surface p-4 md:grid-cols-5 md:items-end">
          <div className="grid gap-1"><label htmlFor="nq" className="text-xs font-semibold">Search</label>
            <input id="nq" name="q" defaultValue={f.q} placeholder="Words in the headline or summary" className={field} /></div>
          <div className="grid gap-1"><label htmlFor="nt" className="text-xs font-semibold">Topic</label>
            <select id="nt" name="topic" defaultValue={f.topic ?? ""} className={field}><option value="">Everything</option><option value="markets">Markets</option><option value="world">World affairs</option></select></div>
          <div className="grid gap-1"><label htmlFor="na" className="text-xs font-semibold">Asset</label>
            <select id="na" name="slug" defaultValue={f.slug ?? ""} className={field}><option value="">All</option>{assets.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select></div>
          <div className="grid gap-1"><label htmlFor="nm" className="text-xs font-semibold">Mood</label>
            <select id="nm" name="mood" defaultValue={f.mood ?? ""} className={field}><option value="">Any</option><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option></select></div>
          <div className="grid gap-1"><label htmlFor="ns" className="text-xs font-semibold">Source</label>
            <select id="ns" name="source" defaultValue={f.source ?? ""} className={field}><option value="">All</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="flex gap-2 md:col-span-5"><Button type="submit" size="sm">Show</Button>{filtered && <a href="/news" className="self-center text-sm font-semibold text-accent underline">Clear filters</a>}</div>
        </form>
        <HeadlineNote configured={ai.configured} />
        <MoodSummary day={mood.day} week={mood.week} what={f.slug ? assets.find((a) => a.slug === f.slug)?.name ?? "this asset" : "every asset"} />
        {items.length ? <NewsList items={items} tz={tz} /> : (
          <Card><EmptyState icon={<Newspaper aria-hidden className="h-6 w-6" />} title={filtered ? "Nothing matches" : "No stories yet"}>
            {filtered ? "Try fewer filters." : "Stories arrive with the next scheduled run, within 30 minutes."}</EmptyState></Card>
        )}
      </Section>

      <Section id="monitors" title="Keyword monitors">
        <MonitorManager monitors={monitors} />
      </Section>

      <Section id="matches" title="Recent matches">
        {hits.length ? <NewsList items={hits.map((h) => h.article)} tz={tz} matched={new Map(hits.map((h) => [h.article.id, `${h.monitor}: ${h.matched.join(", ")}`]))} />
          : <Card><EmptyState title="No matches yet">{monitors.length ? "Stories that match your monitors will show here." : "Add a monitor above to start."}</EmptyState></Card>}
      </Section>

      <Section id="feeds" title="Your feeds">
        <FeedManager feeds={feeds} />
      </Section>
    </div>
  );
}
