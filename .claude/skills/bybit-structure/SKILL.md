---
name: bybit-structure
description: Summarize market structure for one Bybit USDT perpetual — trend vs range, ATR(14), VWAP, swing highs/lows, plus tick size and qty step. Use when the user asks about the structure, trend, or levels on a symbol, or before sizing a trade. Public data only, no API keys.
---

# bybit-structure

Pulls the last `--lookback` one-minute candles (default 120, max 1000) and reports:

- **VWAP** over the lookback, and how far the last price is from it
- **ATR(14)** (Wilder), absolute and as % of price
- **Swing high/low** over the last 60 minutes and over the full lookback, with distance from last
- **Trend**: `up` / `down` / `range`. It fits a least-squares line to the last 60 closes and projects it across those 60 minutes. If that move is at least `--trend-atr` × ATR (default 1.5), the trend is up or down; otherwise it's range.
- **Instrument filters**: `tick_size`, `qty_step`, `min_qty`, `max_leverage`. Pass these straight into `scalp-plan`.

## Run

```bash
python .claude/skills/bybit-structure/structure.py SOLUSDT
python .claude/skills/bybit-structure/structure.py BTCUSDT --lookback 180 --json
```

This is a heuristic, not a signal. Use it to answer "is this trending or chopping?" with numbers. Use ATR to pick a stop distance (for example 1–2 ATR beyond the nearest swing).
