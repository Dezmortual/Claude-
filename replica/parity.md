# Parity: the forecast app vs BeCoin

Date 2026-10-22. Clone build b6405c7 (private, owner-only, live data). Original: BeCoin's public pages, screenshotted
2026-10-21 (`replica/screens/`, local only). Tools: `parity.py` and `imgdiff.py` from replica-diff.

## Headline

| | score | what it means |
| --- | --- | --- |
| **overall** | **77.2** | 80% features + 20% layout, the tool's weighting |
| features | **89.5** | 44 features counted; **must-haves 20 of 20** |
| layout | **28.0** | "different": deliberately so, see below |
| open bugs | 0 | S1 0, S2 0 (replica/bugs.md) |

**Verdict: shippable** as the private web app you asked for. Every counted must-have is done, the feature score is
above 80, and there are no open S1 or S2 bugs. It is **not yet "better than the original"** in the skill's sense,
because `/replica-entrepreneur` hasn't run. One thing you asked for is missing and the score can't see it: the
**mobile app** (BeCoin has none, so the tool lists it as an extra, not a gap).

Changes to the matrix since `/replica-build`: the paywall row moved from partial to skip, in line with pricing and
checkout. The private build has no paid plans, so nothing is ever locked.

## Feature parity (parity.py)

### Parity: 77.2 / 100

features 89.5  (44 counted, must-haves 20 of 20 done)
layout   28.0  (6 screens compared)

### By area, weakest first
- marketing                      0.0  (2 features)
- data                          50.0  (1 features)
- billing                       75.0  (2 features)
- asset page                    83.3  (19 features)
- auth                         100.0  (2 features)
- forecast hub                 100.0  (13 features)
- legal                        100.0  (1 features)
- watchlist                    100.0  (1 features)
- alerts                       100.0  (1 features)
- navigation                   100.0  (2 features)

