// RSS 2.0 and Atom feeds parsed without dependencies: titles, links, dates and summaries only. Text is stripped of
// tags and entities; nothing from a feed is ever rendered as HTML.
export type FeedItem = { title: string; url: string; summary: string; publishedAt: Date | null };

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
export function plain(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
      if (e[0] === "#") { const c = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(c) && c > 0 && c < 0x110000 ? String.fromCodePoint(c) : " "; }
      return ENT[e.toLowerCase()] ?? m;
    }).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "";
const date = (s: string) => { const d = new Date(plain(s)); return Number.isNaN(d.getTime()) ? null : d; };
const httpUrl = (s: string) => { try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null; } catch { return null; } };

export function parseFeed(xml: string, max = 60): FeedItem[] {
  const out: FeedItem[] = [];
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const it of items.slice(0, max)) {
    const url = httpUrl(plain(tag(it, "link")) || plain(tag(it, "guid")));
    const title = plain(tag(it, "title"));
    if (!url || !title) continue;
    out.push({ title: title.slice(0, 300), url, summary: plain(tag(it, "description")).slice(0, 600), publishedAt: date(tag(it, "pubDate") || tag(it, "dc:date")) });
  }
  if (out.length || items.length) return out;
  for (const e of (xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []).slice(0, max)) {
    const link = e.match(/<link\b[^>]*rel=["']alternate["'][^>]*>/i)?.[0] ?? e.match(/<link\b[^>]*>/i)?.[0] ?? "";
    const url = httpUrl(link.match(/href=["']([^"']+)["']/i)?.[1] ?? "");
    const title = plain(tag(e, "title"));
    if (!url || !title) continue;
    out.push({ title: title.slice(0, 300), url, summary: plain(tag(e, "summary") || tag(e, "content")).slice(0, 600), publishedAt: date(tag(e, "published") || tag(e, "updated")) });
  }
  return out;
}

/** Whole-word, case-insensitive: "Fed" matches "the Fed said" but not "fedora". */
export function matchesKeywords(text: string, keywords: string[]): string[] {
  const t = text.toLowerCase();
  return keywords.filter((k) => new RegExp(`(^|[^a-z0-9])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9])`).test(t));
}
