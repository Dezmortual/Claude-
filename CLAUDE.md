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

## Replica skills

The eleven `replica-*` skills in `.claude/skills/` (recon, architect, design,
build, backend, test, diff, entrepreneur, brand, launch, deploy) were copied
from Jakeschincariol/replica-skill at commit 77c9436 (v1.0, MIT). Run them in
that order; each writes to a `replica/` folder in the project. Their Python
tools need only the standard library.

## Forecast app (replica clone)

`apps/web` is the Next.js app planned in `replica/` (recon, architecture, design, build log, `backend.md`, `launch/`). It is a
private, owner-only build: only `OWNER_EMAILS` can sign in, every feature is free, no payments. Run from inside
`apps/web`: `npm run db:setup` (migrations + seed), `npm run dev`, `npm run test:api` (see `replica/backend.md`),
`npx playwright test` (e2e on its own `forecast_test` database and `.next-e2e` build; see `replica/test-plan.md`).
Screens import only from `@/lib/data`; server-only code lives in `src/lib/server` and must never be imported by a
client component. Never commit `apps/web/.env.local`. Never use raw hex or non-token sizes in components: change
`replica/design/tokens.json`, then `npm run tokens`.
Hosting is Vercel since 2026-10-22 (https://proofcast100.vercel.app; Netlify's free credits ran out). Netlify or Vercel, one at a time (Vercel: root directory `apps/web`, `apps/web/vercel.json` with daily crons on
Hobby; see `replica/deploy.md`). Netlify: (`netlify.toml` at the repo root, env vars set in the Netlify UI with scope Functions, plus
`NETLIFY=true`); scheduled jobs run from the Netlify scheduled function `apps/web/netlify/functions/jobs.mts` (the GitHub workflow
`.github/workflows/forecast-jobs.yml` is the alternative and only runs from the default branch). The landing page `/welcome` is
public only with `PUBLIC_LANDING=true`, and every claim on it must be true of the running app.
