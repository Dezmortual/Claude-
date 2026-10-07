# Published trend and momentum strategies

Three strategies from published research, chosen before any result was seen,
with their rules exactly as published, tested on the years after each was
published. Nothing here was tuned.

```bash
python3 trend/run_backtest.py   # the three strategies and their verdicts
python3 trend/audit.py          # recompute every signal and daily return
python3 trend/robustness.py     # crypto momentum on other coins and lookbacks
```

The pass rule was written into `run_backtest.py` before it ran. After its
publication date a strategy passes only if its Sharpe ratio beats buy and
hold with a one-sided p-value under 0.05/3 = 0.0167 (three strategies tested,
so the threshold is split three ways), and its return over T-bills has
t of 2 or more. Costs: 2 bps per unit of turnover for ETFs, 7 bps for crypto.
Signals trade at the next day's close. Cash earns the T-bill rate.

## Results (2026-10-07)

After publication, against buy and hold:

| Strategy | From | CAGR | Sharpe | Max drawdown | p | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Faber 10-month SMA on SPY | 2007 | 8.1% vs 11.0% | 0.56 vs 0.56 | −26% vs −55% | 0.50 | fail |
| Crypto time-series momentum, BTC and ETH | 2019 | 79.7% vs 52.2% | 1.42 vs 0.93 | −48% vs −76% | 0.025 | fail, closest |
| Antonacci dual momentum | 2013 | 8.8% vs 15.1% | 0.51 vs 0.82 | −34% vs −34% | 0.99 | fail |

- **Faber's rule halves the drawdown and gives up return.** Same Sharpe as
  holding SPY. It is a way to sleep better, not to earn more.
- **Dual momentum underperformed** holding SPY after it was published.
- **Crypto momentum came closest.** Holding a coin only after a positive
  28-day return beat holding BTC and ETH on every measure, but p = 0.025 misses
  the 0.0167 bar, so by the rule set in advance it is not proven.

## Robustness of crypto momentum (not used for the verdict)

The same rule on 18 coins it was never tested on, from 2019:

- Shallower drawdown than holding the coin on **18 of 18**.
- Higher Sharpe on **16 of 18**, though no single coin is significant.
- As one equal-weight basket: Sharpe 1.42 vs 1.00, max drawdown −50% vs −81%,
  p = 0.034.

Neighbouring lookbacks on BTC and ETH:

| Lookback | 14 days | 21 days | 28 days | 35 days | 42 days |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sharpe (hold 0.93) | 0.92 | 1.12 | 1.42 | 1.13 | 0.92 |

The drawdown cut is consistent everywhere. The Sharpe gain peaks at 28 days
and fades either side, so the size of the 28-day result is partly luck.

## What to do with it

Nothing here is proven. Crypto momentum is the one worth a forward test: its
risk reduction held on every coin tried, and the rule is simple and cheap to
run (a weekly check, two coins). Paper trade it from today for at least six
months and compare with this backtest before risking money. Even at its best
it fell 48% from peak, so size any real position for that.

Audit: every signal (397, 625, 266) and every daily return (8,287, 4,369,
5,537) matches an independent recomputation. Daily returns are compared to
1e-5 because Yahoo's dividend-adjusted ETF prices shift by parts per million
between downloads.
