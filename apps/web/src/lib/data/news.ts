import "server-only";
// News: ingest from Alpaca and RSS, tag stories to assets, score their mood, match keyword monitors, push the matches.
import { sql } from "@/lib/server/db";
import { pushConfigured, sendPush } from "@/lib/server/push";
import { ASSETS, ASSET_BY_SLUG } from "./catalogue";
import { requireUser } from "./live";
import { DataError, type Viewer } from "./types";
import { alpacaNews, builtInFeeds, checkFeedUrl, fetchFeed, type RawStory } from "./sources/news";
import { matchesKeywords } from "../news/feed";
import { scoreText, type Mood } from "../news/sentiment";

/** Sources of the world-affairs topic; everything else counts as markets news. */
const world = () => { const w = builtInFeeds().filter((f) => f.topic === "world").map((f) => f.name); return w.length ? w : ["-"]; };
export const builtInFeedNames = () => ["Alpaca", ...builtInFeeds().map((f) => f.name)];
export const MAX_FEEDS = 10, MAX_MONITORS = 20, KEEP_DAYS = 45;

// ---------------------------------------------------------------- tagging

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Per asset: the API symbols that mean it, and the words in a headline that do. */
const TAGS = ASSETS.filter((a) => a.market !== "bonds").map((a) => {
  const t = a.ticker.toUpperCase().replace(/\/.*/, "");
  const symbols = new Set([t, a.ticker.toUpperCase(), `${t}USD`, `${t}/USD`, ...(a.meta.proxy ? [String(a.meta.proxy).toUpperCase()] : [])]);
  const words = [a.name.length >= 4 ? new RegExp(`\\b${escape(a.name)}\\b`, "i") : null,
    t.length >= 3 && a.market !== "forex" ? new RegExp(`(^|[^A-Za-z])\\$?${escape(t)}(?=$|[^A-Za-z])`) : null,
    a.market === "forex" ? new RegExp(escape(a.ticker), "i") : null].filter(Boolean) as RegExp[];
  return { slug: a.slug, symbols, words };
});

export function tagStory(s: { title: string; summary: string; symbols: string[] }): string[] {
  const syms = new Set(s.symbols.map((x) => x.toUpperCase()));
  const text = `${s.title} ${s.summary}`;
  return TAGS.filter((t) => [...t.symbols].some((x) => syms.has(x)) || t.words.some((re) => re.test(text))).map((t) => t.slug).slice(0, 8);
}

// ---------------------------------------------------------------- ingest

type Inserted = { id: string; title: string; summary: string; feed_id: string | null };

async function store(stories: RawStory[], feedId: string | null): Promise<Inserted[]> {
  const out: Inserted[] = [];
  const db = sql();
  for (const s of stories) {
    const at = s.publishedAt && s.publishedAt.getTime() <= Date.now() + 3_600_000 ? s.publishedAt : new Date();
    if (Date.now() - at.getTime() > KEEP_DAYS * 86_400_000) continue;
    const m = scoreText(`${s.title}. ${s.summary}`);
    const [r] = await db<Inserted[]>`insert into news_articles (feed_id, source, url, title, summary, published_at, slugs, sentiment, mood, mood_words)
      values (${feedId}, ${s.source}, ${s.url}, ${s.title}, ${s.summary}, ${at}, ${tagStory(s)}, ${m.score}, ${m.label}, ${m.words})
      on conflict do nothing returning id, title, summary, feed_id`;
    if (r) out.push(r);
  }
  return out;
}

/** The scheduled news run: every source, then monitors, then pushes. A failing source doesn't stop the others. */
export async function ingestNews(now = new Date(), silenced: (u: Delivery) => boolean = () => false) {
  const db = sql();
  const problems: string[] = [];
  const fresh: Inserted[] = [];
  const [{ last }] = await db<{ last: Date | null }[]>`select max(published_at) as last from news_articles where feed_id is null and source not in ${db(builtInFeeds().map((f) => f.name))}`;
  try { fresh.push(...(await store(await alpacaNews(last ?? new Date(now.getTime() - 86_400_000)), null))); } catch (e) { problems.push(`Alpaca: ${e instanceof Error ? e.message : e}`); }
  for (const f of builtInFeeds()) {
    try { fresh.push(...(await store(await fetchFeed(f.name, f.url), null))); } catch (e) { problems.push(`${f.name}: ${e instanceof Error ? e.message : e}`); }
  }
  for (const f of await db<{ id: string; name: string; url: string }[]>`select id, name, url from news_feeds`) {
    let status = "ok";
    try { fresh.push(...(await store(await fetchFeed(f.name, f.url, true), f.id))); } catch (e) { status = e instanceof Error ? e.message : String(e); }
    await db`update news_feeds set last_status = ${status.slice(0, 200)}, last_polled_at = ${now} where id = ${f.id}`;
  }
  const hits = await matchMonitors(fresh);
  const pushed = await pushHits(now, silenced);
  await db`delete from news_articles where published_at < ${new Date(now.getTime() - KEEP_DAYS * 86_400_000)}`;
  if (problems.length) console.error(`news: ${problems.join("; ")}`);
  return { new: fresh.length, hits, pushed, problems };
}

