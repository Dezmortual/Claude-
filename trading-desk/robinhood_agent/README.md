# Robinhood AI trading agent

Claude Code connected to a Robinhood Agentic account through Robinhood's MCP
server. It scans a watchlist, checks setups against your written rules, and
places limit orders. A code-enforced gate (`gate.py`) has the final say on
every order. Based on HackerNoon's "How to Build an Autonomous AI Trading
Agent on Robinhood".

**Real money.** Fund the Agentic account only with money you can afford to
lose. The default rules are an untested example, not advice. `rules.json`
ships in `dry_run` mode.

## Files

| File | What it is |
|---|---|
| `watchlist.txt` | The only symbols the agent may buy |
| `STRATEGY.md` | Entry and exit rules in plain English (edit these) |
| `rules.json` | Hard limits and `mode` (`dry_run` / `live`) |
| `gate.py` | Approves or rejects each order against `rules.json`; writes `trade_log.jsonl` |

## Setup

1. Open a Robinhood **Agentic** account (desktop; rollout is staged) and fund it.
2. Connect the MCP server (local scope, so it stays on your machine):
   ```
   claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading
   ```
3. In Claude Code run `/mcp`, pick `robinhood-trading`, and sign in.
4. Edit `watchlist.txt`, `STRATEGY.md` and `rules.json`.

## The gate

```
python3 gate.py status
python3 gate.py check --side buy --symbol NVDA --qty 1 --limit-price 120.50 \
    --bid 120.40 --ask 120.55 --equity 5000 --cash 3000 \
    --position-value 0 --open-positions 2 --day-pnl -12.40
python3 gate.py log --side buy --symbol NVDA --qty 1 --price 120.50 \
    --status dry_run --reason "pullback to 20 SMA"
```

`check` exits 0 only when every limit passes. Buys must clear: watchlist,
market hours (9:30–16:00 ET weekdays, holidays not modelled), limit orders
only, spread, max order size, max position % of equity, max open positions,
cash buffer, daily loss limit, buys per day, and a per-symbol cooldown. Sells
are never blocked by the daily limits but cannot exceed the shares held.
In `dry_run` mode an approved order is logged, never placed.

## Going live

Run in `dry_run` for at least a couple of weeks and read `trade_log.jsonl`.
Only then set `"mode": "live"` in `rules.json` yourself.
