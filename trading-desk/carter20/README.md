# 20 Forex Trading Strategies (5 minute), Thomas Carter

All 20 systems of Thomas Carter, "20 Forex Trading Strategies (5 Minute Time
Frame)" (2014), coded as written (`systems.py`, which also lists every reading
of a vague rule) and run on 5-minute bars built from HistData 1-minute BID
quotes; stops and targets are settled on the 1-minute path (`engine.py`).
`report.html` is the charted write-up.

```bash
python3 carter20/fx_data.py          # downloads 2018+ 1-minute data for 6 pairs (~5 min)
python3 carter20/run_backtest.py     # ~5 min
python3 carter20/audit.py            # re-verify every fill
```

## Results (first run, 2026-10-31)

2018-02-01 to 2026-10-23 (8.7 years), 694,856 trades. Each
system on the pairs the book names ("any" = EURUSD, GBPUSD, USDJPY, AUDUSD).
Round-trip cost per trade: EURUSD 1.0 pip, USDJPY 1.2, AUDUSD 1.3, GBPUSD 1.5,
USDCHF 1.6, GBPJPY 2.8. "Per trade" is the result as a % of the amount risked
(net R x 100). "Account" is the change in balance risking 1% of equity per
trade, compounded. Split at 2022-07-01.

| # | System | Pairs | Trades | Win | Per trade before costs | Per trade after costs | Train / test (after) | Account |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Stochastic + MACD + EMA5 close/open | EURUSD | 20,930 | 21.7% | -1.4% (t -7.1) | -6.4% (t -32.8) | -6.4% / -6.4% | -100.0% |
| 2 | EMA 10/21 zone pullback | EURUSD | 12,623 | 37.7% | +0.4% (t +0.4) | -16.2% (t -13.8) | -15.9% / -16.5% | -100.0% |
| 3 | Bollinger close outside + stochastic | EURUSD, GBPUSD, USDJPY, USDCHF | 22,573 | 68.0% | +2.0% (t +4.2) | -4.6% (t -9.7) | -3.6% / -5.7% | -100.0% |
| 4 | Bollinger middle-band touch | EURUSD, GBPUSD, GBPJPY | 76,100 | 46.8% | -0.7% (t -1.5) | -23.5% (t -46.8) | -22.4% / -24.5% | -100.0% |
| 5 | Shifted EMA ribbon, 15m/5m (no GHL/QTI) | EURUSD, GBPUSD, USDJPY, AUDUSD | 37,103 | 47.6% | -5.0% (t -9.2) | -25.0% (t -46.1) | -25.9% / -24.1% | -100.0% |
| 6 | EMA 14/21/50 on 5m and 1h | EURUSD | 4,105 | 29.7% | +0.2% (t +0.9) | -0.8% (t -2.6) | -1.0% / -0.5% | -27.1% |
| 7 | New York 08:00 box breakout | GBPJPY, GBPUSD | 3,089 | 31.5% | -1.7% (t -1.1) | -10.5% (t -7.0) | -8.2% / -13.0% | -96.6% |
| 8 | Bollinger 50 + RSI 3 + stochastic reversal | EURUSD, GBPUSD, USDJPY, AUDUSD | 23,558 | 46.1% | +0.8% (t +1.1) | -18.6% (t -25.0) | -20.6% / -16.7% | -100.0% |
| 9 | EMA 50/100 + MACD, half at 2R | EURUSD, GBPUSD, USDJPY, AUDUSD | 13,827 | 32.9% | -1.3% (t -1.1) | -8.0% (t -6.8) | -6.8% / -9.0% | -100.0% |
| 10 | EMA 40/80 + CCI zero cross | EURUSD, GBPUSD, USDJPY, AUDUSD | 48,878 | 48.9% | -2.4% (t -5.2) | -13.0% (t -27.8) | -12.5% / -13.4% | -100.0% |
| 11 | 4h trend + EMA 5/10 cross + RSI/stoch/MACD | EURUSD, GBPUSD, USDJPY, AUDUSD | 18,839 | 49.2% | -1.5% (t -2.0) | -6.6% (t -8.9) | -5.5% / -7.6% | -100.0% |
| 12 | EMA 16/48 + Laguerre | EURUSD, GBPUSD, USDJPY, AUDUSD | 23,753 | 54.1% | -0.9% (t -1.5) | -5.1% (t -8.6) | -4.5% / -5.7% | -100.0% |
| 13 | CCI 100 break + MACD | EURUSD, GBPUSD, AUDUSD | 64,560 | 59.7% | -1.7% (t -5.1) | -11.6% (t -35.4) | -11.6% / -11.6% | -100.0% |
| 14 | WMA/SMA + slow stoch + RSI 28 + MACD | EURUSD, GBPUSD, USDJPY, AUDUSD | 49,457 | 48.5% | -3.0% (t -6.5) | -16.5% (t -35.6) | -16.1% / -17.0% | -100.0% |
| 15 | EMA 15 over EMA 50 high/low channel + MACD | EURUSD, GBPUSD, USDJPY, AUDUSD | 73,452 | 47.2% | -4.1% (t -10.7) | -33.4% (t -84.2) | -35.1% / -31.5% | -100.0% |
| 16 | WMA 5/SMA 11 + Parabolic SAR + DI | EURUSD, GBPUSD, AUDUSD, USDCHF | 98,243 | 29.7% | -5.2% (t -12.9) | -25.3% (t -61.9) | -25.4% / -25.3% | -100.0% |
| 17 | EMA 3/8 + SAR + MACD + stoch + std dev | EURUSD, GBPUSD, USDJPY, AUDUSD | 11,050 | 30.2% | -2.5% (t -4.2) | -8.8% (t -14.6) | -8.7% / -8.8% | -100.0% |
| 18 | EMA 20 cross + MACD, half at 1R | EURUSD, GBPUSD, USDJPY, AUDUSD | 12,281 | 49.6% | -1.5% (t -1.5) | -5.7% (t -5.9) | -4.5% / -6.6% | -100.0% |
| 19 | EMA 100 + SAR + MACD 64/128 | EURUSD, GBPUSD, AUDUSD | 19,100 | 66.6% | -0.4% (t -0.7) | -7.4% (t -13.5) | -5.8% / -9.2% | -100.0% |
| 20 | EMA 3 through Bollinger middle + MACD | EURUSD, GBPUSD, USDJPY, AUDUSD | 61,335 | 49.7% | -0.4% (t -1.1) | -11.0% (t -26.5) | -11.8% / -10.2% | -100.0% |

What this says:

- **None is profitable.** Every system loses after costs, in both halves; the
  mildest is system 6 at t = -2.6.
- **There is almost no edge even before costs.** 16 of 20 lose before costs;
  only system 3 shows a gain that is not chance (+0.4 pips a trade, t = 4.2),
  and a 1.0-1.6 pip round trip turns it into a loss (-4.6% of risk per trade).
- **Small targets meet fixed costs.** Targets of 7-15 pips and hundreds to
  thousands of trades a year make the spread the dominant term.

Rule for writing a Pine script: net R > 0 with t >= 2 over the whole period and
net R > 0 in both halves. No system met it, so none was written.

Caveats: system 5 omits two undefined custom indicators (GHL, QTI); system 15's
arrow is replaced by a close crossing the 15 EMA; system 6 has no stop in the
book and uses a 100-pip emergency stop; no commission, swap or news filter. In
1,179 minutes a stop and target fell inside the same minute and the stop was taken.

Audit: 694,856/694,856 trades satisfy the fill rules (`audit.py`: entries, stop and
target levels on the 1-minute path, no overlaps). The signal logic itself is
not re-derived by the audit.
