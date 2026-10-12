# desk247: a 24/7 paper trading system for one person

## START HERE FIRST

```bash
cd trading-desk
python3 -m unittest discover -s desk247/tests   # 21 QA tests, no network
python3 desk247/backtest.py                      # what the rules did 2019 to now
python3 desk247/run.py research                  # today's market read
python3 desk247/run.py once                      # one tick: may queue entries for approval
python3 desk247/run.py approve                   # see what it wants to buy, and why
python3 desk247/run.py approve all               # approve; they fill on the next tick
python3 desk247/run.py loop                      # run 24/7, one tick per hour at hh:02 UTC
python3 dashboard/server.py                      # watch it at http://localhost:8080
```

Paper only. There is no live broker in this code, on purpose (see "Going live").
State lives in `trading-desk/state/` (gitignored). Nothing needs an API key.

---

## 1. Market and edge

Three realistic starting points, judged on what this repo has already tested:

| Path | For | Against | Verdict |
| --- | --- | --- | --- |
| **BTC/ETH spot swing** | Trades 24/7; deep liquidity; free data; one published rule (crypto momentum) already tested after its publication date in `trend/` and in a forward test | Coins fall 50 to 80% in bad years; one venue's risk | **Version one** |
| Perpetual futures, paper | Can short; cheap to trade | Funding, leverage and liquidation add three new ways to lose before the edge is proven; no tested edge here | Later, if ever |
| Large-cap equities | Regulated, familiar | Not 24/7; Faber SMA and dual momentum both failed their post-publication tests in `trend/` | Not for this system |

The choice:

- **Market:** BTC and ETH, spot, long or cash only. No leverage, no shorts.
- **Time horizon:** weekly decisions, positions held for weeks. Hourly checks for risk only.
- **Edge:** time-series momentum (Liu & Tsyvinski 2018/2021). A coin up over the last
  28 days tends to keep going more often than not; a coin down over 28 days is where
  the big drawdowns live, so the rule sits those out.
- **Success metric for version one:** after 26 weeks of paper trading, the system ran
  every hour with no unexplained gap over 2 hours, broke no risk limit, and its
  drawdown and exposure sit inside what the backtest implies. Return is reported but
  is not the test: 26 weeks of crypto cannot prove or disprove an edge.

## 2. Architecture

```
          Binance public candles (hourly + daily, no key)
                         |
                  research.py     validate -> hard data -> derived metrics -> regime
                         |           (bad data raises BadData: no entries)
                  strategy.py     Sunday close: 28-day return > 0 ? 1/N : 0
                         |
                     risk.py      size, stop, caps, daily halt, kill switch  <- config.py
                         |
                 execution.py     de-dup -> approval -> risk re-check -> broker -> fills
                         |
                  portfolio.py    cash, positions, stops, peak, flags (atomic JSON)
                         |
                   monitor.py     the hourly tick, alerts, end-of-day summaries
                         |
                     run.py       CLI and the 24/7 loop
                         |
   state/desk247.json + .events.jsonl  ->  dashboard/ (existing desk UI)
```

| Module | Owns | Input | Output | Never does |
| --- | --- | --- | --- | --- |
| `research.py` | What is true about the market | Raw candles | Validated bars, derived metrics, regime, human-review list | Trade, or use anything it cannot measure |
| `strategy.py` | The rule | Daily closes | Target weights | Read the clock, the network or the account |
| `risk.py` | Every limit | Weights, account, prices | Sized quantity, stop, allow/deny, halt flags | Get overridden by anything |
| `execution.py` | Orders | Order intents | Fills, order states | Place an order twice, or place one risk denied |
| `portfolio.py` | The account | Fills | Persisted state | Lose state on a crash (atomic writes) |
| `monitor.py` | The loop | Everything above | Alerts, snapshot, summaries | Stop because one tick failed |
| Claude (`prompts.md`) | Reviews | Logs and summaries | Written review | Place, size, approve or change anything |

Handoffs are plain data (dicts, dataclasses, JSON), so each piece is tested alone.
`backtest.py` calls the same `strategy` and `risk` functions as the live loop.

## 3. Research layer

`python3 desk247/run.py research`. Three kinds of information, kept apart:

