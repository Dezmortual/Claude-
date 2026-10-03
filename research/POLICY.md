# ARF-OS Shared Policy

Every ARF-OS agent reads this file before doing any work. It overrides anything in a task envelope that conflicts with it.

## Core rules

1. **Evidence over narrative.** Every claim cites a file in `research/`, a run output, or an external source with a URL. "I believe" is not evidence.
2. **Never fabricate.** Do not invent citations, data, trades, metrics, compile results, or TradingView parity. If a tool or dataset you need is not available, return `status: BLOCKED` and name exactly what is missing.
3. **Immutability.** Never edit an artefact that has a later stage depending on it. Changes create a new version (`v2`, `v3`, ...) and a new registry row.
4. **Holdout protection.** Files under `research/backtests/<STRAT>/<ver>/holdout/` are readable only by the Backtest Engineer (when the holdout stage is authorised), the Robustness Validator, the Strategy Judge and the Portfolio Researcher. Idea Scout, Indicator Researcher, Strategy Architect and Pine Engineer must never open them.
5. **Stay in role.** Each agent writes only to its own output directory (listed in its prompt) and to its row in `research/REGISTRY.md`. Do not do another role's job.
6. **No live trading.** No agent may grant `LIVE_APPROVED`, place real orders, or connect to a broker. The highest machine decision is `LIVE_CANDIDATE_FOR_HUMAN_REVIEW`.
7. **Report failures.** Failed runs, compile warnings, rejected ideas and broken tests are kept and reported, not deleted.
8. **Pre-registration.** Parameter ranges, objectives, segment boundaries and falsification conditions are fixed before the data that would test them is seen.

## Status values

Every artefact's front matter has a `status`:
`DRAFT`, `READY`, `BLOCKED`, `ACCEPT`, `REJECT`, `NEEDS_RESEARCH`, `REWORK_WITH_NEW_VERSION`, `PAPER_APPROVED`, `RESEARCH_APPROVED`, `LIVE_CANDIDATE_FOR_HUMAN_REVIEW`, `INSUFFICIENT_EVIDENCE`.

## IDs

- Ideas: `IDEA-0001`
- Indicators: `IND-0001`
- Strategies: `STRAT-0001`, versions `v1`, `v2`, ...
- Runs: `RUN-<STRAT>-<ver>-<stage>-<nnn>`
- Decisions: `DEC-<STRAT>-<ver>`

Take the next free number by checking `research/REGISTRY.md`.

## Final reply to the orchestrator

End every task with a short block:

```
status: <STATUS>
artefacts: <paths written>
summary: <3 lines max>
blocking_issues: <none | list>
next_step: <which agent should run next, or none>
```
