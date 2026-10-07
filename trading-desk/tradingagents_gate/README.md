# TradingAgents gate

The `ta` arm for `donchian/run_backtest.py`: the same Donchian candidates,
filtered by [TradingAgents](https://github.com/TauricResearch/TradingAgents),
a multi-agent LLM framework running on Claude.

```bash
cd trading-desk
bash tradingagents_gate/setup.sh
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
python3 donchian/run_backtest.py --arms rules gated ta --ta-estimate
python3 donchian/run_backtest.py --arms rules gated ta --ta-max-calls 1   # one real run, prints its cost
```

## How it decides

For each candidate, TradingAgents runs its crypto pipeline as of the signal
bar's date: market, social and news analysts, a bull and bear debate, a trader,
a risk panel and a manager. Its rating decides the trade:

| Candidate | Taken on | Otherwise |
| --- | --- | --- |
| long | Buy, Overweight | stand aside |
| short | Sell, Underweight | stand aside |

Hold, `REVIEW` (no readable rating) and anything else stand aside.

TradingAgents does its own research on the ticker and date. It is never told a
breakout fired, so the arm asks "would TradingAgents lean this way here?".

## Cost and safety

- **It never runs without a cap.** `--ta-max-calls N` limits new TradingAgents
  runs. If the cap is hit before every candidate is decided, the arm is marked
  INCOMPLETE and none of its trades are reported as a result.
- **`--ta-estimate` makes no calls.** It counts the candidates in the window
  and prices them. Until a real run exists, the price per run is an assumption
  (about $1.08) and says so. After a real run it uses the measured cost.
- **Answers are cached** in `cache/ta_cache.jsonl`, keyed by symbol, date,
  side and settings. A rerun replays them for free and gets identical results.
- **It only decides from the split date on** (2025-01-01) unless you pass
  `--ta-from`. That is the out-of-sample window, and all arms are compared on
  it. About 50 to 80 decisions.

Models: `claude-opus-5-5` for the two manager calls, `claude-sonnet-5-5` for
everything else. Change them with `TRADINGAGENTS_DEEP_THINK_LLM` and
`TRADINGAGENTS_QUICK_THINK_LLM` in `.env`. Settings are part of the cache key,
so a model change starts a fresh set of answers.

## Point in time

TradingAgents clamps every price, news and social query to the run's date, and
only uses lessons from its memory that were resolved by then. The gate keeps
that memory in `cache/<settings>/` so it never mixes with any other use of
TradingAgents. Yahoo, Reddit and StockTwits only serve recent items, so for
older dates the news and social analysts mostly report that nothing is
available. Expect the market analyst to carry most early decisions.

## Known caveat

On `claude-opus-5-5` and `claude-sonnet-5-5`, LangChain cannot force
structured output, so the manager's structured answer can fail. TradingAgents
then retries once as free text. That costs an extra call, and a free-text
answer with no readable rating comes back as `REVIEW`. The run report counts
ratings: if `REVIEW` is common, the arm is standing aside because of parsing,
not judgment.

`setup.sh` pins TradingAgents to commit `1394a3f`. Moving the pin changes the
agents' prompts, so clear `cache/` when you do.
