---
name: bybit-trade
description: Place, close, list, and sync Bybit v5 USDT perpetual bracket orders (market entry with native stop-loss and take-profit). Testnet by default; mainnet needs both --live and BYBIT_ENV=live. Use only after scalp-plan and risk-guard, and only after the user explicitly confirms the exact order.
---

# bybit-trade

Authenticated execution against Bybit v5 linear perps.

## Subcommands

```bash
T=.claude/skills/bybit-trade/trade.py

# Dry-run: builds and signs the request but never POSTs (works without keys)
python $T place --symbol SOLUSDT --side buy --qty 11.2 --sl 145.97 --tp 151.16 --risk-usd 25 --dry-run

# Testnet (default)
BYBIT_API_KEY=... BYBIT_API_SECRET=... \
python $T place --symbol SOLUSDT --side buy --qty 11.2 --sl 145.97 --tp 151.16 --risk-usd 25

python $T positions            # open USDT positions
python $T close --symbol SOLUSDT   # reduceOnly market flatten, records P&L in risk-guard
python $T sync                 # record closes for trades that hit SL/TP on the exchange

# MAINNET: real money. Both signals are required.
BYBIT_ENV=live BYBIT_API_KEY=... BYBIT_API_SECRET=... python $T place --live ...
```

## What `place` does, in order

1. Picks testnet or mainnet. Mainnet only if `--live` **and** `BYBIT_ENV=live`; `--live` alone aborts.
2. Runs `risk-guard check --risk-usd` as a subprocess. Any non-zero exit aborts, and the veto is printed verbatim.
3. Fetches `tickSize`, `qtyStep` and min/max qty. Floors qty to the step. Rounds SL away from price and TP toward it.
4. Checks that SL and TP sit on the correct sides of the last price.
5. Aborts if `qty × |last − sl|` plus taker fees is more than `--risk-usd` + 10%. The declared risk has to be honest.
6. Refuses to add to an existing position on the symbol.
7. Sends a market IOC order with `stopLoss`/`takeProfit` (`LastPrice` triggers, `tpslMode=Full`) and an idempotent `orderLinkId` of `clive-{symbol}-{unix_ms}`.
8. Confirms the fill, then calls `risk-guard open` with the filled qty and average price.

Bybit errors are printed exactly as returned. Order endpoints are never retried.

## Agent rules

- Never put keys on the command line, or print or log them. They come from the environment only.
- Before any non-dry-run `place`, show the user the exact symbol, side, qty, SL, TP and risk, and wait for an explicit yes.
- Never pass `--live` unless the user explicitly asked for mainnet in this conversation.
- Run `sync` at the start of a session and after any trade has had time to hit SL/TP, so risk-guard's realized P&L stays accurate.
