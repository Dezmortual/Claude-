---
name: scalp-plan
description: Position-sizing math for a USDT perp trade — qty, stop, take-profit, notional, margin, R:R, rounded to the instrument's tick and lot. Use when the user asks to size, plan, or calculate a trade. Pure math, no network, no keys.
---

# scalp-plan

Inputs: equity, dollar risk, side, entry, stop and TP (as `--stop-pct`/`--tp-pct` or absolute `--stop`/`--tp`), tick size, qty step, leverage. Get the tick size, qty step, and min qty from `bybit-structure`.

## Run

```bash
python .claude/skills/scalp-plan/plan.py \
  --equity 500 --risk 25 --side long \
  --entry 148.20 --symbol SOLUSDT \
  --tick 0.01 --lot 0.1 --min-qty 0.1 --leverage 10

python .claude/skills/scalp-plan/plan.py --equity 500 --risk 25 --side short \
  --entry 148.20 --stop 150.10 --tp 144.00 --tick 0.01 --lot 0.1 --json
```

## Guarantees

- **Stop rounds away from entry, TP rounds toward entry.** The plan never overstates reward or understates risk.
- **Qty is floored to the lot size.** Taker fees on entry and stop (default 0.055% per side) are included, so a full stop-out costs at most `--risk`.
- Exits 1 when qty rounds to zero or falls below `--min-qty`. Prints warnings when margin exceeds equity or 50% of it, when risk is over 5% of equity, when R:R is below 1, or when fees dominate the trade.

Next, pass the `risk_actual` value (rounded up) as `--risk-usd` to `risk-guard check` and `bybit-trade place`.
