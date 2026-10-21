// Daily euro foreign-exchange reference rates published by the European Central Bank, via the Frankfurter API.
// One rate per working day, so bars are flat (open = high = low = close) and there is no intraday data.
import type { Bar } from "../types";
import { getJson } from "./http";

const HOST = "https://api.frankfurter.dev/v1";

export async function frankfurterDaily(pair: string, since: number | null, days: number): Promise<Bar[]> {
  const [base, quote] = pair.split("/");
  const from = new Date(since ?? Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const r = await getJson<{ rates: Record<string, Record<string, number>> }>(`${HOST}/${from}..?base=${base}&symbols=${quote}`);
  return Object.entries(r.rates)
    .map(([d, x]) => ({ ts: Date.parse(`${d}T00:00:00Z`), o: x[quote], h: x[quote], l: x[quote], c: x[quote], v: 0 }))
    .filter((b) => Number.isFinite(b.c) && b.c > 0)
    .sort((a, b) => a.ts - b.ts);
}
