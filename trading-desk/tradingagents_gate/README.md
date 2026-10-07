# TradingAgents gate (Anthropic)

The `ta` arm runs
[TradingAgents](https://github.com/TauricResearch/TradingAgents) on Claude as a
gate on an existing strategy's signals. The strategy still finds every
candidate. For each one, a full TradingAgents run decides whether to take it.
The run covers the analysts, a bull/bear debate, the trader, the risk team and
the portfolio manager, all on that ticker and date.

| Rating | Long candidate | Short candidate |
| --- | --- | --- |
| Buy | take | wait |
| Overweight | take (`--ta-approve lean`, the default) | wait |
| Hold, or REVIEW (no readable rating) | wait | wait |
| Underweight | wait | take (`lean`) |
| Sell | wait | take |

The model never flips the side and never sizes the trade.

Wired into `donchian`, `example_sma` and `orb`, next to `rules` and `gated`.

## Setup

```bash
cd trading-desk
tradingagents_gate/setup.sh             # own venv: needs Python >= 3.11, pandas 3
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
```

TradingAgents is pinned to one commit (`requirements.txt`, and `TA_PIN` in
`core/ta_decider.py`). The desk's own Python never imports it.
`core/ta_decider.py` calls `worker.py` in that venv as a subprocess.

## Run

Always estimate first:

```bash
python3 donchian/run_backtest.py --arms rules gated ta --ta-estimate
python3 donchian/run_backtest.py --arms rules gated ta --ta-max-calls 1   # measure one real run
python3 donchian/run_backtest.py --arms rules gated ta --ta-max-calls 60
python3 donchian/run_backtest.py --arms rules gated ta --ta-offline       # replay from cache, free
python3 donchian/audit.py --arms rules gated ta

python3 example_sma/run_backtest.py --arms rules gated ta --split 2025-01-01 --ta-estimate
python3 orb/run_backtest.py --arms rules gated ta --start 2026-06-01 --ta-estimate
```

Defaults: `claude-sonnet-5-5` for the quick tier (analysts, researchers,
debaters, trader) and `claude-opus-5-5` for the deep tier (research manager,
portfolio manager). There is one debate round and one risk round. The analysts
are market, sentiment and news, plus fundamentals for stocks. Change them with
`--ta-quick-model`, `--ta-deep-model`, `--ta-analysts`, `--ta-debate-rounds` and
`--ta-effort`.

## What it costs

Each candidate costs one full TradingAgents run, which is many Claude calls, not
one. The printed cost is computed from the token counts each run reports, at
Anthropic list prices. Measure one run with `--ta-max-calls 1` before you start
a batch.

- `--ta-max-calls` (default 25) refuses to start if more new runs are needed,
  and stops the run if the cap is reached partway through.
- Answers are cached in `core/cache/ta_cache.jsonl` (gitignored), keyed on
  ticker, analysis date, models, analysts, rounds and the TradingAgents commit.
  Re-runs and `--ta-offline` are free and give identical decisions.
- The prefetch asks about every candidate in the window, including ones an
  arm later skips because it is already in a position. `--ta-workers 0` asks
  one at a time and pays only for candidates the engine actually reaches.

## Keeping the A/B honest

- **Same candidates.** With the `ta` arm, every arm trades only from
  `--trade-from`, which defaults to `--split`. The windowed numbers for `rules`
  and `gated` will therefore differ from a run over the full history.
- **Compare against `gated`, not `rules`.** Any filter raises a win rate. The
  question is whether TradingAgents beats the strategy's two if-statements. Use
  the method from `trading-desk-method`: t-stat on mean R, both arms, the
  stand-aside rate, and ranking power over all candidates (each logged
  decision carries a side-adjusted `ta_score` from -2 to +2).
- **No cross-talk between runs.** Each run gets a fresh, empty TradingAgents
  memory log. Otherwise its reflection step would feed earlier decisions and
  their realised returns into later ones.
- **No future bars.** TradingAgents filters prices to the analysis date. A
  strategy that decides on a daily close (Donchian, SMA) is asked about the
  signal date. ORB enters intraday, so it is asked about the session before.

## What a backtest of this cannot show

1. **The model may remember the answer.** Claude was trained on market history
   up to its training cutoff. Asked about SOL on a 2025 date, it may simply
   know what SOL did next. TradingAgents never hides the ticker or the date, so
   this can't be designed out. A good `ta` result on past dates is an upper
   bound. Real evidence can only come from dates after the model's cutoff,
   which means paper trading forward.
2. **Old news and sentiment are mostly missing.** Yahoo news, Reddit and
   StockTwits return their latest items, and TradingAgents drops anything
   outside the window. On historical dates the analysts mostly see prices and
   indicators. Live runs see far more, so they are a different decision process.
3. **About four years of history at most.** TradingAgents caches five years of
   prices back from today. Candidates older than about four years are refused
   (move `--trade-from` later).
4. **The rating is still sampled.** The cache makes a backtest reproducible.
   It does not make TradingAgents deterministic: a fresh run on the same day
   can rate it differently.

If `ta` does not beat `gated` with t above 2 on the test window, the honest
conclusion is that the strategy did not need it. Given point 1, even a win needs
a paper-trading confirmation before it means anything.
