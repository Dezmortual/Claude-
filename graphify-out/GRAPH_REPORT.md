# Graph Report - Claude-  (2026-10-11)

## Corpus Check
- 89 files · ~142,004 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 68 file(s) not represented in the graph (top: .csv 54, .pine 8, (none) 4)

## Summary
- 1192 nodes · 3103 edges · 68 communities (55 shown, 13 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 185 edges (avg confidence: 0.87)
- Token cost: 214,235 input · 0 output

## Community Hubs (Navigation)
- DezQuant App Views & UI
- Desk Dashboard Server
- Platform Workspace Sync
- Ambiguous Python Imports
- Lane Data Integrity Loop
- Workflow Schema Validation
- Strategy Configs & Actions
- Repo Notes & TA Gate Docs
- TradingAgents Decider
- Backtest Engine Core
- ORB Live Broker
- Core Contracts & Libraries
- Dashboard UI & Compose
- Research Evidence Scoring
- Campaign Management Lanes
- Rule & Gate Deciders
- Alpaca Market Data
- Paper Approval Triage
- Sync E2E Test
- Jev Model Decider
- Market Data Fetching
- SDL Strategy Runner
- Artifact E2E Test
- TA Worker Process
- Bot State Writer
- ORB Strategy Gates
- Technical Indicators JS
- Practice Arena Challengers
- Pine Code Generator
- Python Feature Engineering
- ARF-OS Spec Architecture
- Agent Desk Routing
- Typed Agent Contracts
- Strategy Improvement Search
- Research Lanes & Roles
- Browser Storage Layer
- Price Fetch Tool
- Backtest Stages & Control
- Committee & Handoffs
- ORB Live Trading Loop
- Core E2E Test
- Mobile E2E Test
- Donchian Trade Audit
- Dashboard Backtest Builder
- Performance Metrics JS
- Pine Linter
- Free-tier E2E Test
- Pine to SDL Converter
- Donchian Plan & Snapshot
- Platform Package Manifest
- Evidence Standards & Grades
- Pages & Price Workflows
- Artifact Builder
- ORB Backtest Runner
- DezQuant Brand Logo
- Oracle Deploy Script
- Oracle Provision Script
- Oracle Up Script
- Oracle Configure Script
- Dashboard Local Runner
- Deploy Bootstrap
- Container Entrypoint
- Oracle Logs Script
- TA Gate Setup
- Dashboard Card Renderer

## God Nodes (most connected - your core abstractions)
1. `get()` - 56 edges
2. `all()` - 51 edges
3. `esc()` - 51 edges
4. `nowIso()` - 37 edges
5. `audit()` - 36 edges
6. `put()` - 31 edges
7. `fmt()` - 30 edges
8. `ARF-OS (AI Research Hedge Fund Operating System)` - 29 edges
9. `update()` - 28 edges
10. `Snapshot` - 28 edges

## Surprising Connections (you probably didn't know these)
- `SHARED_POLICY` --references--> `ARF-OS (AI Research Hedge Fund Operating System)`  [INFERRED]
  arf-os-studio/index.html → AI_RESEARCH_HEDGE_FUND_SPEC.md
- `Hand-off Pipeline (Scout to Portfolio)` --semantically_similar_to--> `Agent Handoff Contracts`  [INFERRED] [semantically similar]
  arf-os-studio/README.md → AI_RESEARCH_HEDGE_FUND_SPEC.md
- `DezQuant artifact entry page (artifact.html)` --cites--> `ARF-OS (AI Research Hedge Fund Operating System)`  [EXTRACTED]
  arf-os-studio/platform/artifact.html → AI_RESEARCH_HEDGE_FUND_SPEC.md
- `DezQuant platform shell (platform/index.html)` --cites--> `ARF-OS (AI Research Hedge Fund Operating System)`  [EXTRACTED]
  arf-os-studio/platform/index.html → AI_RESEARCH_HEDGE_FUND_SPEC.md
- `DezQuant (ARF-OS Research Platform)` --implements--> `ARF-OS (AI Research Hedge Fund Operating System)`  [EXTRACTED]
  arf-os-studio/platform/README.md → AI_RESEARCH_HEDGE_FUND_SPEC.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **ARF-OS specialist lane pipeline** — ai_research_hedge_fund_spec_idea_scout, ai_research_hedge_fund_spec_indicator_researcher, ai_research_hedge_fund_spec_strategy_architect, ai_research_hedge_fund_spec_pine_script_engineer, ai_research_hedge_fund_spec_backtest_engineer, ai_research_hedge_fund_spec_robustness_validator, ai_research_hedge_fund_spec_forward_test_operator, ai_research_hedge_fund_spec_strategy_judge [EXTRACTED 1.00]
- **ARF-OS four-plane architecture** — ai_research_hedge_fund_spec_control_plane, ai_research_hedge_fund_spec_research_plane, ai_research_hedge_fund_spec_test_plane, ai_research_hedge_fund_spec_observation_plane [EXTRACTED 1.00]
- **DezQuant in-browser research engine** — arf_os_studio_platform_readme_runner_js, arf_os_studio_platform_readme_research_js, arf_os_studio_platform_readme_tv_js, arf_os_studio_platform_readme_pine_lint_js, arf_os_studio_platform_readme_workflow_js, arf_os_studio_platform_readme_lanes_js [INFERRED 0.85]
- **Bots write state volume, dashboard reads it** — trading_desk_deploy_docker_compose_orb, trading_desk_deploy_docker_compose_insider, trading_desk_deploy_docker_compose_pead, trading_desk_deploy_docker_compose_lvl, trading_desk_deploy_docker_compose_state_volume, trading_desk_deploy_docker_compose_dashboard, trading_desk_deploy_oracle_setup_state_contract [EXTRACTED 1.00]
- **TradingAgents gate invocation flow** — trading_desk_core_ta_decider, trading_desk_tradingagents_gate_readme_worker, trading_desk_tradingagents_gate_readme_tradingagents, trading_desk_tradingagents_gate_readme_ta_cache, trading_desk_tradingagents_gate_requirements [EXTRACTED 1.00]
- **Backtest honesty safeguards** — trading_desk_disclaimer_three_arms_oos, trading_desk_donchian_readme_same_bar_trail, trading_desk_tradingagents_gate_readme_compare_against_gated, trading_desk_tradingagents_gate_readme_lookahead_memory, trading_desk_donchian_readme_audit [INFERRED 0.75]

## Communities (68 total, 13 thin omitted)

### Community 0 - "DezQuant App Views & UI"
Cohesion: 0.06
Nodes (134): applyTheme(), boot(), closeModal(), current, NAV, openModal(), parseHash(), render() (+126 more)

### Community 1 - "Desk Dashboard Server"
Cohesion: 0.07
Nodes (19): accent_for(), _blank_record(), bot_record(), build_all_history(), build_history(), build_state(), discover(), Handler (+11 more)

### Community 2 - "Platform Workspace Sync"
Cohesion: 0.12
Nodes (39): applyChain, applyDocs(), applyQueued(), canZip(), claudeRuntime(), cursors, deviceSeen, dirty (+31 more)

### Community 3 - "Ambiguous Python Imports"
Cohesion: 0.09
Nodes (13): fetch(), gross_r(), line(), load_env(), main(), parse_args(), t_stat(), fetch() (+5 more)

### Community 4 - "Lane Data Integrity Loop"
Cohesion: 0.12
Nodes (31): datasetChecksum(), inferTickSize(), integrityReport(), architectLoop(), backtestSummary(), checkDeployment(), convertPine(), evidencePack() (+23 more)

### Community 5 - "Workflow Schema Validation"
Cohesion: 0.10
Nodes (29): runPortfolioReview(), extractJSON(), typeOf(), validate(), walk(), deviceIdleMs(), syncing(), adoptable() (+21 more)

### Community 6 - "Strategy Configs & Actions"
Cohesion: 0.07
Nodes (6): Action, JevPrompt, DonchianConfig, DonchianStrategy, SMAConfig, SMACrossover

### Community 7 - "Repo Notes & TA Gate Docs"
Cohesion: 0.09
Nodes (16): Repository notes for Claude (CLAUDE.md), trading-desk-method skill, trading-desk plugin (aabrole/claude-trading-desk), is_crypto(), restrict_window(), Trading desk disclaimer, SOL Donchian, daily crypto (README), donchian/audit.py trade re-verification (+8 more)

### Community 8 - "TradingAgents Decider"
Cohesion: 0.13
Nodes (7): Snapshot, analysis_date(), build_ta_decider(), candidate_snapshots(), cost_usd(), prepare_ta(), TradingAgentsDecider

### Community 9 - "Backtest Engine Core"
Cohesion: 0.11
Nodes (7): Trade, BacktestResult, Engine, Instrument, _Open, _sale_fees(), _slip()

### Community 10 - "ORB Live Broker"
Cohesion: 0.14
Nodes (4): Broker, LiveRunner, log(), State

### Community 11 - "Core Contracts & Libraries"
Cohesion: 0.17
Nodes (3): by_bucket(), compare(), summarize()

### Community 12 - "Dashboard UI & Compose"
Cohesion: 0.10
Nodes (22): Bot leaderboard dashboard page, addevent, Dashboard API (/api/state, /api/history, /api/stream, api/remote, backtests.json), connect, loadbacktests, loadhistory, loadremote, renderchart (+14 more)

### Community 13 - "Research Evidence Scoring"
Cohesion: 0.23
Nodes (23): objective(), buildSegments(), fmt2(), mcFan(), pack(), POLICIES, robustnessSuite(), runBacktestStage() (+15 more)

### Community 14 - "Campaign Management Lanes"
Cohesion: 0.24
Nodes (23): realisticCosts(), audit(), update(), cancelCampaign(), checkCampaignIdle(), createCampaign(), createImprovedVersion(), createManualVersion() (+15 more)

### Community 15 - "Rule & Gate Deciders"
Cohesion: 0.12
Nodes (9): Decision, Decider, GateDecider, RuleDecider, EngineConfig, load_env(), main(), mk() (+1 more)

### Community 16 - "Alpaca Market Data"
Cohesion: 0.13
Nodes (7): _cache_path(), _client(), fetch_bars(), fetch_universe(), _timeframe(), _to_session(), build_plans()

### Community 17 - "Paper Approval Triage"
Cohesion: 0.20
Nodes (22): DEVICE, get(), approvePaper(), askAgentReview(), autoTriage(), backtestNow(), campaignOf(), forwardTestNow() (+14 more)

### Community 18 - "Sync E2E Test"
Cohesion: 0.13
Nodes (19): bars, checkPath(), cmp(), counts(), device(), dir, js(), mockRuntime() (+11 more)

### Community 20 - "Market Data Fetching"
Cohesion: 0.16
Nodes (18): BINANCE_SYMBOLS, closedGap(), emptyBars(), encodeDataset(), fetchBars(), getJSON(), HALF_SPREAD, loadBuiltin() (+10 more)

### Community 21 - "SDL Strategy Runner"
Cohesion: 0.22
Nodes (17): source(), prepare(), RUNNER_VERSION, checkCalls(), compile(), constArg(), gridSize(), identifiers() (+9 more)

### Community 22 - "Artifact E2E Test"
Cohesion: 0.11
Nodes (17): b, common, dir, errors, external, gb, gold, keep (+9 more)

### Community 23 - "TA Worker Process"
Cohesion: 0.16
Nodes (5): remote_status(), burn(), main(), run(), usage_callback()

### Community 24 - "Bot State Writer"
Cohesion: 0.17
Nodes (7): _atomic_write(), BotState, Candidate, Position, read_all(), Snapshot, tail_events()

### Community 26 - "Technical Indicators JS"
Cohesion: 0.32
Nodes (17): adx(), atr(), change(), computeIndicator(), ema(), highest(), lowest(), nanArr() (+9 more)

### Community 27 - "Practice Arena Challengers"
Cohesion: 0.22
Nodes (16): portfolioData(), clone(), createChallenger(), promotionCheck(), refSDL(), rollback(), runPractice(), SUITES (+8 more)

### Community 28 - "Pine Code Generator"
Cohesion: 0.14
Nodes (10): generatePine(), num(), PINE_GEN_VERSION, pineStr(), RESERVED, BARS(), SDL_TEMPLATE, syntheticBars() (+2 more)

### Community 29 - "Python Feature Engineering"
Cohesion: 0.20
Nodes (9): align_higher_timeframe(), atr(), ema(), minutes_from_open(), resample(), rolling_time_of_day_mean(), session_date(), session_vwap() (+1 more)

### Community 30 - "ARF-OS Spec Architecture"
Cohesion: 0.15
Nodes (8): ARF-OS (AI Research Hedge Fund Operating System), Backend Stack (TypeScript monorepo, Fastify, Postgres, BullMQ), Delivery Roadmap Phases 0-7, Deployment on Railway, Pine-compatible Research Runner, Strategy Definition Language (SDL), TradingView Verification Runner, js/runner.js - Deterministic bar-close backtester

### Community 31 - "Agent Desk Routing"
Cohesion: 0.12
Nodes (12): agentsystem(), ask(), askfloor(), callmodel(), keywordroute(), KEYWORDS, mentionroute(), MODEL_BY_TIER (+4 more)

### Community 32 - "Typed Agent Contracts"
Cohesion: 0.12
Nodes (15): AGENTS, byId, coerceArchitect(), common, normaliseTrail(), numOrParam, PIPELINE, SDL_GRAMMAR_DOC (+7 more)

### Community 33 - "Strategy Improvement Search"
Cohesion: 0.24
Nodes (15): andEntry(), clone(), ensureInd(), evaluate(), findInd(), GOALS, improve(), IMPROVER_VERSION (+7 more)

### Community 34 - "Research Lanes & Roles"
Cohesion: 0.31
Nodes (13): Lane 5 - Backtest Engineer, Chief Research Orchestrator, Data Integrity and Market-Regime Analyst, Lane 7 - Forward-Test Operator, Lane 1 - Idea Scout, Lane 2 - Indicator Researcher, Lane 4 - Pine Script Engineer, Phase 2 - Portfolio Researcher (+5 more)

### Community 35 - "Browser Storage Layer"
Cohesion: 0.24
Nodes (12): clearAll(), del(), emit(), exportWorkspace(), importWorkspace(), listeners, put(), stamp() (+4 more)

### Community 36 - "Price Fetch Tool"
Cohesion: 0.19
Nodes (12): binance(), decimals(), failures, getJSON(), MARKETS, NOTES, OUT, prev (+4 more)

### Community 37 - "Backtest Stages & Control"
Cohesion: 0.19
Nodes (12): Backtest Stages A-G, TradingView Parity Tolerances, Walk-forward Segment Models, js/agents.js - Agents with typed JSON contracts, DezQuant (ARF-OS Research Platform), test/e2e.mjs end-to-end test, tools/fetch-prices.mjs price library refresh, js/lanes.js - Lane handlers (+4 more)

### Community 38 - "Committee & Handoffs"
Cohesion: 0.18
Nodes (12): Agent Handoff Contracts, Investment Committee Queue, Frontend Specification (Command Centre, Backtest Lab, Committee Queue...), Agent Practice Arena, DezQuant Agent Desk (index.html), DezQuant artifact entry page (artifact.html), DezQuant platform shell (platform/index.html), js/practice.js - Practice Arena (+4 more)

### Community 39 - "ORB Live Trading Loop"
Cohesion: 0.21
Nodes (4): jlog(), load_env(), main(), parse_args()

### Community 40 - "Core E2E Test"
Cohesion: 0.17
Nodes (9): bars, common, errors, OUT, root, sdl, server, t0 (+1 more)

### Community 41 - "Mobile E2E Test"
Cohesion: 0.20
Nodes (8): bars, dir, errors, partialSdl, result, sdlOut, server, sk()

### Community 42 - "Donchian Trade Audit"
Cohesion: 0.31
Nodes (5): audit_trade(), close_enough(), indicators(), main(), parse_args()

### Community 43 - "Dashboard Backtest Builder"
Cohesion: 0.27
Nodes (6): build(), load_curve(), main(), ret_pct(), span(), thin()

### Community 44 - "Performance Metrics JS"
Cohesion: 0.33
Nodes (9): computeMetrics(), dailyReturns(), drawdownSeries(), equityFromTrades(), METRICS_VERSION, monthlyReturns(), parity(), median() (+1 more)

### Community 45 - "Pine Linter"
Cohesion: 0.36
Nodes (9): declArgs(), fixPineConstants(), inputTimeDefaults(), LINT_VERSION, lintPine(), MONTHS, p2(), stripComments() (+1 more)

### Community 46 - "Free-tier E2E Test"
Cohesion: 0.20
Nodes (6): bars, dir, errors, res, server, t3

### Community 47 - "Pine to SDL Converter"
Cohesion: 0.36
Nodes (8): convertPineToSDL(), logicalLines(), parse(), sid(), SOURCES, stripComment(), TA_SIMPLE, tokenize()

### Community 49 - "Platform Package Manifest"
Cohesion: 0.25
Nodes (7): description, name, private, scripts, e2e, test, type

### Community 50 - "Evidence Standards & Grades"
Cohesion: 0.29
Nodes (6): Composite Evidence Score (spec 12.7), Evidence Grades A-F, Hard-fail Conditions, Pine Script v6 Engineering Standard, Pine Static Checks (spec 11.11), js/pine-lint.js - Pine QA static checks

### Community 51 - "Pages & Price Workflows"
Cohesion: 0.40
Nodes (5): Deploy Agent Desk to GitHub Pages workflow, arf-os-studio site, Refresh built-in prices workflow, fetch-prices.mjs price download, arf-os-studio/platform/data/index.json (updatedAt)

### Community 52 - "Artifact Builder"
Cohesion: 0.33
Nodes (4): body, css, html, keep

### Community 53 - "ORB Backtest Runner"
Cohesion: 0.33
Nodes (3): load_env(), main(), parse_args()

### Community 54 - "DezQuant Brand Logo"
Cohesion: 0.60
Nodes (5): DezQuant Brand, DezQuant Logo (app icon SVG), D/Q Monogram, Gold-on-Navy Palette, Rising Price Chart Motif

### Community 55 - "Oracle Deploy Script"
Cohesion: 0.70
Nodes (4): die(), info(), say(), oracle_deploy.sh script

### Community 56 - "Oracle Provision Script"
Cohesion: 0.70
Nodes (4): die(), info(), say(), oracle_provision.sh script

### Community 57 - "Oracle Up Script"
Cohesion: 0.50
Nodes (4): PATH, say(), oracle_up.sh script, SUPPRESS_LABEL_WARNING

## Knowledge Gaps
- **30 isolated node(s):** `/js/sync.js`, `/js/db.js`, `/js/lanes.js`, `/js/workflow.js`, `SUPPRESS_LABEL_WARNING` (+25 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 342 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DezQuant (ARF-OS Research Platform)` connect `Backtest Stages & Control` to `DezQuant App Views & UI`, `Committee & Handoffs`, `Evidence Standards & Grades`, `Artifact Builder`, `ARF-OS Spec Architecture`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `/js/sync.js`, `/js/db.js`, `/js/lanes.js` to the rest of the system?**
  _30 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DezQuant App Views & UI` be split into smaller, more focused modules?**
  _Cohesion score 0.05909558067831449 - nodes in this community are weakly interconnected._
- **Why does `ARF-OS (AI Research Hedge Fund Operating System)` connect `ARF-OS Spec Architecture` to `Research Lanes & Roles`, `Backtest Stages & Control`, `Committee & Handoffs`, `Evidence Standards & Grades`, `Agent Desk Routing`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Should `Desk Dashboard Server` be split into smaller, more focused modules?**
  _Cohesion score 0.06662770309760374 - nodes in this community are weakly interconnected._
- **Why does `SDL_TEMPLATE` connect `Pine Code Generator` to `DezQuant App Views & UI`, `Core E2E Test`, `Mobile E2E Test`, `Sync E2E Test`, `SDL Strategy Runner`, `Artifact E2E Test`, `Practice Arena Challengers`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Should `Platform Workspace Sync` be split into smaller, more focused modules?**
  _Cohesion score 0.12051282051282051 - nodes in this community are weakly interconnected._