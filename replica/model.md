# Forecast models and how one replaces another

Written 2026-10-22, before the challenger published its first forecast. It doesn't change after its results
start coming in.

## The two models

| | live: `baseline-quantile-v1` | challenger: `volscaled-momentum-v2` |
| --- | --- | --- |
| shown in the app | yes | no, it publishes hidden forecasts |
| history used | last 2 years of daily closes | same |
| matching moments | same 50-day trend state as today | same trend state **and** same 28-day momentum (20 sessions where markets close); falls back to trend only, then to all moments, below 60 matches |
| ranges | 10th to 90th percentile of the matching forward returns | the same, but each past return is divided by the 20-day volatility at its start and multiplied by today's |
| midpoint | median matching return | half the median (shrunk towards no change) |
| "% up" | share of matching returns above zero | the same, shrunk halfway towards 50% |

Both models are published in every hourly run, for the same assets, base price and target time, and both are
scored by the same job (`scoreForecasts` in `apps/web/src/lib/server/jobs.ts`). Code: `shortTerm` and
`challenger` in `apps/web/src/lib/data/model.ts`.

## The rule

**When it can be applied:** on or after **2026-11-19** (28 days after the first challenger forecast), and only
once there are at least **500 scored pairs** on the next-day horizon.

**Which forecasts count:**
- A **pair** is a live and a challenger forecast for the same asset, horizon and run, both scored.
- To limit overlapping forecasts that move together, only **one pair per asset per UTC day** counts: the
  day's first run.

**The challenger replaces the live model only if all three hold on the next-day horizon:**
1. **Better "% up":** its mean Brier score is lower, and a one-sided sign test on the per-pair Brier
   difference gives **p < 0.05**.
2. **Ranges at least as honest:** its 80%-range coverage is no further from 80% than the live model's, plus
   2 points.
3. **Errors no worse:** its median absolute error is at most **5% higher** than the live model's.

The 7-day and 1-month horizons are reported but don't decide anything, because their forecasts overlap too
much to test fairly in 4 weeks.

**What happens next:**
- **If it passes:** the challenger becomes the live model. The previous live model keeps publishing hidden for
  4 weeks so the switch can be checked.
- **If it fails:** the live model stays. The challenger isn't retuned and retested on the same data. Any change
  is a new challenger, with a new name and a new 4-week window, written down here first.

**Run it:**

```bash
cd apps/web && DATABASE_URL=… npm run models:compare
```

**Known weakness:** assets move together (crypto especially), so pairs aren't fully independent, and the sign
test is somewhat generous. Treat a p-value near 0.05 as a pass on paper, not proof.
