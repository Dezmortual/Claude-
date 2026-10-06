# SOL Donchian, daily crypto

A port of `sol_donchian_indicator.pine` (repo root) to the harness: a 20-day
Donchian breakout in the direction of the 200-day SMA, only when ATR is above
its 20-day average, with a 1.5 ATR hard stop and a 0.02 ATR trailing stop.
`strategy.py` explains the two differences from the Pine version.

```bash
python3 donchian/run_backtest.py                       # honest default
python3 donchian/run_backtest.py --trail-mode same_bar # TradingView's assumption
python3 donchian/audit.py                              # re-verify every trade
```

## Results (first run, 2026-10-06)

BTC, ETH and SOL daily bars from Yahoo, from each coin's first Yahoo bar to
2026-10-05. $25k, 0.25% risk per trade, 0.05% commission plus 2 bps slippage
per side. Split at 2025-01-01, because the Pine strategy is named
"OOS 2025-2026".

| Run | Trades | Win | Net R/trade | t | 2025+ R/trade | 2025+ t |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| rules, causal trail | 335 | 53.1% | +0.125 | +2.89 | +0.062 | +0.74 |
| gated, causal trail | 184 | 54.3% | +0.140 | +2.63 | +0.064 | +0.52 |
| rules, same-bar trail | 381 | 93.2% | +0.646 | +16.86 | +0.613 | +8.03 |

What this says:

- **The same-bar row is fiction.** On a daily bar the high and the low have no
  known order. Letting the bar's own high move a 0.02 ATR trail and then
  filling it on the same bar's low assumes the high always came first. That
  single assumption turns a 53% win rate into 93%. The audit rejects 373 of
  those 381 trades. If the TradingView strategy shows numbers like that row,
  this is why.
- **The trailing stop is mostly decoration.** 87% of trades exit two days after
  entry. The trail is so tight it sits just under the prior day's high, and on
  a 24/7 market the next open is usually already below it, so the trade exits
  at that open. In practice this is "buy the breakout close, sell at the next
  day's close".
- **The edge is old and fading.** Net R per trade by year: +0.23 to +0.77 in
  2015 to 2018, +0.06 to +0.13 in 2019 to 2024, +0.001 in 2025 and +0.14 so
  far in 2026 on 23 trades. The full-period
  t of 2.89 is carried by early BTC. The 2025+ out-of-sample half has t = 0.74,
  which is not evidence of an edge.
- **The gates add nothing.** Gated matches rules on R/trade and on the test
  half, with fewer trades. Neither filter is doing real work.
- **Friction is not what kills it.** Gross is only about 0.02 R above net.
  The problem is the signal, not the costs.

Verdict: no demonstrated edge in the period that matters. Do not trade it, and
do not tune it until it looks better: that would fit 2025 the way the original
rules fit the years before it.

Audit: 335/335 rules-arm and 184/184 gated-arm trades satisfy the rules as
written.
