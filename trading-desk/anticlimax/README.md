# Anti-Climax, 15-minute and hourly crypto

A port of `anti_climax_strategy.pine` (repo root), from Galen Woods, "Day
Trading with the Anti-Climax Pattern" (2014). `strategy.py` lists the rules and
the fill model; `report.html` is the charted write-up.

```bash
python3 anticlimax/run_backtest.py                                   # 15m, downloads candles on first run
python3 anticlimax/run_backtest.py --interval 1h --out anticlimax/out_1h
python3 anticlimax/audit.py [--out anticlimax/out_1h]                # re-verify every trade
```

## Results (first run, 2026-10-30)

Ten Binance USDT pairs (BTC, ETH, BNB, SOL, XRP, DOGE, ADA, TRX, AVAX, LINK)
from 2020-01-01 (SOL and AVAX from listing) to 2026-10-30. 0.05% commission
per side plus 2 bps slippage per side. Split at 2025-01-01. R is the realised
risk, entry to stop. Arms: `rules` takes every pattern; `gated` adds the book's
context rules (no close beyond the last pivot, 50 EMA sloping with the trade).

A quarter of entries touch the stop inside the fill bar, and candles do not say
which came first, so each arm runs twice: `worst` (stop first) and `best`
(target first). The truth is between them.

| Run | Trades | Win | Gross R (t) | Net R (t) | Net %/trade | 2025+ net R |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 15m rules best | 62,146 | 37.6% | +0.013 (+1.9) | −0.562 (−23.4) | −0.132% | −0.723 |
| 15m gated best | 20,753 | 36.3% | −0.001 (−0.1) | −0.688 (−15.4) | −0.128% | −0.966 |
| 15m rules worst | 72,214 | 30.9% | −0.132 (−24.4) | −0.759 (−35.7) | −0.175% | −0.913 |
| 15m gated worst | 24,403 | 29.4% | −0.136 (−14.7) | −0.892 (−22.4) | −0.164% | −1.159 |
| 1h rules best | 16,202 | 38.6% | −0.009 (−0.6) | −0.292 (−11.5) | −0.169% | −0.292 |
| 1h gated best | 5,830 | 37.8% | −0.010 (−0.5) | −0.390 (−6.5) | −0.160% | −0.361 |
| 1h rules worst | 18,776 | 31.0% | −0.160 (−17.1) | −0.467 (−22.7) | −0.246% | −0.491 |
| 1h gated worst | 6,853 | 29.5% | −0.178 (−11.0) | −0.579 (−11.3) | −0.233% | −0.574 |

What this says:

- **No edge before costs.** The best reading is gross zero (t under 2 in every
  run); the worst reading loses before costs.
- **Costs kill it outright.** A round trip costs 0.14%; the best-case gross gain
  is about 0.01–0.03% per trade. Median stop is 0.4–0.5% of price on 15m, so
  costs alone are about 0.3R a trade. Every coin is negative after costs in both
  halves, in every run.
- **The book's filters add nothing.** `gated` is no better than `rules`; the
  control shows the filters are not an edge.
- Mean net R is pulled down by very tight stops; net % per trade is not, and is
  negative everywhere.

Caveats: crypto, not the book's futures; EMA and pivots stand in for the
author's discretionary trend reading; zero-tick entry and stop offsets; today's
top ten coins chosen with hindsight (flatters it).

Verdict: no edge, before or after costs. Do not trade it as coded.

Audit: 179,516/179,516 (15m) and 47,661/47,661 (1h) trades satisfy the rules as written.
