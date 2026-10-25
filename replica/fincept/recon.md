# Recon map: Fincept Terminal Enterprise (desktop: Windows, macOS, Linux)

Scope: the whole terminal at desk level (41 modules in six desks), mapped against FXDEZ to pick what to add.
Not a full clone: FXDEZ stays a private, owner-only web app (PWA) and adds the pieces that fit it.
For: the FXDEZ owner, one user, every feature free.
Date: 2026-10-25

## The rules applied here

- Public pages only: the marketing site, pricing, the public docs and the GitHub README. No account, no download,
  no screenshots taken (no browser tool was attached), so `replica/screens/` has nothing for Fincept and screen
  states below are "not observed".
- The open build is AGPL-3.0 C++/Qt. Its source was not read and must not be: FXDEZ is a different, clean-room code base.
- "Fincept" is a trademark (the README asks for written permission for derivative products). Never use the name,
  logo or their wording in FXDEZ.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | marketing site, Enterprise | https://fincept.in/enterprise/ | six desks, 41 modules, capabilities, open vs enterprise, per-seat prices, installers v5.0.5 |
| 2 | pricing | https://fincept.in/pricing | three 30-day plans ($15, $30, $45), credits, usage limits per plan, top-ups, free open tier |
| 3 | docs home (MCP server + guides) | https://docs.fincept.in | five toolsets, 17 analytics module guides, credits, security |
| 4 | backtest toolset | https://docs.fincept.in/reference/toolsets/backtest.md | 26 tools: run, optimise, walk-forward splits, cost profiles, stored runs, compare, saved strategies |
| 5 | portfolio toolset | https://docs.fincept.in/reference/toolsets/portfolio.md | 39 tools: ledger, NAV, performance, attribution, risk, scenarios, limits, rebalance, tax lots |
| 6 | news toolset | https://docs.fincept.in/reference/toolsets/news.md | 22 tools: feed, search, lexicon sentiment, keyword monitors, automations, user RSS |
| 7 | GitHub README (open build) | https://github.com/Fincept-Corporation/FinceptTerminal | feature list, 100+ data connectors, BYO-key AI providers, 37 agents, 16 brokers, C++20/Qt6 + Python 3.11 |
| 8 | Terminal Manual | https://fincept.in/manual | 864 pages, 46 guides: not read this pass; the next source to read for screen-level detail |
| 9 | demo booking | https://calendly.com/nikultilak/fincept-terminal-demo | not used (a sales call) |

Not found: a changelog, public walkthrough videos.

## Core loop

Research an instrument (data, news, AI notes), test an idea on past prices (backtest, optimise), then track or trade it
(portfolio, paper or live broker), with AI agents doing the legwork and charging credits.

## Screens (modules)

Inferred from the module list; no screen was observed, so states are what each must have, not what was seen.
"FXDEZ" says what the app already has.

