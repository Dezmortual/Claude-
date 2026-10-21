// Second source for crypto quotes (CoinPaprika's free public API). One call returns every coin.
import { getJson } from "./http";

/** USD price by ticker symbol; where symbols collide, the highest-ranked coin wins. */
export async function paprikaPrices(): Promise<Map<string, number>> {
  const rows = await getJson<{ symbol: string; rank: number; quotes: { USD: { price: number } } }[]>("https://api.coinpaprika.com/v1/tickers?quotes=USD");
  const out = new Map<string, { rank: number; price: number }>();
  for (const r of rows) {
    if (!r.rank) continue;
    const cur = out.get(r.symbol);
    if (!cur || r.rank < cur.rank) out.set(r.symbol, { rank: r.rank, price: r.quotes.USD.price });
  }
  return new Map([...out].map(([k, v]) => [k, v.price]));
}