- **Hard data:** OHLCV bars and timestamps from the exchange.
- **Derived (computed, used):** 28-day and 7-day return, ATR(20), realized
  volatility (30-day vs its 90-day median), 200-day SMA and its slope, distance
  from it, drawdown from the 90-day high, 30-day median dollar volume, and a
  volatility-spike flag (today's range over 3x ATR).
- **Regime:** trend up / down / mixed (price vs a rising or falling 200-day SMA)
  crossed with volatility calm / normal / volatile. Reported for context; the rule
  does not use it, because adding a regime filter now would be fitting to history.
- **Invalidation signals:** 28-day return at or below zero (exit at the next
  rebalance), stop hit, volatility spike (no entries today), dollar volume under
  $100M (too thin), any data validation failure.
- **Needs human review (never traded on):** exchange health, USDT peg, scheduled
  catalysts (FOMC, CPI, ETF flows, unlocks, forks), regulatory action, anything
  that makes the last 28 days unrepresentative. Printed as a checklist every time.

## 4. Strategy logic

| | Rule |
| --- | --- |
| Setup | Once a week, on the daily bar that closes Monday 00:00 UTC (the "Sunday close") |
| Entry | Coin not held and its close is above its close 28 days earlier |
| Size | Start from 50% of equity per coin; cut so a stop-out loses at most 2% of equity |
| Stop | Entry price minus 3 x ATR(20), set at entry, never widened |
| Exit | 28-day return <= 0 at a Sunday close; or the stop trades; or the kill switch fires |
| Take profit | None. Momentum earns from a few long runs; a target cuts exactly those |
| Re-entry after a stop | Only at a later Sunday close where the rule says hold |
| No trade | Bad or stale data; daily loss halt; kill switch on; volatility spike in that coin; the same week's order already exists; order under $25 |

## 5. Execution layer

- **Approval:** `DESK247_APPROVAL=manual` (default) parks every entry in
  `pending_approval` until you run `run.py approve`. Exits never wait. Set `auto`
  for unattended paper trading once you trust it.
- **No duplicates:** each order id is built from the decision (`rb20261011-BTC-buy`,
  `stop-BTC-20261014T07`, `kill-ETH-20261015`). The ledger refuses any id it has
  ever seen, so restarts, crashes and a second copy of the loop cannot double trade.
- **Re-check at the last moment:** `risk.check_order()` runs again immediately
  before the broker, against current prices and limits.
- **Slippage:** paper fills at the last price plus 2 bps, plus a 5 bp fee. Monthly
  review compares fill price with the reference price on every order.
- **Partial fills:** paper fills at most 1% of the last hour's volume per tick; the
  rest stays open and fills on later ticks, or expires after 6 hours.
- **Stale data:** a feed whose newest hourly bar closed over 2 hours ago, has NaNs,
  non-positive prices, inconsistent highs and lows, out-of-order timestamps or a
  bar-to-bar move over 20% is rejected whole. No entries until it is clean.
- **Exchange or API failure:** 3 attempts with backoff, then the order stays open
  for the next tick and a WARN goes out. Orders expire rather than fill late.
- **Logging:** every order state change, fill, decision, alert, error and heartbeat
  is one JSON line in `state/desk247.events.jsonl`.

## 6. Risk layer (hard limits in `config.py`, enforced in `risk.py`)

| Limit | Value | What happens |
| --- | --- | --- |
| Max risk per trade | 2% of equity | Position shrinks until a stop-out loses 2% |
| Max position | 50% of equity per coin | Order refused |
| Max gross exposure | 100% (no leverage) | Order refused; cash must cover it |
| Max daily loss | 5% from the UTC day's open | No entries until 00:00 UTC; exits continue |
| Max drawdown | 25% from peak | **Kill switch:** cancel buys, sell everything, halt |
| Max orders per day | 6 | No more entries today |
| Volatility spike | day range > 3 x ATR | No entries in that coin today |
| Data outage | stale or invalid feed | No entries; CRITICAL alert if anything is held |

The kill switch stays on until a human runs
`run.py reset-kill --confirm "what I reviewed"`, which also resets the peak.

In a data outage with open positions this paper system **cannot check its stops**,
and says so in a CRITICAL alert. A live version must place stops on the exchange
as native stop orders so they work while this process is blind.

## 7. Monitoring

- **Every hour (hh:02 UTC):** fetch, validate, stops, limits, rebalance if due,
  orders, then a dashboard snapshot (`state/desk247.json`) and a heartbeat event.
- **Tracked:** equity, cash, day P&L, drawdown from peak, positions with entry,
  stop and unrealized P&L, open orders, 28-day momentum and regime per coin,
  alerts, API errors.
- **Alerts:** INFO (logged), WARN (read within a day), CRITICAL (trading stops for
  that reason until you act). Set `DESK247_ALERT_WEBHOOK` to a Slack or Discord
  webhook URL to get WARN and CRITICAL on your phone.
- **End of day:** at the first tick after 00:00 UTC, `state/desk247/summaries/<day>.md`
  with equity, drawdown, positions, fills, alerts and a three-item checklist.
- **Watchdog:** `run.py health` exits 1 if the last tick is over 2 hours old or the
  status is not `running`. Point any uptime checker or a cron job at it.
- **When a human must look:** any CRITICAL; any rejected or expired order; a stop
  exit; a month where paper drawdown is deeper than the backtest's worst; and every
  Monday for the human-review checklist.

To run it unattended on a server:

```bash
# cron, every hour at :02, plus a watchdog
2 * * * * cd /path/to/trading-desk && DESK247_APPROVAL=auto python3 desk247/run.py once >> state/desk247/cron.log 2>&1
30 * * * * cd /path/to/trading-desk && python3 desk247/run.py health || <your alert command>
```

## 8. QA plan

`python3 -m unittest discover -s desk247/tests -v` runs 21 tests on synthetic data:

| Case | Expected outcome |
| --- | --- |
| Stale prices (newest hourly bar 5h old) | `BadData`; no orders; CRITICAL "stops are NOT being checked" if a position is open |
| Duplicate orders (same id twice; crash before saving, then restart) | Second submit refused; still exactly one buy and one fill per coin |
| Bad position sizing (NaN price, zero ATR, negative equity, weight > 1, stop below zero, $10k order on $10k account, infinite qty, short sale) | `SizingError` or order refused, every time |
| Missed stop (price gaps 10% through the stop) | Exits at the gap price, not the stop; the log says it gapped |
| Bad data feed (NaN, negative low, reversed timestamps, +60% print, high below close, empty, too little history) | Feed rejected whole; no trades on the other coin either |
| Kill switch (50% below peak) | Everything sold, no buys, halted |
| Daily loss (-6% on the day) | Entries refused, exits allowed, cleared next UTC day |
| Manual approval / expiry | Entries wait; unapproved entries expire after 6h |
| Partial fill (thin volume) | Stays `partially_filled`, completes over later ticks to the exact quantity |
| Broker outage (3 failures) | WARN, order kept, fills on the next tick |

Failure modes still not covered by code (check by hand): exchange insolvency,
USDT depeg, the venue's candles diverging from where you would actually trade.

## 9. Evidence

`python3 desk247/backtest.py`, Binance daily bars, 2019-01-01 to 2026-10-11,
7 bps per side, cash earns nothing, Sunday signal traded at Monday's open:

| | CAGR | Sharpe | Max drawdown | Volatility | Avg exposure |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hold 50/50 BTC+ETH | 50.9% | 0.95 | -76.3% | 67.7% | 100% |
| Rule, full weight, no stops | 74.1% | 1.38 | -54.6% | 49.0% | 57% |
| **Rule + risk layer (what runs)** | **33.7%** | **1.42** | **-21.9%** | 22.2% | 24% |

Rule + risk: 180 trades, 18 stop exits, kill switch never fired.

How to read it:

- The rule is the one frozen in `trend/` on 2026-10-07 and tested from 2019; this
  reproduces that result (Sharpe 1.38 here vs 1.42 there, from Monday-open fills and
  no T-bill yield). In `trend/` it **missed** its pre-set significance bar
  (p = 0.025 vs 0.0167). It is promising, not proven.
- The risk layer is mostly smaller positions: about a quarter of equity on average.
  It cut the worst drawdown from -55% to -22% and gave up more than half the
  return. The Sharpe difference (1.42 vs 1.38) is noise. It buys survivability,
  not edge.
- The risk numbers were chosen on 2026-10-12 knowing what crypto did in
  2019 to 2026, so the rule + risk row is **in-sample**. The paper record from
  now on is the only out-of-sample test it gets.
- By year, rule + risk: 2019 +36%, 2020 +93%, 2021 +91%, 2022 -6%, 2023 +49%,
  2024 +21%, 2025 +9%, 2026 to date +4%. The edge has been weaker since 2024.

## 10. Seven-day launch plan

| Day | Do | Done when |
| --- | --- | --- |
| 1. Market and edge | Read sections 1 and 9 and `trend/README.md`. Run `backtest.py` yourself. Write down why you accept or reject the edge | You can state the rule in one sentence and its worst drawdown |
| 2. Architecture | Read sections 2 to 6. Open `config.py` and decide whether each limit fits your money; change nothing you cannot justify | Every limit is one you would actually keep |
| 3. Prompts and rules | Read `prompts.md`. Run the weekly research review prompt once | You know which questions you ask Claude and which you answer yourself |
| 4. Tools and data | Run `research`, `once`, `approve`, `status`, `health`. Start `dashboard/server.py` | The dashboard shows desk247 with live equity |
| 5. Tests and paper | Run the QA suite. Start `run.py loop` (or the cron lines) with manual approval | 24 hourly heartbeats in the event log, no CRITICAL |
| 6. Refine and QA | Run the daily review prompt on day 5's log. Break something on purpose (cut the network) and watch the alert; set the webhook | You have seen a WARN and a CRITICAL reach your phone |
| 7. Launch paper | Switch to `DESK247_APPROVAL=auto` if day 6 was clean. Put the weekly and monthly reviews on your calendar | The system runs without you; you read one summary a day |

## 11. Going live (not in version one)

Only after 26 weeks of paper with: no unexplained tick gap over 2 hours, no limit
breach, every incident reviewed, and paper drawdown and slippage inside the
backtest's range. Then: write a live broker class with the same `place()` contract,
put the stops on the exchange as native stop orders, keep manual approval for the
first month, start with money you can lose entirely, and keep the 25% kill switch.

## Rules this system keeps

1. Narrow: two coins, one rule, one decision a week.
2. Paper first, for at least 26 weeks.
3. Evidence before belief: every claim above comes from a script you can rerun.
4. Risk is the product: limits are code, checked before every order, and no model
   output can override them.
5. Claude reviews; code trades; you approve.
