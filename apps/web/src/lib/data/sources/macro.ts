import "server-only";
// Official and public data, no keys: FRED's CSV download (St. Louis Fed), the World Bank's indicators API, and
// Polymarket's public market data. *_URL variables point the tests at a stand-in.
const base = (name: string, dflt: string) => process.env[name]?.trim() || dflt;
const get = async (url: string) => {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "FXDEZ (private app)" } });
  if (!r.ok) throw new Error(`answered ${r.status}`);
  return r;
};

export type Point = { ts: number; v: number };

/** Every observation of a FRED series; missing values (".") are skipped. */
export async function fredSeries(id: string): Promise<Point[]> {
  const text = await (await get(`${base("FRED_URL", "https://fred.stlouisfed.org")}/graph/fredgraph.csv?id=${encodeURIComponent(id)}`)).text();
  const lines = text.trim().split(/\r?\n/);
  if (!/^(observation_date|DATE),/i.test(lines[0] ?? "")) throw new Error("FRED doesn't have a series with that code");
  return lines.slice(1).map((l) => { const [d, v] = l.split(","); return { ts: Date.parse(`${d}T00:00:00Z`), v: Number(v) }; })
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.v));
}

/** One World Bank indicator for several countries, yearly. */
export async function worldBank(indicator: string, countries: string[], years = 15): Promise<{ country: string; name: string; points: Point[] }[]> {
  const url = `${base("WORLDBANK_URL", "https://api.worldbank.org")}/v2/country/${countries.join(";")}/indicator/${encodeURIComponent(indicator)}?format=json&per_page=1000&mrv=${years}`;
  const j = (await (await get(url)).json()) as [unknown, { country: { id: string; value: string }; date: string; value: number | null }[] | null];
  const rows = j?.[1] ?? [];
  const out = new Map<string, { country: string; name: string; points: Point[] }>();
  for (const r of rows) {
    if (r.value === null) continue;
    const c = out.get(r.country.id) ?? { country: r.country.id, name: r.country.value, points: [] };
    c.points.push({ ts: Date.UTC(Number(r.date), 0, 1), v: r.value });
    out.set(r.country.id, c);
  }
  return [...out.values()].map((c) => ({ ...c, points: c.points.sort((a, b) => a.ts - b.ts) }));
}

export type Prediction = { id: string; question: string; yes: number | null; change24h: number | null; volume24h: number; volume: number; endsAt: string | null; url: string; group: string | null };

/** The most-traded open markets, by 24-hour volume. */
export async function polymarketTop(limit = 200): Promise<Prediction[]> {
  const url = `${base("POLYMARKET_URL", "https://gamma-api.polymarket.com")}/markets?limit=${limit}&active=true&closed=false&order=volume24hr&ascending=false`;
  const rows = (await (await get(url)).json()) as { id: string; question: string; slug: string; outcomes: string; outcomePrices: string; volume24hr?: number;
    volumeNum?: number; endDate?: string; oneDayPriceChange?: number; events?: { slug: string; title: string }[]; groupItemTitle?: string }[];
  const parse = (s: string) => { try { return JSON.parse(s) as string[]; } catch { return []; } };
  return rows.map((m) => {
    const outcomes = parse(m.outcomes), prices = parse(m.outcomePrices).map(Number);
    const yi = outcomes.findIndex((o) => o.toLowerCase() === "yes");
    return { id: String(m.id), question: String(m.question).slice(0, 300), yes: yi === -1 || !Number.isFinite(prices[yi]) ? null : prices[yi],
      change24h: typeof m.oneDayPriceChange === "number" ? m.oneDayPriceChange : null, volume24h: m.volume24hr ?? 0, volume: m.volumeNum ?? 0,
      endsAt: m.endDate ?? null, url: `https://polymarket.com/event/${encodeURIComponent(m.events?.[0]?.slug ?? m.slug)}`, group: m.events?.[0]?.title ?? null };
  }).filter((m) => m.question);
}
