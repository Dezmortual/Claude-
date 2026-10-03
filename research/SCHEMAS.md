# ARF-OS Artefact Schemas

All artefacts are Markdown files with YAML front matter. Fields marked `?` are optional.

## IdeaCard: `research/ideas/IDEA-xxxx.md`

```yaml
id: IDEA-0001
status: ACCEPT | REJECT | NEEDS_RESEARCH
title:
hypothesis:            # falsifiable statement: "If X, then Y over horizon H, measured by M"
mechanism:             # why the effect might exist
expected_failure:      # where and when it should NOT work
markets: []
timeframes: []
required_inputs: []    # each marked pine_available: true/false
sources:               # url, what it claims, what it actually shows, licence
  - url:
    claims:
    evidence_strength: none | anecdotal | backtest | peer_reviewed
    licence:
closest_internal_duplicate:
strongest_reason_false:
likely_regime_failure:
likely_data_or_execution_trap:
cheapest_rejection_test:
information_value_rank:
```

## IndicatorCard: `research/indicators/IND-xxxx.md`

```yaml
id: IND-0001
idea: IDEA-0001
status: ACCEPT | REJECT | NEEDS_RESEARCH
name:
formula:
units:
measures:
role: signal | trend | regime | volatility | timing | exit | risk | confirmation
repaint_risk: none | low | high   # with explanation
lookahead_risk: none | low | high
mtf_behaviour:
warmup_bars:
parameters:
  - name:
    default:
    min:
    max:
    step:
    rationale:
redundant_with: []
synthetic_scenarios: []   # input series -> expected output
lag_and_failure_regimes:
```

## Strategy Definition (SDL): `research/strategies/STRAT-xxxx/vN/sdl.yaml`

```yaml
id: STRAT-0001
version: v1
status: READY | BLOCKED
thesis:
ideas: []
indicators: []
direction: long | short | both
universe: { symbols: [], timeframe:, session:, timezone: }
calc_on: bar_close
pyramiding: 0
entry: { long: [], short: [] }      # exact boolean conditions, no undefined words
exit: { stop_loss:, take_profit:, other: [] }
orders: { type: market | limit | stop, timing: next_bar_open }
sizing: { method:, value:, leverage:, margin: }
costs: { commission:, slippage_ticks: }
reentry_rules:
reversal_rules:
parameters:                          # ParameterManifest: optimisable ones only
  - { name:, default:, min:, max:, step:, unit:, rationale: }
frozen: []                           # everything not optimisable
segments:
  warmup_bars:
  development: { start:, end: }
  validation: { start:, end: }
  holdout: { start:, end: }
  embargo_bars:
selection_rule:                      # how parameters will be chosen from IS results
falsification_conditions: []
failure_modes: []
synthetic_tests: []
backtest_expectations: { min_trades:, max_dd:, notes: }
```

## Other artefacts

| Artefact | Path | Must include |
|---|---|---|
| Pine revision | `strategies/STRAT/vN/strategy.pine` + `manifest.yaml` | source hash, SDL hash, rule-to-line map, compile report, synthetic test report, alert examples |
| Backtest bundle | `backtests/STRAT/vN/` | plan, every run (failed included), parameter selection record, trade ledger CSV, equity CSV, metrics, data quality report, parity report |
| Validation report | `validation/STRAT-vN.md` | hard failures, soft concerns, robustness tests, rejection case, evidence grade A-F, recommendation |
| Forward report | `forward/STRAT-vN/` | signal integrity, paper ledger, equity, health snapshots, drift, incidents |
| Decision | `decisions/DEC-STRAT-vN.md` | decision, memo, conditions, required next evidence, review date, falsification conditions |
| Data quality | `data/DQ-<dataset>.md` | dataset status, defects, impacted run IDs, quarantine decision, remediation |
| Portfolio | `portfolio/PORT-<date>.md` | similarity clusters, exposure, stress tests, risk budget proposal, redundancies |
