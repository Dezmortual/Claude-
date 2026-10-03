# Repository guide

TradingView Pine Script v6 indicators and strategies, plus the ARF-OS research pipeline.

## Pine scripts (repo root)
- `sweep_indicator.pine`, `sol_donchian_indicator.pine`, `crypto_donchian_scanner.pine`

## ARF-OS agent pipeline
- Specialist subagents: `.claude/agents/*.md` (prompts from `SPECIALIST_AGENT_PROMPTS.md`)
- Leader / orchestrator: `.claude/skills/arf-pipeline/SKILL.md`. Use it for any request to research, build, test, validate or judge a trading strategy.
- Shared rules: `research/POLICY.md`. Artefact formats: `research/SCHEMAS.md`. Audit log: `research/REGISTRY.md` (append-only).
- No TradingView compiler or runner exists in this environment. Agents must return BLOCKED instead of inventing compile results, trades or metrics.
