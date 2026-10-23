// Unit checks for which top signals get announced. Run: npm run test:unit
import assert from "node:assert/strict";
import { MIN_SCORE, QUIET_MS, pickNew, topMessage, type Candidate } from "../src/lib/data/topNotify";

let passed = 0;
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log("  ok", name); };
const c = (slug: string, side: "buy" | "sell", score: number): Candidate => ({ slug, name: slug[0].toUpperCase() + slug.slice(1), side, score, strength: "Strong", why: "Daily 15/20." });
const now = Date.UTC(2026, 9, 23, 12);

ok("moderate entries are not announced", () => {
  assert.deepEqual(pickNew([c("solana", "buy", MIN_SCORE - 0.01), c("aave", "sell", -MIN_SCORE)], new Map(), now).map((x) => x.slug), ["aave"]);
});
ok("the same asset and side is announced at most once a day", () => {
  const last = new Map([["solana:buy", now - QUIET_MS + 60_000], ["aave:buy", now - QUIET_MS - 60_000]]);
  const picked = pickNew([c("solana", "buy", 0.4), c("aave", "buy", 0.4), c("solana", "sell", -0.4)], last, now);
  assert.deepEqual(picked.map((x) => `${x.slug}:${x.side}`), ["aave:buy", "solana:sell"]);
});
ok("one entry: a titled notification linking to its signals", () => {
  const m = topMessage([c("solana", "buy", 0.4)]);
  assert.equal(m.title, "New top buy: Solana");
  assert.equal(m.url, "/assets/solana/signals");
  assert.match(m.body, /Strong buy\. Daily 15\/20\. Statistics, not advice\./);
});
ok("several: one notification listing buys and sells", () => {
  const m = topMessage([c("solana", "buy", 0.4), c("aave", "buy", 0.5), c("dogecoin", "sell", -0.4)]);
  assert.equal(m.title, "3 new top signals");
  assert.equal(m.body, "Buy: Solana, Aave. Sell: Dogecoin. Statistics, not advice.");
  assert.equal(m.url, "/#top-signals");
});
console.log(`${passed} passed`);