| ID | screen | desk | purpose | key components | FXDEZ today |
| --- | --- | --- | --- | --- | --- |
| S01 | AI Chat | Agentic Research | ask questions, tool-calling over live data, sourced answers | chat thread, tool-call trace, citations | no |
| S02 | Agent Config | Agentic Research | set up specialist agents and team modes | agent list, prompt/model/tools form | no |
| S03 | Node Editor | Agentic Research | wire agents and data steps visually | canvas, nodes, edges, run log | no |
| S04 | MCP Servers | Agentic Research | connect external tool servers | server list, add form, status | no |
| S05 | Report Builder | Agentic Research | long-form research reports | outline, sections, export | no |
| S06 | Code Editor | Agentic Research | write analysis code | editor, run, output | partial: indicator formula editor |
| S07 | AI Quant Lab | Quant Lab | ML, factor discovery, RL experiments | experiment list, results | no |
| S08 | Backtesting | Quant Lab | run a strategy on past bars, optimise, walk-forward | spec form, template picker, equity curve, metrics, trades, run history, compare | no (signal history and track record only) |
| S09 | Alpha Arena | Quant Lab | strategies compete in rounds | leaderboard, rounds | no |
| S10 | Surface Analytics | Quant Lab | option volatility surface | 3D surface, smile slices | no |
| S11 | Equity Research | Fundamentals | company fundamentals, DCF, filings | statements, ratios, valuation | no |
| S12 | Portfolio | Fundamentals | book: ledger, NAV, performance, risk, attribution | holdings table, NAV chart, perf tables | partial: holdings + value + P/L |
| S13 | Portfolio Monitor | Fundamentals | limits and breaches across books | limit rules, status | no |
| S14 | Derivatives | Fundamentals | option chains and pricing models | chain, greeks, pricer | no |
| S15 | F&O | Fundamentals | Indian futures and options | chain, OI | skip |
| S16 | Alt Investments | Fundamentals | private assets, alternatives | | skip |
| S17 | M&A Analytics | Fundamentals | deals | deal list | skip |
| S18 | Relationship Map | Fundamentals | ownership and insider graph | network graph | no |
| S19 | Markets | Execution | quotes and charts across markets | market tables, charts | yes |
| S20 | Equity Trading | Execution | stock orders through a broker | order ticket, positions, orders | yes (Alpaca) |
| S21 | Crypto Trading | Execution | crypto orders, perpetuals | ticket, depth | yes spot (Alpaca); perps no |
| S22 | Algo Trading | Execution | deploy rule strategies live | strategy list, deploy, log | no |
| S23 | Watchlist | Execution | follow symbols | list, quotes | yes |
| S24 | Trade Viz | Execution | trades drawn on charts | chart markers | no |
| S25 | Polymarket | Execution | prediction-market odds | markets, odds stream | no |
| S26 | Global Data | Macro | economic series (FRED, IMF, World Bank...) | series search, chart | partial: bond yields only |
| S27 | Data Sources | Macro | manage connectors and keys | source list, status | partial: /status data health |
| S28 | Data Mapping | Macro | map your own data in | field mapper | no |
| S29 | News | Macro | curated feed with sentiment and tickers | article list, sentiment chip, filters | no |
| S30 | RSS Feeds | Macro | add your own feeds | feed list, add form | no |
| S31 | Geopolitics | Macro | events and risk | map, event list | no |
| S32 | Maritime | Macro | ship tracking (AIS) | map, vessels | skip |
| S33 | Dashboard | Workspace | home overview | widgets | yes |
| S34 | Excel | Workspace | spreadsheet over data | grid | no |
| S35 | Notes | Workspace | research notes | editor, list | no |
| S36 | File Manager | Workspace | uploaded files | file list | no |
| S37 | Action Center | Workspace | alerts and tasks | inbox | yes (alerts) |
| S38 | Docs | Workspace | in-app manual | | partial: in-page help |
| S39 | Settings | Workspace | app settings | | yes |
| S40 | Profile | Workspace | account | | yes |
| S41 | About | Workspace | version | | skip |

## Flows

Click counts are not counted: no walkthrough was observed. Read the manual (source 8) before building one of these.

```
F01 Test a strategy on past prices
    S08 pick a template or write rules -> set symbol, dates, costs -> run -> equity curve, metrics, trades
    -> save the strategy; runs kept 90 days unless pinned
    edge: too little history, a rule that never fires, no trades, costs bigger than the edge, invalid expression
F02 Find the best settings without fooling yourself
    S08 add parameter ranges -> preview walk-forward windows -> optimise -> best config + sweep summary
    -> family ledger counts every try (deflated Sharpe)
    edge: one lucky value (curve fit), too many tries, out-of-sample worse than in-sample
F03 Compare ideas
    S08 run history -> pick 2-4 runs -> one chart on a shared time axis
F04 Ask the AI about an asset
    S01 question -> agent calls tools (quotes, news, filings) -> answer with sources; credits charged
    edge: no data, tool error, runs out of credits
F05 Watch the news for something
    S29 keyword monitor -> server sweeps new articles -> hits listed (and automations act on them)
    edge: no hits, too many hits, duplicate stories
F06 See how the book is really doing
    S12 ledger (buys, sells, fees, dividends, deposits) -> NAV per day -> time-weighted return, drawdown, monthly table
    edge: missing price (manual mark), splits, cash in and out
F07 Stress the book
    S12 scenarios -> past crises replayed, Monte Carlo fan -> before/after
F08 Trade with a bracket or OCO through your broker
    S20/S21 ticket -> stop and target -> confirm -> order live at broker
F09 Run a strategy live
    S08 saved strategy -> S22 deploy (paper or live) -> orders sent when rules fire -> log
    edge: data gap, broker refuses, duplicate signal, kill switch
F10 Browse an economic series
    S26 search series (FRED, IMF, World Bank) -> chart -> add to dashboard
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Strategy spec form | template, rules | empty, invalid rule, valid | S08 |
| Equity curve chart | single, compare (2-4), with benchmark, drawdown pane | loading, no trades, filled | S08, S12 |
| Metrics grid | summary, full | empty, filled | S08, S12 |
| Trades table | round trips, orders, positions, logs (paged) | empty, filled | S08, S24 |
| Run list | pinned first, newest | empty, filled | S08 |
| Chat thread | with tool trace, with citations | streaming, error, out of credits | S01 |
| Article row | with sentiment chip and tickers | | S29 |
| Monitor card | keyword chips, colour, on/off | no hits, hits | S29 |
| Order ticket | market, limit, bracket, OCO, GTT | review, sent, refused | S20, S21 |
| Series chart | line, with search | loading, not found | S26 |

## Inferred data model

```
Strategy     id, name, tags, notes, spec (json), version, template_id; version history kept
             evidence: backtest_save/update/get_strategy (source 4)        confidence: high