async function matchMonitors(articles: Inserted[]): Promise<number> {
  if (!articles.length) return 0;
  const db = sql();
  const monitors = await db<{ id: string; user_id: string; keywords: string[] }[]>`select id, user_id, keywords from news_monitors where enabled`;
  const ownFeeds = new Map((await db<{ id: string; user_id: string }[]>`select id, user_id from news_feeds`).map((f) => [f.id, f.user_id]));
  let n = 0;
  for (const a of articles) {
    for (const m of monitors) {
      if (a.feed_id && ownFeeds.get(a.feed_id) !== m.user_id) continue; // someone else's feed
      const matched = matchesKeywords(`${a.title} ${a.summary}`, m.keywords);
      if (!matched.length) continue;
      await db`insert into news_hits (monitor_id, article_id, matched) values (${m.id}, ${a.id}, ${matched}) on conflict do nothing`;
      n++;
    }
  }
  return n;
}

/** One notification per owner per run, naming the monitor and the story (or how many). Mute and quiet hours drop it. */
export type Delivery = { timezone: string; alerts_muted_until: Date | null; quiet_start: number | null; quiet_end: number | null };

async function pushHits(now: Date, silenced: (u: Delivery) => boolean): Promise<number> {
  const db = sql();
  const rows = await db<{ monitor_id: string; article_id: string; user_id: string; label: string; title: string; timezone: string;
    alerts_muted_until: Date | null; quiet_start: number | null; quiet_end: number | null }[]>`
    select h.monitor_id, h.article_id, m.user_id, m.label, a.title, u.timezone, u.alerts_muted_until, u.quiet_start, u.quiet_end
    from news_hits h join news_monitors m on m.id = h.monitor_id join news_articles a on a.id = h.article_id join users u on u.id = m.user_id
    where h.pushed_at is null order by a.published_at desc`;
  if (!rows.length) return 0;
  await db`update news_hits set pushed_at = ${now} where pushed_at is null`;
  if (!pushConfigured()) return 0;
  const byUser = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  let pushed = 0;
  for (const [userId, hs] of byUser) {
    const u = hs[0];
    if (silenced(u)) continue;
    const labels = [...new Set(hs.map((h) => h.label))];
    const msg = hs.length === 1
      ? { title: `News: ${u.label}`, body: u.title, url: "/news#matches", tag: "news" }
      : { title: `${hs.length} news matches`, body: `${labels.slice(0, 3).join(", ")}${labels.length > 3 ? "…" : ""}: ${hs[0].title}`, url: "/news#matches", tag: "news" };
    const r = await sendPush(userId, msg).catch((e) => { console.error(`news push: ${e}`); return null; });
    if (r?.sent) pushed++;
  }
  return pushed;
}

// ---------------------------------------------------------------- reading

export type Article = { id: string; source: string; url: string; title: string; summary: string; publishedAt: string; slugs: { slug: string; name: string }[];
  mood: Mood; sentiment: number; moodWords: string[]; own: boolean };
type ArticleRow = { id: string; source: string; url: string; title: string; summary: string; published_at: Date; slugs: string[]; mood: Mood;
  sentiment: number; mood_words: string[]; feed_id: string | null };
const toArticle = (r: ArticleRow): Article => ({ id: r.id, source: r.source, url: r.url, title: r.title, summary: r.summary, publishedAt: r.published_at.toISOString(),
  slugs: r.slugs.filter((s) => ASSET_BY_SLUG.has(s)).map((s) => ({ slug: s, name: ASSET_BY_SLUG.get(s)!.name })), mood: r.mood, sentiment: r.sentiment,
  moodWords: r.mood_words, own: !!r.feed_id });

export type NewsQuery = { q?: string; slug?: string; mood?: Mood; source?: string; topic?: "markets" | "world"; limit?: number };

