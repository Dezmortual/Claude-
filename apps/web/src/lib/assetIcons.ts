// Logo for each asset, from public/icons/assets (sources and licences in LICENSES.md there). Forex pairs show both
// currencies' flags. Assets with no openly licensed logo get none and keep the letter mark.
const COINS = ["bitcoin", "ethereum", "xrp", "bnb", "solana", "dogecoin", "cardano", "tron", "chainlink", "avalanche", "stellar", "sui",
  "shiba-inu", "hedera", "polkadot", "litecoin", "bitcoin-cash", "uniswap", "near", "aptos", "aave", "internet-computer",
  "ethereum-classic", "filecoin", "cosmos", "arbitrum", "optimism", "injective", "render", "immutable", "the-graph", "algorand",
  "vechain", "sei", "pepe", "aapl", "nvda", "tsla", "googl", "gold", "silver", "wti"];
const FLAG: Record<string, string> = { sp500: "us", nasdaq100: "us", dax: "de", spy: "us", qqq: "us", "us-10y": "us", "de-10y": "de", "uk-10y": "gb" };
const CURRENCY: Record<string, string> = { eur: "eu", gbp: "gb", usd: "us", jpy: "jp", aud: "au", chf: "ch", cad: "ca" };
const SAME: Record<string, string> = { gld: "gold" };

const dir = "/icons/assets";
export function assetIcon(slug: string): string[] | null {
  if (COINS.includes(slug)) return [`${dir}/${slug}.svg`];
  if (SAME[slug]) return [`${dir}/${SAME[slug]}.svg`];
  if (FLAG[slug]) return [`${dir}/flags/${FLAG[slug]}.svg`];
  const base = CURRENCY[slug.slice(0, 3)], quote = CURRENCY[slug.slice(3)];
  return slug.length === 6 && base && quote ? [`${dir}/flags/${base}.svg`, `${dir}/flags/${quote}.svg`] : null;
}
