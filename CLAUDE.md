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
- `--arms rules gated ta` adds a TradingAgents filter (`tradingagents_gate/`):
  needs `bash tradingagents_gate/setup.sh` and `ANTHROPIC_API_KEY` in `.env`. It
  costs money per decision: price it with `--ta-estimate` and always pass
  `--ta-max-calls`. Never commit `tradingagents_gate/cache/`.

Keep each strategy one level under `trading-desk/`, because strategies import
`core/` as `../core`. Never commit `trading-desk/.env`. Read the
`trading-desk-method` skill before reporting any backtest result.

## Ruflo

Ruflo (npm `ruflo`, github ruvnet/ruflo) was installed with
`npx ruflo@3.56.3 init --no-global --no-codex-detect --no-skills-sh --no-plugin-install`.
It added `.claude/{skills,agents,commands,helpers}`, hooks and a status line in
`.claude/settings.json`, the `claude-flow` MCP server in `.mcp.json` (pinned to
3.56.3), the `ruflo-mods`, `ruflo-swarm` and `ruflo-console` plugins, and runtime
config in `.claude-flow/`. Its local databases (`.swarm/`, `ruvector.db`) are
gitignored. Update with `npx ruflo@latest init upgrade --settings`, and keep the
trading-desk entries in `settings.json` when you do.

## Day Trader skills

`.claude/skills/trader-*` are the eleven skills from
github.com/Jakeschincariol/day-trader-skill (MIT, copied at commit 3d0f4ef;
LICENSE in each folder). Their tools are stdlib Python that read Yahoo, Nasdaq
Trader, SEC EDGAR and the House Clerk, and write state to a `trader/` folder.
Only `/trader-broker` can lead to an order, after `/trader-risk` passes it and
the user types yes. Update by re-copying the `trader-*` folders from the repo.
