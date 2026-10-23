// Which top signals to announce, and how. Pure: the job supplies the scan, the last announcements and the time.

export type Candidate = { slug: string; name: string; side: "buy" | "sell"; strength: string; score: number; why: string };
export const MIN_SCORE = 0.3; // Strong and Very strong only
export const QUIET_MS = 24 * 3_600_000; // the same asset and side at most once a day
const key = (c: { slug: string; side: string }) => `${c.slug}:${c.side}`;

/** Entries strong enough to announce that haven't been announced for the same side in the last day. */
export function pickNew(top: Candidate[], lastNotified: Map<string, number>, now: number): Candidate[] {
  return top.filter((c) => Math.abs(c.score) >= MIN_SCORE && !(now - (lastNotified.get(key(c)) ?? -Infinity) < QUIET_MS));
}

/** One notification for everything new in this run. */
export function topMessage(items: Candidate[]) {
  if (items.length === 1) {
    const c = items[0];
    return { title: `New top ${c.side}: ${c.name}`, body: `${c.strength} ${c.side}. ${c.why} Statistics, not advice.`, url: `/assets/${c.slug}/signals`, tag: `top-${c.slug}-${c.side}` };
  }
  const list = (side: "buy" | "sell") => items.filter((c) => c.side === side).map((c) => c.name);
  const buys = list("buy"), sells = list("sell");
  return {
    title: `${items.length} new top signals`,
    body: [buys.length ? `Buy: ${buys.join(", ")}.` : "", sells.length ? `Sell: ${sells.join(", ")}.` : "", "Statistics, not advice."].filter(Boolean).join(" "),
    url: "/#top-signals", tag: "top-signals",
  };
}
