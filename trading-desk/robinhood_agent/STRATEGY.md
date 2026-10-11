# Trading rules (edit these to match how you trade)

The agent reads this file on every scan. The hard limits (order size, position
size, trades per day, daily loss, cooldown, spread, market hours) are in
`rules.json` and enforced by `gate.py`; this file only says *what* to look for.

These default rules are an example. They have not been backtested.

## Entry: pullback in an uptrend (long only)

Buy a watchlist symbol only when ALL of these hold on daily bars:

1. Close is above the 50-day simple moving average.
2. The 20-day SMA is above the 50-day SMA.
3. Price has pulled back to within 2% of the 20-day SMA (from above).
4. RSI(14) is between 40 and 55.
5. No earnings report in the next 5 trading days (skip if unknown).

If the data for any condition is unavailable, treat it as **not met**.
Take at most one new entry per scan, closest to the 20-day SMA first.

## Sizing

Whole shares, limit order at or just above the ask, the largest share count
that `gate.py check` approves.

## Exits (checked before entries)

- Stop loss: down `stop_loss_pct` (rules.json) from average cost.
- Take profit: up `take_profit_pct`.
- Trend break: daily close below the 50-day SMA.

## Never

- Short sell, buy options, use margin or trade crypto.
- Use market orders or trade off the watchlist.
- Edit `rules.json`, `STRATEGY.md` or `watchlist.txt` during a scan.
