---
slug: claude-
timestamp: 2026-10-12T01:08:14+00:00
title: backtest audit wedge
source_skill: money-tutorial
status: in-progress
next_skill: money-strategy
---

## Business state

The user builds and audits trading strategies in `trading-desk/` (Donchian, Sweep and trend ports of Pine scripts). The /money tutorial used this real case to look for a way to make money from that skill, and landed on auditing other traders' TradingView strategy backtests.

## Confirmed conclusions

- (new) Wedge: traders about to pay for a TradingView strategy, who need to know before buying whether its backtest is real.
- (new) Proof of ability: same-bar trail fiction exposed twice (Donchian 53% → 93% win rate; Sweep 38% → 78%, account "grows" by a 22-digit number).
- (new) Draft offer: $49 per strategy, 48-hour written verdict, trade-by-trade audit with an honest fill model.
- (new) Positioning: "Before you pay for a strategy, find out if its backtest is real."

## Ruled out

- Selling own signals or indicators: no out-of-sample edge (Donchian 2025+ t = 0.74; Sweep negative after costs on all 10 coins). Don't sell what your own audit rejects.
- Backtesting course as the lead offer: crowded and depends on an audience the user doesn't have yet (not rejected outright, deprioritised).

## Open hypotheses

- Riskiest: traders will pay for bad news *before* buying, not only after losing money. Test: the 7-day plan, ending with charging $49 on day 7 and counting who pays.
- Fiverr gigs (~$50–100) are generic and often skip repaint checks, so a specialist audit can charge at least as much. Prices unverified.

## Next move

Next: /money-strategy, digging into the riskiest assumption (will traders pay before buying?). First action (day 1, under 1 hour): turn the Sweep fiction row into one before/after chart, 78% shown vs 38% real.

## Notes

- 7-day plan: D1 chart · D2 post "Why your TradingView strategy shows a 90% win rate" · D3 share on r/algotrading and TradingView · D4 three free audits · D5 run with audit.py · D6 publish one with permission · D7 charge $49.
- Competitors: Fiverr Pine audit gigs (~$50–100), ABC Trading Group code audit (quoted), free TradingView "Repainting Statistics" script, LuxAlgo (~$59/mo, adjacent spend).
- Evidence: trading-desk/donchian/README.md, trading-desk/sweep/README.md, trading-desk/trend/README.md.
