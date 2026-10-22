// Applies the promotion rule in replica/model.md: live model against the challenger, one pair per asset per UTC day,
// next-day horizon. Prints every number the rule needs and its verdict. Usage: npm run models:compare
import postgres from "postgres";
import { dbUrl } from "../src/lib/dburl";

const LIVE = "baseline-quantile-v1", CHALLENGER = "volscaled-momentum-v2";
const FIRST_DAY = Date.parse("2026-11-19T00:00:00Z"), MIN_PAIRS = 500;

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL (see .env.example)");
const sql = postgres(dbUrl(url), { max: 1, onnotice: () => {} });

type Side = { p_up: number; base: number; mid: number; realized: number; inside: boolean; err: number };
const rows = await sql<{ live: Side; ch: Side }[]>`
  with scored as (
    select r.model_version as model, f.asset_id, f.generated_at, f.p_up, f.base_price as base, f.mid,
      o.realized_price as realized, o.inside_band as inside, o.abs_pct_error as err
    from forecasts f join forecast_runs r on r.id = f.run_id join forecast_outcomes o on o.forecast_id = f.id
    where f.horizon = '1d' and r.model_version in (${LIVE}, ${CHALLENGER})),
  firsts as (select asset_id, min(generated_at) as generated_at from scored group by asset_id, date_trunc('day', generated_at at time zone 'UTC'))
  select row_to_json(l) as live, row_to_json(c) as ch
  from firsts x
  join scored l on l.asset_id = x.asset_id and l.generated_at = x.generated_at and l.model = ${LIVE}
  join scored c on c.asset_id = x.asset_id and c.generated_at = x.generated_at and c.model = ${CHALLENGER}`;
await sql.end();

const brier = (s: Side) => (s.p_up - (s.realized >= s.base ? 1 : 0)) ** 2;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** One-sided exact binomial tail P(X >= k) for X ~ Bin(n, 1/2), in log space so large n stays finite. */
function signTestP(k: number, n: number) {
  if (n === 0) return 1;
  let lp = -n * Math.LN2, logC = 0, sum = 0; // logC = log(n choose i)
  for (let i = 0; i <= n; i++) {
    if (i > 0) logC += Math.log(n - i + 1) - Math.log(i);
    if (i >= k) sum += Math.exp(logC + lp);
  }
  return Math.min(1, sum);
}

const n = rows.length;
const bL = rows.map((r) => brier(r.live)), bC = rows.map((r) => brier(r.ch));
const diffs = rows.map((_, i) => bL[i] - bC[i]).filter((d) => d !== 0);
const wins = diffs.filter((d) => d > 0).length; // challenger lower Brier
const p = signTestP(wins, diffs.length);
const covL = mean(rows.map((r) => (r.live.inside ? 1 : 0))), covC = mean(rows.map((r) => (r.ch.inside ? 1 : 0)));
const errL = median(rows.map((r) => r.live.err)), errC = median(rows.map((r) => r.ch.err));

const checks = {
  "window open (on or after 2026-11-19)": Date.now() >= FIRST_DAY,
  [`at least ${MIN_PAIRS} pairs`]: n >= MIN_PAIRS,
  "1. Brier lower and sign test p < 0.05": mean(bC) < mean(bL) && p < 0.05,
  "2. coverage no further from 80% (+2 points)": Math.abs(covC - 0.8) <= Math.abs(covL - 0.8) + 0.02,
  "3. median error at most 5% higher": errC <= errL * 1.05,
};

console.log(`pairs: ${n} (one per asset per UTC day, next-day horizon)`);
console.log(`Brier          live ${mean(bL).toFixed(4)}   challenger ${mean(bC).toFixed(4)}   challenger better in ${wins}/${diffs.length}, p = ${p.toFixed(4)}`);
console.log(`80% coverage   live ${(covL * 100).toFixed(1)}%   challenger ${(covC * 100).toFixed(1)}%`);
console.log(`median error   live ${errL.toFixed(3)}%   challenger ${errC.toFixed(3)}%`);
for (const [k, ok] of Object.entries(checks)) console.log(`${ok ? "pass" : "FAIL"}  ${k}`);
console.log(Object.values(checks).every(Boolean) ? "VERDICT: promote the challenger" : "VERDICT: keep the live model");
