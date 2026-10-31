# FX GOAT: NASDAQ Trading Strategy

The three setups of the "FX GOAT" NASDAQ notes (V pattern and inverse, Z
pattern, support/resistance with rejection candles), coded as fixed rules in
`setups.py` and run on the NASDAQ-100 at 15-minute, 1-hour and 4-hour bars.
Data loader and 1-minute fill engine are shared with `carter20/`.
`report.html` is the charted write-up.

```bash
python3 -c "import sys; sys.path.insert(0,'carter20'); import fx_data; fx_data.download(['NSXUSD'])"
python3 goat/run_backtest.py     # ~20 s
python3 goat/audit.py            # re-verify every fill
```

## Results (first run, 2026-10-31)

HistData NSXUSD (NASDAQ-100 CFD) 1-minute bars, 2018-02-01 to 2026-10-23
(8.7 years), 20,334 trades. Cost: 2 index points per round
trip. "Per trade" is net R x 100, the result as a % of the amount risked.
"Account" is the change in balance risking 1% per trade, compounded. Split at
2022-07-01.

| Setup | TF | Trades | Win | Per trade before costs | Per trade after costs | Train / test (after) | Account |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| V pattern and inverse | 15m | 2,414 | 43.7% | -1.6% (t -0.6) | -12.8% (t -4.8) | -15.2% / -10.1% | -96.3% |
| V pattern and inverse | 1h | 580 | 50.7% | +3.8% (t +0.7) | -1.4% (t -0.2) | -7.6% / +5.3% | -12.4% |
| V pattern and inverse | 4h | 180 | 45.6% | +17.9% (t +1.5) | +14.4% (t +1.2) | +30.8% / -4.0% | +26.5% |
| Z pattern (break and retest) | 15m | 8,006 | 54.3% | -1.5% (t -1.4) | -13.1% (t -12.9) | -16.0% / -10.0% | -100.0% |
| Z pattern (break and retest) | 1h | 2,389 | 57.8% | -5.6% (t -3.3) | -12.0% (t -7.1) | -13.8% / -10.0% | -94.8% |
| Z pattern (break and retest) | 4h | 668 | 62.6% | +1.7% (t +0.4) | -2.0% (t -0.5) | -2.1% / -1.8% | -15.2% |
| Support/resistance + rejection candle | 15m | 4,623 | 47.4% | -3.1% (t -1.8) | -15.7% (t -9.1) | -15.9% / -15.5% | -99.9% |
| Support/resistance + rejection candle | 1h | 1,161 | 47.6% | -2.0% (t -0.6) | -9.6% (t -2.7) | -7.4% / -11.8% | -70.0% |
| Support/resistance + rejection candle | 4h | 313 | 47.9% | -10.8% (t -1.4) | -14.8% (t -2.0) | -6.3% / -23.4% | -38.8% |

What this says:

- **None of the 9 is profitable.** Eight lose after costs. The V pattern on 4h
  gains +14.4% of risk per trade over 180 trades (t = 1.2), all from trades
  opened before mid-2022 (+30.8%); those opened after lost 4.0%.
- **15-minute charts lose 13-16% of risk per trade** for every setup.
- **Support/resistance rejection candles lose before costs** on every timeframe.
- The NASDAQ-100 rose about 4.2 times over the period; long trades still show
  no significant edge in any setup.

Rule for writing a Pine script: net R > 0 with t >= 2 over the whole period and
net R > 0 in both halves. Nothing met it, so none was written.

Readings of vague rules (all in `setups.py`): "pick a direction for the day" =
price above/below the 00:00 UTC open; a retest is within 0.25 ATR(14) of the
level; a rejection candle closes back past the level, in the trade's direction
or with a wick twice its body; targets are the previous swing high/low as the
notes say. Not modelled: hand-drawn channels and triangles, commission,
overnight financing, news.

Audit: 20,334/20,334 trades satisfy the fill rules (`audit.py`).
