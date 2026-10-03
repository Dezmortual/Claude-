---
name: bybit-scan
description: Rank Bybit USDT perpetuals by a 15-minute volatility spike, filtered for liquidity and tight spreads. Use when the user asks to scan Bybit, find movers, or look for scalp candidates. Public data only, no API keys.
---

# bybit-scan

Screens every Bybit USDT linear perp. A symbol only counts if its 24h turnover is at least `--min-turnover` (default $50M) and its spread is at most `--max-spread-bps` (default 5). For each one it pulls 60 one-minute candles and computes:

| field | meaning |
|---|---|
| `range_15m_pct` | high-low range of the last 15 minutes, % of last price |
| `range_prior_pct` | high-low range of the 45 minutes before that |
| `spike_ratio` | `range_15m_pct / range_prior_pct` |
| `change_15m_pct` | close-to-close move over the last 15 minutes |

It keeps symbols where `spike_ratio >= 1.3` and `range_15m_pct >= 0.4`, then ranks them by `spike_ratio × range_15m_pct`.

## Run

```bash
python .claude/skills/bybit-scan/scan.py --top 5
python .claude/skills/bybit-scan/scan.py --min-turnover 100000000 --min-spike 1.5 --json
```

Exits 0 even when nothing passes, and says so. Exits 1 on network or API errors, printing the error as Bybit returned it.

## Next step

Pass a candidate to `bybit-structure` before planning any trade. A spike alone is not a signal.
