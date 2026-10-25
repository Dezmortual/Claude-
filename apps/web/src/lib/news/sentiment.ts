// News mood from a word list: each headline and summary is scored by the finance words in it. Crude by design
// (no model, no cost), so the screens call it a mood, show the words that drove it, and never trade on it.
const POS = ["beat", "beats", "surge", "surges", "surged", "soar", "soars", "soared", "rally", "rallies", "rallied", "gain", "gains", "gained",
  "jump", "jumps", "jumped", "record high", "upgrade", "upgraded", "upgrades", "outperform", "bullish", "growth", "profit", "profits",
  "strong", "stronger", "rebound", "rebounds", "recovery", "approve", "approved", "approval", "boost", "boosts", "rise", "rises", "rose",
  "climb", "climbs", "climbed", "optimism", "optimistic", "breakthrough", "expands", "expansion", "inflows", "buyback", "raises guidance",
  "tops estimates", "all-time high", "partnership", "wins", "accelerates", "eases", "cut rates", "rate cut"];
const NEG = ["miss", "misses", "missed", "plunge", "plunges", "plunged", "crash", "crashes", "crashed", "slump", "slumps", "slumped",
  "fall", "falls", "fell", "drop", "drops", "dropped", "sink", "sinks", "sank", "tumble", "tumbles", "tumbled", "downgrade", "downgraded",
  "bearish", "loss", "losses", "weak", "weaker", "lawsuit", "sues", "sued", "probe", "investigation", "fraud", "hack", "hacked", "exploit",
  "bankruptcy", "bankrupt", "default", "layoffs", "cuts jobs", "recession", "inflation fears", "warning", "warns", "outflows", "selloff",
  "sell-off", "ban", "bans", "fine", "fined", "penalty", "delay", "delays", "halt", "halts", "liquidation", "liquidations", "concern",
  "fears", "slowdown", "lowers guidance", "below estimates", "rate hike", "hikes rates", "volatile", "turmoil"];
const NEGATORS = new Set(["not", "no", "never", "without", "fails", "failed"]);

export type Mood = "positive" | "neutral" | "negative";
export type Scored = { score: number; label: Mood; words: string[] };

const phrase = (list: string[]) => list.map((w) => ({ w, re: new RegExp(`(^|[^a-z])${w.replace(/[-]/g, "\\-")}(?=$|[^a-z])`, "g") }));
const P = phrase(POS), N = phrase(NEG);

/** -1 to 1; zero words found is neutral. */
export function scoreText(text: string): Scored {
  const t = ` ${text.toLowerCase().replace(/[’']/g, "'")} `;
  let pos = 0, neg = 0;
  const words: string[] = [];
  const hit = (list: typeof P, sign: 1 | -1) => {
    for (const { w, re } of list) {
      for (const m of t.matchAll(re)) {
        const before = t.slice(0, m.index).trim().split(/\s+/).slice(-2);
        const flip = before.some((b) => NEGATORS.has(b)) ? -1 : 1;
        if (sign * flip > 0) pos++; else neg++;
        if (!words.includes(w)) words.push(w);
      }
    }
  };
  hit(P, 1); hit(N, -1);
  const n = pos + neg;
  const score = n ? (pos - neg) / (n + 1) : 0; // +1 damps single-word verdicts
  return { score: +score.toFixed(3), label: score >= 0.2 ? "positive" : score <= -0.2 ? "negative" : "neutral", words: words.slice(0, 6) };
}
