# VWAP EMA Trend, hourly crypto

A port of `vwap_ema_indicator.pine` (repo root), the rule from a kylehtrades
reel: long when price is above session VWAP and the 9 EMA is above the 20 EMA,
short when both are below. The reel gives no exit, so a position is held while
its condition still holds at the close and exits at the next open once it
doesn't (reversing if the opposite condition holds). No stop, because the
source gives none. Fills are at the next bar's open.

```bash
python3 vwapema/run_backtest.py   # uses the same cached Binance candles as sweep/
python3 vwapema/audit.py          # re-verify every trade
```

## Results (first run, 2026-11-01)

The same ten Binance USDT pairs, hourly bars, period and split as `sweep/`:
2020-01-01 (SOL and AVAX from listing) to 2026-11-01, split at 2025-01-01. VWAP
uses hlc3 and resets at 00:00 UTC. Costs are 0.05% commission plus 2 bps
slippage per side, so a round trip costs 0.14%.

| Arm | Trades | Win | Net per trade (t) | Before costs (t) | Test half net (t) | Account, net | Account, before costs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| rules | 71,820 | 25.7% | −0.093% (−9.7) | +0.047% (+4.8) | −0.111% (−8.4) | −99.9% | +1,074% |
| gated (ATR above its average) | 27,806 | 27.9% | −0.081% (−4.4) | +0.059% (+3.3) | −0.113% (−5.0) | −94.0% | +196% |

What this says:

- **It loses money after costs, everywhere.** Rules arm: all 20 coin-halves
  (10 coins, before and after 2025) are negative. Gated arm: 19 of 20.
- **There is a small gross edge, and costs are three times bigger.** Before
  costs the rules arm makes +0.047% per trade with t = 4.8. Each round trip
  costs 0.14%. It trades about 3 times a day per coin with a median hold of 3
  hours, so costs swamp it.
- **The gross edge is long-side drift.** Longs make +0.092% gross per trade
  (t = 6.2), shorts +0.000% (t = 0.0). That's what a trend filter on coins
  that rose from 2020 to 2026 would show. It isn't evidence the signal has
  timing skill, and it's weaker after 2025 (gross t = 2.2).
- **The gate is a cost cut, not an edge.** It keeps 39% of the trades and
  slightly improves per-trade net, but it's still negative in the test half
  (t = −5.0). No TradingAgents arm was run: there's nothing for a model filter
  to rescue when the costs exceed the gross edge by three times.
- **Close relative of Sweep, and the same verdict.** Sweep (4 EMA crossing
  VWAP) lost 0.133% per trade. Adding the 9/20 EMA filter trims the loss to
  0.093% but doesn't change the sign.

Verdict: no edge after costs, before or after 2025. Do not trade it on hourly
crypto. A slower timeframe would cut costs per unit of move, but it would be
a new hypothesis to test on its own, not a fix to tune this one.

## 5-minute bars (2026-11-01)

```bash
python3 vwapema/run_backtest.py --interval 5m --start 2023-01-01 --out vwapema/out_5m
python3 vwapema/audit.py 5m out_5m
```

Same coins, costs and split. It starts in 2023 because 5-minute history from
2020 is about 12 times the download. That gives about 400,000 bars per coin,
with two years before the split and nearly two after.

| Arm | Trades | Win | Net per trade (t) | Before costs (t) | Train net | Test net (t) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| rules | 225,949 | 16.8% | −0.135% (−75.5) | +0.005% (+2.7) | −0.135% | −0.135% (−53.2) |
| gated | 100,350 | 18.0% | −0.130% (−42.9) | +0.010% (+3.3) | −0.131% | −0.129% (−29.8) |

- **Worse than hourly, as expected.** It trades about 16 times a day per coin
  with a median hold of 30 minutes. The average move before costs is
  +0.005%, against 0.14% in costs. Every coin loses in both halves (20 of 20,
  both arms), and the equal-weight account goes to zero.
- **The before-costs account (+11,129%) is one coin.** TRX makes +0.036% gross
  per trade over about 20,000 trades, which compounds to roughly 1,100 times;
  the other nine coins range from −97% to +791% before costs. TRX's tick is
  large relative to its price, so part of that is likely price discreteness
  rather than signal. It's still −0.10% per trade after costs.
- **Win rate 17%.** Most trades are stopped by the next disagreement within a
  few bars. The reel's "just using" these two conditions on a fast chart is a
  way to pay commission, not a strategy.

Audit (5m): 225,949/225,949 rules-arm and 100,350/100,350 gated-arm trades
satisfy the rules as written.

Audit: 71,820/71,820 rules-arm and 27,806/27,806 gated-arm trades satisfy the
rules as written.