export async function listNews(v: Viewer, f: NewsQuery = {}): Promise<Article[]> {
  const u = requireUser(v);
  const db = sql();
  const like = f.q?.trim() ? `%${f.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const rows = await db<ArticleRow[]>`select id, source, url, title, summary, published_at, slugs, mood, sentiment, mood_words, feed_id from news_articles
    where (feed_id is null or feed_id in (select id from news_feeds where user_id = ${u.id}))
      ${like ? db`and (title ilike ${like} or summary ilike ${like})` : db``}
      ${f.slug ? db`and ${f.slug} = any(slugs)` : db``}
      ${f.mood ? db`and mood = ${f.mood}` : db``}
      ${f.source ? db`and source = ${f.source}` : db``}
      ${f.topic === "world" ? db`and source in ${db(world())}` : f.topic === "markets" ? db`and source not in ${db(world())}` : db``}
    order by published_at desc limit ${Math.min(f.limit ?? 40, 100)}`;
  return rows.map(toArticle);
}

/** Counts by mood over the last day and week, for the whole feed or one asset. */
export async function newsMood(v: Viewer, slug?: string) {
  const u = requireUser(v);
  const db = sql();
  const rows = await db<{ span: string; mood: Mood; n: number; avg: number }[]>`
    select s.span, a.mood, count(*)::int as n, avg(a.sentiment)::float as avg
    from (values ('day', interval '1 day'), ('week', interval '7 days')) s(span, len)
    join news_articles a on a.published_at > now() - s.len
    where (a.feed_id is null or a.feed_id in (select id from news_feeds where user_id = ${u.id})) ${slug ? db`and ${slug} = any(a.slugs)` : db``}
    group by s.span, a.mood`;
  const span = (k: string) => {
    const r = rows.filter((x) => x.span === k), total = r.reduce((a, x) => a + x.n, 0);
    const get = (m: Mood) => r.find((x) => x.mood === m)?.n ?? 0;
    return { total, positive: get("positive"), neutral: get("neutral"), negative: get("negative"),
      mean: total ? r.reduce((a, x) => a + x.avg * x.n, 0) / total : 0 };
  };
  return { day: span("day"), week: span("week") };
}

export async function newsSources(v: Viewer): Promise<string[]> {
  const u = requireUser(v);
  return (await sql()<{ source: string }[]>`select distinct source from news_articles
    where feed_id is null or feed_id in (select id from news_feeds where user_id = ${u.id}) order by source`).map((r) => r.source);
}

// ---------------------------------------------------------------- monitors

export type Monitor = { id: string; label: string; keywords: string[]; enabled: boolean; hits: number };
export async function listMonitors(v: Viewer): Promise<Monitor[]> {
  const u = requireUser(v);
  return (await sql()<{ id: string; label: string; keywords: string[]; enabled: boolean; hits: number }[]>`
    select m.id, m.label, m.keywords, m.enabled, (select count(*)::int from news_hits h where h.monitor_id = m.id) as hits
    from news_monitors m where m.user_id = ${u.id} order by m.created_at`);
}

const normKeywords = (ks: string[]) => [...new Set(ks.map((k) => k.trim().replace(/\s+/g, " ")).filter(Boolean))];

export async function createMonitor(v: Viewer, i: { label: string; keywords: string[] }): Promise<Monitor> {
  const u = requireUser(v);
  const keywords = normKeywords(i.keywords);
  if (!keywords.length) throw new DataError("invalid", "Add at least one keyword");
  return sql().begin(async (tx) => {
    await tx`select 1 from users where id = ${u.id} for update`;
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from news_monitors where user_id = ${u.id}`;
    if (n >= MAX_MONITORS) throw new DataError("limit", `You can keep up to ${MAX_MONITORS} monitors`);
    const [r] = await tx<Monitor[]>`insert into news_monitors (user_id, label, keywords) values (${u.id}, ${i.label.trim()}, ${keywords})
      returning id, label, keywords, enabled, 0 as hits`;
    // Matches from the stories already stored, so a new monitor isn't empty until the next run.
    const recent = await tx<{ id: string; title: string; summary: string }[]>`select id, title, summary from news_articles
      where published_at > now() - interval '3 days' and (feed_id is null or feed_id in (select id from news_feeds where user_id = ${u.id}))`;
    for (const a of recent) {
      const matched = matchesKeywords(`${a.title} ${a.summary}`, keywords);
      if (matched.length) await tx`insert into news_hits (monitor_id, article_id, matched, pushed_at) values (${r.id}, ${a.id}, ${matched}, now()) on conflict do nothing`;
    }
    return r;
  }) as Promise<Monitor>;
}

