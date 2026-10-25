import "server-only";
// Where news comes from: Alpaca's news API (official, with the owner's keys; stories tagged with tickers) and RSS feeds.
// Feed addresses an owner adds are checked so the server can't be pointed at its own network.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parseFeed, type FeedItem } from "@/lib/news/feed";

export type RawStory = FeedItem & { source: string; symbols: string[] };

const clean = (v?: string) => v?.trim().replace(/^["']|["']$/g, "").trim() ?? "";
const MAX_BYTES = 2_000_000;

/** Built-in feeds: official and widely used, all public RSS. NEWS_RSS ("Name|url,Name|url") replaces the list (tests). */
export function builtInFeeds(): { name: string; url: string }[] {
  const env = clean(process.env.NEWS_RSS);
  if (env) return env.split(",").map((x) => { const [name, url] = x.split("|"); return { name: name.trim(), url: url.trim() }; });
  return [
    { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
    { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
    { name: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
    { name: "ECB", url: "https://www.ecb.europa.eu/rss/press.html" },
    { name: "Bank of England", url: "https://www.bankofengland.co.uk/rss/news" },
  ];
}

const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^f[cd]/i, /^fe80/i, /^::ffff:(127|10|192\.168)\./i];
const allowLocal = () => process.env.NEWS_ALLOW_LOCAL === "true";

/** Throws a plain message if the address isn't a public https feed. */
export async function checkFeedUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Error("That isn't a web address"); }
  if (allowLocal() && u.hostname === "localhost") return u;
  if (u.protocol !== "https:") throw new Error("Feeds must use https://");
  if (u.username || u.password) throw new Error("Leave the user name and password out of the address");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("That address isn't on the public internet");
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => { throw new Error("That site's name doesn't resolve"); })).map((a) => a.address);
  if (addrs.some((a) => PRIVATE.some((re) => re.test(a)))) throw new Error("That address isn't on the public internet");
  return u;
}

async function getText(url: string, checked: boolean): Promise<string> {
  if (checked) await checkFeedUrl(url);
  const r = await fetch(url, { cache: "no-store", redirect: checked ? "manual" : "follow", signal: AbortSignal.timeout(12_000),
    headers: { "user-agent": "FXDEZ news reader (private app)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
  if (r.status >= 300 && r.status < 400) throw new Error(`The feed moved (${r.status}); add its new address instead`);
  if (!r.ok) throw new Error(`The feed answered ${r.status}`);
  if (Number(r.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("The feed is too large");
  const text = await r.text();
  if (text.length > MAX_BYTES) throw new Error("The feed is too large");
  return text;
}

/** One feed's stories. `checked` applies the public-address check (owner-added feeds). */
export async function fetchFeed(name: string, url: string, checked = false): Promise<RawStory[]> {
  const items = parseFeed(await getText(url, checked));
  if (!items.length) throw new Error("No stories found: is that an RSS or Atom feed?");
  return items.map((i) => ({ ...i, source: name, symbols: [] }));
}

/** Alpaca's news API: the latest stories, with the tickers each is about. Empty without keys. */
export async function alpacaNews(since: Date | null): Promise<RawStory[]> {
  const key = clean(process.env.ALPACA_KEY_ID), secret = clean(process.env.ALPACA_SECRET_KEY);
  if (!key || !secret) return [];
  const base = clean(process.env.ALPACA_NEWS_URL) || "https://data.alpaca.markets";
  const q = new URLSearchParams({ limit: "50", sort: "desc", include_content: "false", ...(since ? { start: since.toISOString() } : {}) });
  const r = await fetch(`${base}/v1beta1/news?${q}`, { cache: "no-store", signal: AbortSignal.timeout(12_000),
    headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret } });
  if (!r.ok) throw new Error(`Alpaca news answered ${r.status}`);
  const j = (await r.json()) as { news?: { headline: string; summary: string; url: string; source: string; created_at: string; symbols: string[] }[] };
  return (j.news ?? []).filter((n) => n.url && n.headline).map((n) => ({ title: n.headline.slice(0, 300), url: n.url, summary: (n.summary ?? "").slice(0, 600),
    publishedAt: new Date(n.created_at), source: n.source ? n.source[0].toUpperCase() + n.source.slice(1) : "Alpaca", symbols: n.symbols ?? [] }));
}