BacktestRun  id, kind (run | optimize), name, family, spec, summary metrics, series, trades, validation battery,
             pinned, created_at; deleted after 90 days unless pinned
             evidence: backtest_list/get/pin_run (source 4)                 confidence: high
RunRecord    run_id, type (orders | positions | round_trips | logs), paged rows
             evidence: backtest_get_run_records                              confidence: high
StrategyFamily  name, trial count, Sharpe spread (for deflated Sharpe)
             evidence: backtest_get_family                                   confidence: high
CostProfile  name, costs block (fees, slippage...), built-ins per market
             evidence: backtest_list_cost_profiles                           confidence: medium (fields guessed)
Portfolio    id, name, base currency, cost method, cash tracking, benchmark, inception, archived
             evidence: portfolio_get_portfolio (source 5)                    confidence: high
Transaction  id, portfolio_id, type (buy | sell | dividend | interest | fee | deposit | withdrawal | split | fx | adjustment),
             symbol, qty, price, currency, cash_effect, date
             evidence: portfolio_get_ledger                                  confidence: high
Limit        id, portfolio_id, name, kind, params, severity (warn | breach), enabled
             evidence: portfolio_list_limits                                 confidence: high
Mark         symbol, price, currency, as_of, note                            confidence: high
Benchmark    id, name, components (symbol, weight), rebalance rule           confidence: high
Article      title, summary, source, url, category, published_at, sentiment label + score, tickers
             evidence: news_get_feed (source 6)                              confidence: high
Monitor      id, label, keywords, colour, enabled; MonitorHit (monitor_id, article)   confidence: high
Automation   trigger, action, enabled, history                               confidence: medium
```

Relationships: User 1-n Strategy 1-n BacktestRun 1-n RunRecord; Strategy n-1 StrategyFamily; User 1-n Portfolio 1-n
Transaction / Limit; User 1-n Monitor 1-n MonitorHit n-1 Article.

## Feature matrix

See `features.csv`. Must: 7, should: 11, could: 16, skip: 10 (44 rows; FXDEZ already has 1 and 3 in part). "Must" means what fits FXDEZ best, not what Fincept rates highest.

## Out of scope (cannot or should not be cloned)

- Proprietary and paid data: Fincept's private datasets, point-in-time data, Databento surfaces, Deribit options feed,
  L2 depth, AIS vessel tracking, real-time Asia quotes. Each is a licence FXDEZ doesn't hold.
- Indian-market modules (F&O, Indian cost profiles) and private markets (alternatives, M&A): no data source for them.
- Team features: seats, SSO, audit logs, role-based access. FXDEZ has one owner.
- Credits, plans, top-ups and payments: FXDEZ is free for its owner. AI use costs the owner's own API key instead.
- The desktop app itself (C++/Qt installers): FXDEZ is a web app installed as a PWA.
- Their name, logo, manual text and AGPL code.

## Size

Screens 41 (5 skip, 8 already in FXDEZ, 6 in part), flows 10, entities 13. Hard parts: an honest backtest engine (no look-ahead,
costs, walk-forward, counting every try), AI agents that call tools safely and cheaply, and live algo trading with a
kill switch. Size of the whole terminal: XL, rescope. Recommended first slice, the backtesting lab (F01-F03): M.
