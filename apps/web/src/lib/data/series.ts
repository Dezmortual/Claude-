// Deterministic demo price series. Same asset + timeframe + day always gives the same bars,
// so screenshots and tests are stable. Replaced by price_bars from the worker in /replica-backend.
import { ANCHORS, ASSET_BY_SLUG, DEMO_VOL } from "./catalogue";
import type { Bar, Timeframe } from "./types";

const TF_MS: Record<Timeframe, number> = { "5m": 300_000, "30m": 1_800_000, "1h": 3_600_000, "1d": 86_400_000, "1w": 604_800_000 };
const TF_COUNT: Record<Timeframe, number> = { "5m": 600, "30m": 700, "1h": 800, "1d": 2200, "1w": 300 };
const YEAR_MS = 365 * 86_400_000;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

const cache = new Map<string, Bar[]>();

/** Bars ending at the last closed bar before `now`, last close scaled to the asset's demo anchor. */
export function bars(slug: string, tf: Timeframe, now = Date.now()): Bar[] {
  const asset = ASSET_BY_SLUG.get(slug);
  if (!asset) return [];
  const step = TF_MS[tf];
  const end = Math.floor(now / step) * step; // open time of the forming bar; we stop before it
  const key = `${slug}:${tf}:${end}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const n = TF_COUNT[tf];
  const r = rng(hash(`${slug}:${tf}`));
  const sigma = DEMO_VOL[asset.market] * Math.sqrt(step / YEAR_MS);
  // Built backwards from "now" with a gentle pull towards today's level, so history stays in a believable band
  // around the current price. Slow regime switches give both trends and pullbacks.
  let drift = 0;
  const logs: number[] = new Array(n).fill(0);
  for (let i = n - 2; i >= 0; i--) {
    if (i % 60 === 0) drift = (r() - 0.5) * sigma * 0.12;
    logs[i] = logs[i + 1] * (1 - 0.004) - drift - sigma * gauss(r);
  }
  // Day-to-day wobble so prices move between days; identical for every timeframe so they agree.
  const day = Math.floor(now / 86_400_000);
  const target = ANCHORS[slug] * Math.exp(gauss(rng(hash(`${slug}:${day}`))) * DEMO_VOL[asset.market] * 0.05);
  const shift = Math.log(target) - logs[n - 1];

  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const c = Math.exp(logs[i] + shift);
    const o = i ? out[i - 1].c : c * Math.exp(-sigma * gauss(r) * 0.3);
    const wick = Math.abs(gauss(r)) * sigma * 0.4;
    out.push({
      ts: end - (n - i) * step,
      o, c,
      h: Math.max(o, c) * Math.exp(wick),
      l: Math.min(o, c) * Math.exp(-wick),
      v: Math.round(1000 * (1 + Math.abs(gauss(r)))),
    });
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, out);
  return out;
}
