# desk247 prompts

These are the only places an LLM works in this system. All of them are
read-only reviews. Orders, sizing, stops and limits are code; no prompt output
can place, change or approve an order. You approve entries yourself with
`python3 desk247/run.py approve`.

Paste each prompt into Claude Code from inside `trading-desk/`.

## 1. Daily review (5 minutes, every morning)

```
Read trading-desk/state/desk247/summaries/<YESTERDAY>.md and the last 24 hours of
trading-desk/state/desk247.events.jsonl. Do not run any command that changes state.
Report, in this order:
1. Did every hourly tick run? List any gap over 2 hours between heartbeats.
2. Every WARN or CRITICAL alert, what caused it, and whether it is resolved.
3. Positions, entries and stops: do they match what strategy.py and risk.py say
   they should be, given the events? Flag any mismatch with the event that shows it.
4. Any order in pending_approval, partially_filled, rejected or expired, and why.
5. One line: "no action needed" or the single thing I should do today.
Quote the log lines you rely on. If something cannot be confirmed from the files, say so.
```

## 2. Weekly research review (Monday, after the rebalance tick)

```
Run `python3 desk247/run.py research` and show me the output. Then, for each item
under "Needs human review", tell me what you can and cannot verify from this
session, and give me the exact things I should check myself with the date range.
Do not suggest changing any rule or parameter. If the regime or invalidation
lines differ from last week's research read in the event log, list the differences.
```

## 3. Incident review (after any CRITICAL alert, kill switch or crash)

```
An incident happened on desk247 around <TIME UTC>. Read trading-desk/state/desk247.events.jsonl
from 6 hours before to now, plus state/desk247/portfolio.json and orders.json.
Write a timeline: each event, what the code did, and whether risk.py and
execution.py behaved as their docstrings say. Then answer:
- Was any money lost that the rules should have prevented? How much?
- Is the cause in our code, the data feed, or the market?
- What test in desk247/tests/test_qa.py would have caught it? Write that test,
  run the suite, and show me the result. Do not change config.py.
Do not run reset-kill. I do that myself after reading your review.
```

## 4. Monthly performance review (judge against the backtest, not hope)

```
Read every summary in trading-desk/state/desk247/summaries/ and the fills in the event log.
Compute, since the first fill: return, max drawdown, exposure, number of trades,
stop exits, fees paid, and average slippage (fill price vs ref_price on each order).
Compare each with the rule+risk row of `python3 desk247/backtest.py`
(CAGR 33.7%, Sharpe 1.42, max drawdown -21.9%, exposure 24% from 2019 to 2026-10-11).
Say plainly whether the paper record is inside the range the backtest implies
for this many weeks, and remind me that under 26 weeks proves nothing either way.
```

## 5. Change request (before touching any rule or limit)

```
I want to change <PARAMETER> in desk247/config.py from <OLD> to <NEW> because <REASON>.
Before editing anything: run desk247/backtest.py as it is, then with the change,
and show both tables. Tell me whether the difference is bigger than what moving
the parameter one step either way does (run those too). If the change only helps
in-sample, say so. If I still want it, edit config.py with a dated comment,
run the QA suite, and note that the paper record restarts from today.
```
