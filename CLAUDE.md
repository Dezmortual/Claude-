# Repository notes for Claude

## Trading desk

`trading-desk/` is a workspace scaffolded from the trading-desk plugin
(aabrole/claude-trading-desk), which `.claude/settings.json` enables for this
repo. Its skills and the `/trading-desk-new-strategy` and `/trading-desk-deploy`
commands load at session start.

Run everything from inside `trading-desk/`:

- `python3 example_sma/run_backtest.py` needs no API key (uses yfinance)
- `python3 orb/run_backtest.py --arms rules gated` needs `ORB_ALPACA_KEY` and
  `ORB_ALPACA_SECRET` in `trading-desk/.env` (free Alpaca paper account)
- `python3 dashboard/server.py` serves the desk on http://localhost:8080
- `python3 donchian/run_backtest.py` then `python3 donchian/audit.py`: the SOL
  Donchian port of `sol_donchian_indicator.pine`; results in `donchian/README.md`

Keep each strategy one level under `trading-desk/`, because strategies import
`core/` as `../core`. Never commit `trading-desk/.env`. Read the
`trading-desk-method` skill before reporting any backtest result.
