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
  (`--source binance --out donchian/out_scanner` reruns it on the scanner's 20 coins)
- `python3 sweep/run_backtest.py` then `python3 sweep/audit.py`: the Sweep port
  of `sweep_indicator.pine` on hourly Binance candles (cached in `core/cache/`,
  never committed); results in `sweep/README.md`
- `python3 trend/run_backtest.py`, `trend/audit.py`, `trend/robustness.py`: three
  published strategies (Faber SMA, crypto time-series momentum, dual momentum)
  tested after their publication dates; results in `trend/README.md`
- `python3 anticlimax/run_backtest.py` then `python3 anticlimax/audit.py`: the
  Anti-Climax port of `anti_climax_strategy.pine` on 15m Binance candles
  (`--interval 1h --out anticlimax/out_1h` for hourly); results in
  `anticlimax/README.md`, charts in `anticlimax/report.html`
- `python3 breakout/run_backtest.py` then `python3 breakout/audit.py`: the
  flat-base breakout from `breakout_strategy.pine` on today's S&P 500 (daily,
  yfinance, needs `pip install yfinance`); results in `breakout/README.md`,
  charts in `breakout/report.html`
- `--arms rules gated ta` adds a TradingAgents filter (`tradingagents_gate/`):
  needs `bash tradingagents_gate/setup.sh` and `ANTHROPIC_API_KEY` in `.env`. It
  costs money per decision: price it with `--ta-estimate` and always pass
  `--ta-max-calls`. Never commit `tradingagents_gate/cache/`.

Keep each strategy one level under `trading-desk/`, because strategies import
`core/` as `../core`. Never commit `trading-desk/.env`. Read the
`trading-desk-method` skill before reporting any backtest result.
