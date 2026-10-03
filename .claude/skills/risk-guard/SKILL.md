---
name: risk-guard
description: Stateful risk kill-switch with a per-trade dollar cap and a daily drawdown limit. Use before any order ("am I within risk?"), to record opened and closed trades, or to show session P&L. A veto (exit 2) is final; there is no override.
---

# risk-guard

This is the only part of the toolkit that keeps state. The ledger is a JSON file at `~/.claude/skills/risk-guard/state.json` (override the path with `RISK_GUARD_STATE`). It holds the session date, start equity, realized P&L, the caps, and every open and closed trade.

## Run

```bash
G=.claude/skills/risk-guard/guard.py
python $G init --equity 500                       # defaults: $50/trade, -$200/day
python $G check --risk-usd 25                     # exit 0 = OK, exit 2 = VETO
python $G open --order-link-id clive-SOLUSDT-1700000000000 --symbol SOLUSDT --side buy \
               --qty 11.2 --entry 148.20 --sl 145.97 --tp 151.16 --risk-usd 25
python $G close --order-link-id clive-SOLUSDT-1700000000000 --exit 151.16 --realized-pnl 32.10
python $G status [--json]
```

## `check` vetoes (exit 2) when

- there is no state file, or the session is from an earlier UTC day
- `--risk-usd` is above the per-trade cap
- realized P&L is already at or below `-daily_limit`
- realized P&L, minus the risk on all open trades, minus this trade's risk, would go past `-daily_limit`

`init` refuses to reset a session that already has trades on the same UTC day, so re-running it can't wipe the daily limit. Open trades carry over into a new day's session.

## Agent rules

- Run `check` before every order, and stop on a non-zero exit. Show the user the VETO reason exactly as printed.
- Never edit `state.json` by hand, and never run `init` just to get past a veto.
- `bybit-trade` already calls `check`, `open` and `close` itself as subprocesses. For any other execution path, call them yourself.
