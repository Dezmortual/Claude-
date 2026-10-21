// Small fetch helper for market-data APIs: timeout, retries with backoff on 429/5xx, global concurrency cap.
let active = 0;
const queue: (() => void)[] = [];
const MAX = 6;

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX) await new Promise<void>((r) => queue.push(r));
  active++;
  try { return await fn(); } finally { active--; queue.shift()?.(); }
}

export async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  return slot(async () => {
    let last: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
        if (r.ok) return (await r.json()) as T;
        if (r.status !== 429 && r.status < 500) throw new Error(`${new URL(url).host} ${r.status}`);
        last = new Error(`${new URL(url).host} ${r.status}`);
      } catch (e) {
        last = e;
        if (e instanceof Error && /\s4\d\d$/.test(e.message) && !e.message.endsWith("429")) throw e;
      }
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
    throw last;
  });
}
