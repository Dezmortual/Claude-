# Sweep, hourly crypto

A port of `sweep_indicator.pine` (repo root): long when the 4-period EMA of
close crosses above the session VWAP, short when it crosses below, always in
the market with reversals, and a 0.005 ATR trailing stop with no hard stop.
`strategy.py` explains the simulator and the two trailing-stop modes.

```bash
python3 sweep/run_backtest.py     # downloads Binance hourly candles on first run (~20 min)
python3 sweep/audit.py            # re-verify every trade
```

## Results (first run, 2026-10-07)

Ten Binance USDT pairs (BTC, ETH, BNB, SOL, XRP, DOGE, ADA, TRX, AVAX, LINK),
1-hour bars from 2020-01-01 (SOL and AVAX from their listing) to 2026-10-07.
VWAP resets at 00:00 UTC. 0.05% commission per side, as in the Pine script,
plus 2 bps slippage per side. Split at 2025-01-01. Returns are per trade, as a
percentage of the position.

| Run | Trades | Win | Net per trade | t | Before costs | 2025+ net |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| honest trail | 69,442 | 38.3% | −0.133% | −32.0 | +0.007% (t = 1.8) | −0.132% |
| TradingView same-bar trail | 69,442 | 78.0% | +0.518% | +132.9 | +0.658% | +0.362% |

What this says:

- **It loses money on every coin, in both halves.** All twenty per-coin,
  per-period results are negative after costs, with t between −3.8 and −13.4.
  An equal-weight account goes to zero.
- **Before costs it breaks even.** +0.007% per trade with t = 1.8 is no edge,
  and each round trip costs 0.14%. A zero-fee exchange would not rescue it.
- **It trades about 3 times a day per coin.** 98% of trades end within two
  bars. The 0.005 ATR trail sits a hair under the last high, so the next bar
  almost always takes it out.
- **No hard stop is what hurts.** Trailing-stop exits average +0.11% before
  costs, but the 16% of trades that never arm the trail ride until the opposite
  signal and average −0.52%.
- **The TradingView row is fiction.** Letting a bar's own high move a stop
  that sits 0.005 ATR below it, then filling on that bar's low, books nearly
  the whole bar's range as profit on most trades. The account "grows" by a
  number with 22 digits. If the TradingView strategy tester shows a high win
  rate for this script, this is why.

Caveat in its favour: the honest trail ignores any intrabar ratcheting, which
TradingView overstates and this understates. The gross result is close to zero
either way, and costs are 20 times that, so it does not change the verdict.
Caveat against it: today's top ten coins were chosen with hindsight.

Verdict: no edge, before or after costs. Do not trade it.

Audit: 69,442/69,442 trades satisfy the rules as written.
