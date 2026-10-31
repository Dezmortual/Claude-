# MMC Footprint (D'Operandi Capital notes)

The setups in the "MMC Footprint" notes with rules firm enough to code
(`setups.py`, `footprint.py`), on six forex pairs at 15-minute, 1-hour and
4-hour bars. Data, costs and the 1-minute fill engine are shared with
`carter20/`. `report.html` is the charted write-up.

```bash
python3 carter20/fx_data.py      # if core/cache/fx_1m/ is empty
python3 mmc/run_backtest.py      # ~2 min
python3 mmc/audit.py             # re-verify every fill (~1 min)
```

## Results (first run, 2026-10-31)

2018-02-01 to 2026-10-23 (8.7 years), 93,441 trades on EURUSD,
GBPUSD, USDJPY, USDCHF, AUDUSD and GBPJPY. Round-trip cost per trade: EURUSD
1.0 pip, USDJPY 1.2, AUDUSD 1.3, GBPUSD 1.5, USDCHF 1.6, GBPJPY 2.8. "Per trade"
is net R x 100, the result as a % of the amount risked. "Account" is the change
in balance risking 1% per trade, compounded. Split at 2022-07-01. For the
footprint every added unit is a row.

| Setup | TF | Trades | Win | Per trade before costs | Per trade after costs | Train / test (after) | Account |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2B false breakout + pokebar | 15m | 17,212 | 33.1% | -0.8% (t -0.7) | -16.3% (t -14.7) | -15.2% / -17.4% | -100.0% |
| 2B false breakout + pokebar | 1h | 4,167 | 32.2% | -3.6% (t -1.6) | -10.5% (t -4.8) | -11.0% / -9.9% | -99.2% |
| 2B false breakout + pokebar | 4h | 1,047 | 34.3% | +2.4% (t +0.5) | -0.9% (t -0.2) | -7.1% / +5.7% | -17.8% |
| 2B with the daily trend | 15m | 10,528 | 33.5% | -0.1% (t -0.1) | -15.8% (t -11.2) | -14.9% / -16.7% | -100.0% |
| 2B with the daily trend | 1h | 2,440 | 31.9% | -4.5% (t -1.6) | -11.3% (t -4.0) | -10.9% / -11.8% | -95.1% |
| 2B with the daily trend | 4h | 540 | 35.4% | +6.0% (t +1.0) | +2.7% (t +0.4) | -2.3% / +7.6% | +9.5% |
| RSI divergence, 2nd swing | 15m | 18,553 | 34.4% | +3.8% (t +3.4) | -17.9% (t -15.9) | -18.7% / -17.0% | -100.0% |
| RSI divergence, 2nd swing | 1h | 5,226 | 34.5% | +4.0% (t +2.0) | -6.1% (t -3.0) | -6.3% / -5.9% | -97.6% |
| RSI divergence, 2nd swing | 4h | 1,455 | 34.0% | +2.1% (t +0.6) | -3.1% (t -0.8) | -5.4% / -0.5% | -44.9% |
| MMC footprint + leverage | 15m | 23,685 | 28.7% | -4.0% (t -4.7) | -13.5% (t -15.5) | -14.0% / -13.0% | -100.0% |
| MMC footprint + leverage | 1h | 6,761 | 32.9% | -1.7% (t -1.1) | -5.9% (t -4.0) | -1.5% / -10.9% | -98.8% |
| MMC footprint + leverage | 4h | 1,827 | 33.7% | -4.0% (t -1.7) | -5.8% (t -2.4) | -3.7% / -8.2% | -68.7% |

What this says:

- **None of the 12 is profitable.** The only after-cost gain, the 2B with the
  daily trend on 4h (+2.7% of risk per trade), has t = 0.4 and lost in the
  first half.
- **RSI divergence has a real edge before costs** on 15m (+3.8%, t = 3.4) and
  1h (+4.0%, t = 2.0), but its stops are only about 11 and 23 pips, and the
  spread turns it into -17.9% and -6.1%.
- **Leverage does not rescue the footprint.** 64% of campaigns never add a
  unit; 21-25% of campaigns end in profit; every timeframe loses before costs.

Rule for writing a Pine script: net R > 0 with t >= 2 over the whole period and
net R > 0 in both halves. Nothing met it, so none was written.

Not modelled: hand-drawn support/resistance zones and reversal-candle
confirmation, the 5m/30m "chord" pairing, commission, swap and news filters.
The notes give no profit targets for the 2B and divergence setups; 2R is used.

Audit: 93,441/93,441 trades satisfy the fill rules (`audit.py`).