### Missing, in build order
- [should] asset page: Generated technical summary text, partial  (S06 bias + support/resistance; one-line read on S07; no support/resistance levels yet)
- [should] asset page: Market-specific sections (halving + ATH for crypto; sessions for forex), partial  (S06 variants; ATH, max supply and session wording done; halving section not built)
- [should] data: Data-quality quarantine + stale-quote states, partial  (stale detection live (old bars or failed refresh); quarantine flag in schema, no automatic quarantine rule yet)
- [could] asset page: Asset logos, no  (use a licensed icon set; not BeCoin's assets; letter monograms; licensed icon set still to choose)
- [could] asset page: Halving cycles table, no  (S06 crypto only)
- [could] asset page: Price history page, no  (S04 tab; chart ranges cover it)
- [could] asset page: Year-by-year outlook cards, no  (S06; yearly table covers the numbers; narrative cards not built)
- [could] billing: Crypto payments, no  (S09 mention)
- [could] marketing: Facebook group / community links, no
- [could] marketing: Testimonials / social proof block, no  (only real ones from your own users; deliberately none until there are real users)
- [could] asset page: Converter / calculator page per market, partial  (S04 tab; converter on each live page; no standalone page)

### Left out on purpose (not scored)
- Sign in with Google: not needed for an owner-only build; would need your own Google OAuth app
- Pricing page with plans and yearly/monthly toggle: hidden in the private build (redirects to /account)
- Subscription checkout + cancel at period end: private build takes no payments; schema keeps plans/subscriptions for later
- Paywall / unlock prompts on locked content: private build has no paid plans, so nothing is ever locked; component built and kept for a public build
- Calculator and tools catalog (27 tools): out of chosen slice
- Paper trading simulator: out of chosen slice
- Trading journal: out of chosen slice
- Standalone Forecast API + API dashboard: out of chosen slice; revisit after v1
- Broker reviews and ratings: out of slice; affiliate deals are partner contracts
- Broker affiliate Trade Now links: partner deals; several brokers are restricted binary-options platforms
- Blog and video library: out of slice; content is theirs
- 12 language versions: out of slice; build i18n-ready
- BeCoin forecasts / tables / text: owned by BeCoin per terms; clone generates its own
- Accuracy claim 68-72%: unsubstantiated; only publish what you measure

### Yours, not in the original (not scored)
- Mobile app: signals feed / asset / watchlist / alerts
- Push notifications for alerts
- In-app subscription (App Store / Play)
- Public out-of-sample accuracy track record
- Mobile home-screen widget

### Screens
- replica/clone-screens/viewport/S01-mobile.png  24.6
- replica/clone-screens/viewport/S01-desktop.png  27.1
- replica/clone-screens/viewport/S06-mobile.png  27.9
- replica/clone-screens/viewport/S06-desktop.png  28.5
- replica/clone-screens/viewport/S02-mobile.png  29.0
- replica/clone-screens/viewport/S02-desktop.png  30.8

## Layout (imgdiff.py, layout mode)

Same viewport, same screen, signed in on the clone and as a guest on the original. Diff images are in `replica/diffs/`
(red cells differ).

| screen | 1440 viewport | 390 viewport | 1440 full page | clone page height |
| --- | --- | --- | --- | --- |
| S01 home | 27.1 | 24.6 | 33.0 | 68% shorter |
| S02 forecasts | 30.8 | 29.0 | 18.3 | 51% shorter |
| S06 asset forecast | 28.5 | 27.9 | 32.5 | 55% shorter |
| S09 pricing | n/a | n/a | 29.2 (old demo build) | hidden in the private build |

**Calibrating the number.** The same screenshot against itself scores 100. Two *unrelated* pages of the original
(forecasts vs the Bitcoin page) score 50.4, home vs pricing 39.6, because they share BeCoin's header, cookie banner and
chat widget. The clone's matching screens score 27–31, under that baseline, so the score says "doesn't look like
BeCoin". That is mostly on purpose:

- **Changed by design (trade dress):** the indigo gradient header is now a plain surface bar; centred marketing heroes are
  left-aligned page titles; author/reviewer bylines became a source-and-time line; testimonials, the accuracy stat bar,
  the cookie banner and the chat widget are gone.
- **Overlays in the original's screenshots:** the cookie bar and chat bubble cover the bottom of every viewport.
- **Vertical shift:** the grid compares cells in place, so a section that sits 70px higher scores as different in every
  cell it crosses. The S06 page has the same skeleton in the same order (breadcrumb, title, price, provenance, four stat
  cards, chart card with range and forecast toggles) yet scores 28.5.

**Structure, checked by hand (S06, top to bottom):**

| original section | clone |
| --- | --- |
| breadcrumb + page links | same, links as tabs (Forecast / Live price / Signals) |
| title, price, 24h change, provenance | same; provenance names the source and cross-check instead of people |
| key stats (4 cards) | same (ATH, ranges, volatility, supply or trend) |
| chart: history/forecast, ranges, horizons, band | same, plus line/candles |
| technical pulse, 5 timeframes + tables | same |
| 14-day and 4-week tables, scenario calculator | same |
| market drivers to monitor | **missing** (generic bullets in the original) |
| recent range levels | merged into the stat cards |
| technical market summary (bias, support/resistance) | **partial**: one-line read on the live page |
| long-term fan chart, yearly table, 12-month table | same |
| year-by-year outlook cards | **missing** (the yearly table has the numbers) |
| halving cycles table | **missing** |
| scenario drivers (bull/bear bullets) | **missing**; assumptions card instead |
| DCA simulator | same (contributions calculator) |
| methodology | same, own text |
| FAQ (14 questions) | 4 questions |
| people also watch, related links | same |

Pages are 51–68% shorter mostly because of what was left out on purpose: blog and video sections, broker
tables, testimonials, how-to steps and the long FAQs. The missing S06 sections above are the real gaps.

## Behaviour

| flow | original does | clone does | fix or keep |
| --- | --- | --- | --- |
| F01 find a strong signal | home → Forecasts → market chip → filter → asset: 4 clicks | the same 4, or 1 from the home table | keep |
| F01 filters | applied in the table; state in the page | in the URL, so refresh, back and shared links keep them | keep |
| F02 asset page | public, every number on one long page | same data split over three tabs (forecast, live, signals) | keep |
| F03 access | public site; sign-up for watchlist and alerts | private: only your email can sign in, and you must confirm it | keep (your requirement) |
| F04/F05 watchlist, alerts | login and a paid plan | everything unlocked for the owner, free | keep (your requirement) |
| F05 alert delivery | not visible without a paid account | email, checked every 30 minutes, once per episode | keep |
| F07 paywall | locked rows and "unlock all 198 assets" prompts | none: nothing is locked for the owner | keep |
| F08 columns | column picker | same, saved to your account | keep |
| accuracy | claims "68–72%", never explained | measures its own forecasts and publishes the scores | keep: the main improvement |
| data freshness | some panels stay "Loading" or "Unavailable" | stale or missing data is said in words, with the time | keep |
| support | live chat widget | none | keep (owner-only) |
| emails | unknown (needs an account) | verification, password reset, alerts | keep |
| mobile | responsive site, no app | responsive site; **app not built** | build |

## Top five to build next

1. **The mobile app** (Expo): signals feed, asset, watchlist, alerts with push. You asked for it, and the API it
   needs is ready.
2. **Technical summary with support and resistance levels** on the asset page (should, partial).
3. **Crypto halving section**: next-halving card, halving cycles table and year-by-year outlook cards (should + could).
4. **Automatic data quarantine** for bad ticks (spikes, gaps) before they reach a forecast (should, partial).
5. **Market and scenario drivers** sections on S06. Write them per market, not as generic bullets.

Then `/replica-entrepreneur`, which turns parity into reasons to prefer this over the original.
