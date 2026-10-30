# Successful Breakout Trading, daily US stocks

A port of `breakout_strategy.pine` (repo root), from Sinisa Persic,
"Successful Breakout Trading: A Practical Guide" (2013). `strategy.py` lists the
rules; `report.html` is the charted write-up.

```bash
python3 breakout/run_backtest.py     # downloads S&P 500 daily bars via yfinance on first run (~2 min)
python3 breakout/audit.py            # re-verify every trade (slow: ~15 min)
```

## Results (first run, 2026-10-30)

Today's S&P 500 members (yfinance daily, split- and dividend-adjusted), each
traded only after its index inclusion date, from 2014-01-01 (after
publication) to 2026-10-30. 5 bps slippage per side, no commission. Split at
2021-01-01. R is the planned risk (planned entry to initial stop); a trade is
the average of its two halves.

Arms: `rules` (scan + flat base), `gated` (plus SPY above its 50-day SMA and a
Bollinger squeeze, the book's context filters), `random` (same stocks and scan,
buys the next open on a fixed pseudo-random 1 in 20 days, same stop and exits:
the survivorship control).

| Run (worst reading) | Trades | Win | Gross R (t) | Net R (t) | Net %/trade | 2014–20 net R (t) | 2021+ net R (t) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| rules | 22,247 | 50.9% | +0.051 (+10.8) | +0.031 (+6.5) | +0.17% | +0.043 (+6.8) | +0.016 (+2.3) |
| gated | 11,644 | 49.4% | +0.036 (+5.2) | +0.014 (+2.0) | +0.08% | +0.011 (+1.2) | +0.017 (+1.6) |
| random | 20,633 | 50.7% | +0.047 (+8.5) | +0.023 (+4.1) | +0.29% | +0.085 (+11.5) | −0.044 (−5.2) |

The best reading differs by at most 0.002R.

Pattern minus random, net R per trade: all years +0.008R (t = 1.0);
2014–2020 −0.042R (t = −4.4); 2021+ +0.061R (t = +5.5). In net % per trade the
2021+ advantage is +0.10% (t = 1.5).

What this says:

- **The profit is the stocks, not the pattern.** Random entries in the same
  stocks, with the same stop and exits, earn about the same. Over the whole
  period the difference is not significant, and it changes sign between the
  halves: worse than random in 2014–2020, better from 2021.
- **The book's filters hurt.** The market and Bollinger filters halve the trades
  and the edge; neither half is significant.
- **Breakouts rarely run.** 7% of first halves reach 1R; 87% are sold after 3
  days for not accelerating. Most of the result comes from the second half
  held up to 20 days, which is close to just holding the stock.
- Costs are minor here (about 0.02R a trade, stops are 5.4% wide).

Caveats: today's index members only (survivorship flatters every arm, which is
why the random control is the yardstick); the author's eye for triangles,
flags and intraday confirmation is not captured; Fibonacci targets replaced by
1R/2R; no earnings/FDA filter; trades measured one at a time with no portfolio
limit.

Verdict: no edge over random entry in the same stocks. Not worth trading as
coded.

Audit: see the line below, filled in from `breakout/audit.py`.
