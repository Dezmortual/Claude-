# DezEdge

**Find your edge before you trade.** DezEdge (formerly the ARF-OS Research Platform) is a browser-based build of the ARF-OS spec (`AI_RESEARCH_HEDGE_FUND_SPEC.md`): a
multi-agent research factory that discovers, builds, backtests, tries to break,
judges and paper-tests systematic trading strategies. Everything runs as a
static site. There is no server and no build step, and data lives in your
browser.

Hosted with the Agent Desk on GitHub Pages at
`https://dezmortual.github.io/Claude-/platform/`.

## How it works

```
Campaign brief ─► Orchestrator ─► Idea Scout ─► (triage) ─► Indicator Researcher ─► Strategy Architect (SDL)
                                                                                         │
     Committee (human) ◄─ Strategy Judge ◄─ Robustness Validator ◄─ Backtest Engineer ◄─ research runner ◄─ Pine Engineer
           │
           └─► Paper forward test on live bars ─► Forward-Test Operator ─► live-candidate review (outside ARF-OS)
```

- **Agents** (`js/agents.js`) are Claude calls with a shared policy, a role
  prompt and a typed JSON output contract. Each output is validated
  (`js/schema.js`). A failed contract gets one repair attempt, then the task
  fails visibly.
- **The control plane** (`js/workflow.js`) owns the task queue, the version
  state machine, transitions, handoffs (spec §8), budgets and audit records.
  An agent never changes workflow state directly.
- **Lane handlers** (`js/lanes.js`) define what each task does and what comes
  next. The final holdout is evaluated once per version, and only the
  Validator and the Judge see it. A child version created after a holdout was
  seen is marked contaminated, so forward evidence becomes required.
- **The research runner** (`js/runner.js`, `js/indicators.js`, `js/sdl.js`) is
  a deterministic, Pine-compatible bar-close backtester. It executes the
  Strategy Definition Language: no free-form code, only a small expression
  grammar over named series. It runs in a Web Worker.
- **The research pipeline** (`js/research.js`) runs a smoke test, a baseline,
  an in-sample search with a predeclared selection rule (neighbourhood
  plateau), a validation segment, walk-forward analysis, the robustness suite
  (costs, slippage, delay, missed trades, neighbours, start-date shifts,
  calendar segments, concentration, Monte Carlo, benchmark), the policy gates,
  hard fails and the composite evidence score (spec §12.7).
- **TradingView parity** (`js/tv.js`): upload the Strategy Tester's List of
  Trades CSV. Trades are matched against the runner by direction and entry bar,
  with a versioned tolerance policy.
- **Pine QA** (`js/pine-lint.js`) runs the static checks from spec §11.11:
  lookahead, negative offsets, missing costs, unbounded inputs, alert IDs and
  conformance to the definition.
- **Forward tests** re-run the frozen version on bars that closed after the
  deployment started. Nothing is backfilled. Health and drift are tracked
  against backtest expectations.
- **Practice Arena** (`js/practice.js`) runs blind benchmark suites with hidden
  labels and deterministic scoring. A prompt edit stays a challenger until a
  human promotes it.

## Running it

1. Serve the `arf-os-studio/` folder with any static server, or use the Pages
   site. ES modules need `http://`, not `file://`.
2. Open **Policies & Admin** and paste an Anthropic API key. Calls go from the
   browser straight to `api.anthropic.com`, and the key stays in IndexedDB on
   this device. Inside the Claude artifact viewer, no key is needed.
3. Create a campaign: a brief, a market (Binance or Coinbase public candles, or
   a CSV you upload), a policy profile and a budget. Then start it.
4. Watch the task graph, review ideas in the Research Inbox, and read the
   evidence on each strategy page. Approve paper tests in the Committee.

Every lane defaults to Claude Opus 5.5. You can change the model and effort per
agent on the Agents page. Spend is estimated from token usage at list prices
and is capped by each campaign's budget.

## Running inside Claude (artifact)

`artifact.html` is the entry page for publishing the platform as a Claude
artifact. Regenerate it with `node build-artifact.mjs` after changing
`index.html` or `css/app.css`. Publish it with the `js/` and `data/` files and the `sample`
and `downloads` capabilities. In that mode:

- agents run on the viewer's Claude plan, so no API key is needed
- the sandbox blocks other websites, so price history comes from the built-in
  library in `data/` (gold, silver, forex, indices, oil and major crypto at 1h,
  4h and daily), which `.github/workflows/prices.yml` refreshes every day with
  `tools/fetch-prices.mjs`; pasted text and CSV uploads (TradingView → Export
  chart data) still work, including fresh bars for forward-test checks
- exports go through the viewer's save dialog, and confirmations are shown on
  the page
- data lives in the artifact's own browser storage, so export the workspace
  regularly as a backup

## Boundaries

- No live orders, no exchange keys, no capital movement.
- No agent can grant `LIVE_APPROVED`. The highest in-app state is
  `LIVE_CANDIDATE`, which means "eligible for a human review outside ARF-OS".
- Paper tests need a human approval. Overrides need a reason and are shown as
  overrides.
- This is a research tool, not a fund, an adviser or a broker. An evidence
  grade measures the quality of the evidence. It does not promise profit.

## Tests

```
cd arf-os-studio/platform
npm test                     # engine unit tests (runner, indicators, SDL, lint, parity, pipeline)
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node test/e2e.mjs [screenshotDir]
```

The end-to-end test drives the real app in headless Chromium. It mocks the
Anthropic API and Binance, then runs a campaign through every lane, a
TradingView parity upload, a human override, a paper deployment, a forward
check, a practice suite and the Backtest Lab. It fails on any page or console
error.
