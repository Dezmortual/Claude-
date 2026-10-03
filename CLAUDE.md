# Trading agent instructions

This repo gives you skills to trade Bybit USDT perpetuals. They live in `.claude/skills/`. Each skill is a folder with a `SKILL.md` and one Python script. The only dependency is `requests`.

## Workflow

Run these in order. Every step is a separate process, so you can stop between steps and show the user the output.

1. **Scan**: `python .claude/skills/bybit-scan/scan.py --top 5`
2. **Structure**: `python .claude/skills/bybit-structure/structure.py SYMBOL`. This also gives you the tick size, qty step and min qty.
3. **Plan**: `python .claude/skills/scalp-plan/plan.py --equity ... --risk ... --side ... --entry ... --tick ... --lot ... --min-qty ...`
4. **Risk-gate**: `python .claude/skills/risk-guard/guard.py check --risk-usd N`. It must exit 0.
5. **Execute**: `python .claude/skills/bybit-trade/trade.py place ...`. Run `--dry-run` first, then testnet.
6. **Track**: `trade.py sync` / `trade.py close --symbol ...` / `guard.py status`

If there's no risk-guard session for today (UTC), run `guard.py init --equity N` once.

## Hard rules

1. **risk-guard is final.** A non-zero exit from `check` means no trade. Never edit `state.json` by hand, re-run `init` to clear a veto, or route around it.
2. **Confirm before every real order.** Show the symbol, side, qty, SL, TP and dollar risk, then wait for an explicit yes. Dry-runs don't need confirmation.
3. **Testnet by default.** Only pass `--live` when the user explicitly asks for mainnet in this conversation. Mainnet also needs `BYBIT_ENV=live`, which the user sets themselves.
4. **Keys come from the environment only.** Never put keys on the command line, and never print, log, or write them to files. Never read `.env` aloud.
5. **Show errors verbatim.** Show whatever Bybit or a script prints. Never invent a fallback, and never retry an order.
6. **No stacking.** Don't open a second position on a symbol that already has one.
7. **Declare risk honestly.** Use scalp-plan's `risk_actual` (rounded up) for `--risk-usd`. `trade.py` aborts if qty × stop distance is more than 10% above it.
8. **Never move a stop further away** from entry after the trade is open.
9. **Analysis isn't advice.** Scan and structure output are heuristics. Say so when you present candidates.

## Other files

`*.pine` are TradingView indicators (Sweep, SOL Donchian, crypto Donchian scanner). They don't connect to the Python skills.