export async function updateMonitor(v: Viewer, id: string, p: { enabled?: boolean; label?: string; keywords?: string[] }) {
  const u = requireUser(v);
  const keywords = p.keywords ? normKeywords(p.keywords) : null;
  if (keywords && !keywords.length) throw new DataError("invalid", "Add at least one keyword");
  const [r] = await sql()`update news_monitors set enabled = coalesce(${p.enabled ?? null}, enabled), label = coalesce(${p.label?.trim() ?? null}, label),
    keywords = coalesce(${keywords}, keywords) where id = ${id} and user_id = ${u.id} returning id`;
  if (!r) throw new DataError("not_found", "No such monitor");
}

export async function deleteMonitor(v: Viewer, id: string) {
  const u = requireUser(v);
  const [r] = await sql()`delete from news_monitors where id = ${id} and user_id = ${u.id} returning id`;
  if (!r) throw new DataError("not_found", "No such monitor");
}

export type Hit = { monitor: string; matched: string[]; at: string; article: Article };
export async function monitorHits(v: Viewer, limit = 30): Promise<Hit[]> {
  const u = requireUser(v);
  const rows = await sql()<(ArticleRow & { label: string; matched: string[]; hit_at: Date })[]>`
    select m.label, h.matched, h.created_at as hit_at, a.id, a.source, a.url, a.title, a.summary, a.published_at, a.slugs, a.mood, a.sentiment, a.mood_words, a.feed_id
    from news_hits h join news_monitors m on m.id = h.monitor_id join news_articles a on a.id = h.article_id
    where m.user_id = ${u.id} order by a.published_at desc limit ${limit}`;
  return rows.map((r) => ({ monitor: r.label, matched: r.matched, at: r.hit_at.toISOString(), article: toArticle(r) }));
}

// ---------------------------------------------------------------- your feeds

export type Feed = { id: string; name: string; url: string; status: string | null; polledAt: string | null; stories: number };
export async function listFeeds(v: Viewer): Promise<Feed[]> {
  const u = requireUser(v);
  return (await sql()<{ id: string; name: string; url: string; last_status: string | null; last_polled_at: Date | null; stories: number }[]>`
    select f.id, f.name, f.url, f.last_status, f.last_polled_at, (select count(*)::int from news_articles a where a.feed_id = f.id) as stories
    from news_feeds f where f.user_id = ${u.id} order by f.created_at`)
    .map((f) => ({ id: f.id, name: f.name, url: f.url, status: f.last_status, polledAt: f.last_polled_at?.toISOString() ?? null, stories: f.stories }));
}

/** Checks the address, reads the feed once (so a bad one is refused straight away), then stores it and its stories. */
export async function addFeed(v: Viewer, i: { name: string; url: string }): Promise<Feed> {
  const u = requireUser(v);
  let stories: RawStory[];
  try {
    const url = (await checkFeedUrl(i.url)).toString();
    stories = await fetchFeed(i.name.trim(), url, true);
    i = { ...i, url };
  } catch (e) { throw new DataError("invalid", e instanceof Error ? e.message : String(e)); }
  const id = await sql().begin(async (tx) => {
    await tx`select 1 from users where id = ${u.id} for update`;
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from news_feeds where user_id = ${u.id}`;
    if (n >= MAX_FEEDS) throw new DataError("limit", `You can add up to ${MAX_FEEDS} feeds`);
    const [r] = await tx<{ id: string }[]>`insert into news_feeds (user_id, name, url, last_status, last_polled_at) values (${u.id}, ${i.name.trim()}, ${i.url}, 'ok', now())
      on conflict (user_id, url) do nothing returning id`;
    if (!r) throw new DataError("conflict", "You've already added that feed");
    return r.id;
  }) as string;
  const fresh = await store(stories, id);
  await matchMonitors(fresh);
  await sql()`update news_hits set pushed_at = now() where pushed_at is null and article_id in ${sql()(fresh.length ? fresh.map((f) => f.id) : ["00000000-0000-0000-0000-000000000000"])}`;
  return (await listFeeds(v)).find((f) => f.id === id)!;
}

export async function deleteFeed(v: Viewer, id: string) {
  const u = requireUser(v);
  const [r] = await sql()`delete from news_feeds where id = ${id} and user_id = ${u.id} returning id`;
  if (!r) throw new DataError("not_found", "No such feed");
}
