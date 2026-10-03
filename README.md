# Claude trading skills

Claude Code skills for scanning, analysing, sizing, risk-gating and executing Bybit USDT perpetual trades. There's also a set of TradingView Pine indicators.

Each step is a separate script, so the agent can be stopped, audited, or piped between steps at any point. Nothing is hidden behind a single `trade()` call.

```
bybit-scan ──► bybit-structure ──► scalp-plan ──► risk-guard check ──► bybit-trade
 (public)        (public)          (pure math)    (local state.json)   (testnet default)
```

## Install

```bash
pip install requests
```

Claude Code finds the skills in `.claude/skills/` and reads `CLAUDE.md` automatically.

## Skills

| skill | script | needs keys | what it does |
|---|---|---|---|
| `bybit-scan` | `scan.py` | no | Ranks liquid, tight-spread USDT perps by 15-minute range spike vs the prior 45 minutes |
| `bybit-structure` | `structure.py` | no | VWAP, ATR(14), swings, up/down/range trend, tick size and qty step for one symbol |
| `scalp-plan` | `plan.py` | no | Qty, stop, TP, notional, margin, R:R. Rounding never understates risk; fees included |
| `risk-guard` | `guard.py` | no | Per-trade cap ($50) and daily drawdown (-$200) kill-switch, plus a trade ledger |
| `bybit-trade` | `trade.py` | yes | Market + native SL/TP bracket, close, positions, sync. Testnet by default |

## Typical session

```bash
S=.claude/skills
python $S/bybit-scan/scan.py --top 5
python $S/bybit-structure/structure.py SOLUSDT
python $S/scalp-plan/plan.py --equity 500 --risk 25 --side long --entry 148.20 \
    --symbol SOLUSDT --tick 0.01 --lot 0.1 --min-qty 0.1 --leverage 10

python $S/risk-guard/guard.py init --equity 500
python $S/risk-guard/guard.py check --risk-usd 25

python $S/bybit-trade/trade.py place --symbol SOLUSDT --side buy --qty 15.1 \
    --sl 146.71 --tp 151.16 --risk-usd 25 --dry-run
BYBIT_API_KEY=... BYBIT_API_SECRET=... \
python $S/bybit-trade/trade.py place --symbol SOLUSDT --side buy --qty 15.1 \
    --sl 146.71 --tp 151.16 --risk-usd 25            # testnet

python $S/bybit-trade/trade.py sync                  # record SL/TP hits
python $S/risk-guard/guard.py status
```

## Safety design

- **The risk gate runs in a separate process.** `trade.py` runs `guard.py check` as a subprocess and aborts on any non-zero exit. There is no override flag.
- **The daily limit can't be reset.** `init` refuses to restart a session that already has trades on the same UTC day. A stale session from yesterday is vetoed until you run `init` again.
- **Open risk counts.** `check` adds the risk of every open trade to the new one before comparing against the daily limit.
- **Declared risk is checked.** `trade.py` aborts if qty × stop distance plus fees is more than `--risk-usd` + 10%.
- **Mainnet needs two signals:** the `--live` flag and `BYBIT_ENV=live`.
- **Keys come from the environment only.** They're never accepted as arguments, and they're masked in dry-run output.
- **Orders are idempotent and can't stack.** Each order carries an `orderLinkId` of `clive-{symbol}-{unix_ms}`. `trade.py` refuses to add to an existing position.
- **Errors come through verbatim.** Order endpoints are never retried.

Risk state lives at `~/.claude/skills/risk-guard/state.json` (override with `RISK_GUARD_STATE`). It's plain JSON. Read it, don't edit it.

## Not included

This repo doesn't include the StrategyFactory webhook path (Blofin, Toobit, WEEX routing) from `daviddme/claude-skills`. That service decrypts your exchange keys on its own server, so using it means trusting that operator with live trading credentials. If you add it, call `risk-guard check`, `open` and `close` yourself around every webhook order.

## Pine indicators

- `sweep_indicator.pine`: EMA/VWAP trailing-stop sweep indicator with a trade stats dashboard
- `sol_donchian_indicator.pine`: SOL Donchian breakout indicator with trade stats
- `crypto_donchian_scanner.pine`: multi-symbol Donchian scanner

## Disclaimer

This is not financial advice. Leveraged perpetuals can lose more than you expect, quickly. Test on testnet first.
