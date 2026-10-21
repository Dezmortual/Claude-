# Recon map: BeCoin (web; clone ships web + iOS/Android)

Scope: the forecast core loop. Forecast hub table -> per-asset forecast page
(chart, technical pulse, short/long-term tables, calculators) -> watchlist and
alerts -> paid plans gated by market. Excluded: the 27-tool calculator catalog,
paper-trading simulator, trading journal, broker reviews, blog/videos, the
standalone Forecast API, and the 12 locales.
For: a product to sell. Responsive web plus a mobile app. BeCoin has no
mobile app (none found on either store), so the mobile screens are new
design, not a copy.
Date: 2026-10-21

## Clean-room note (read first)

BeCoin's Terms of Use say "BeCoin owns or licenses the site design, text,
forecasts, tables, model explanations", forbid creating "a substitute product
from BeCoin content" and "competing datasets", and allow automated access only
through published APIs. So:

- This map records **features and flows only**, from public pages read one at
  a time. No BeCoin account was used, and none should be.
- The clone must produce **its own** forecasts, signals, copy, FAQ and
  methodology text. Never import, cache or display BeCoin numbers or text.
- No screenshots were captured into `replica/screens/` (no browser tool was
  connected to the user's own browser). Add them by hand if useful, as
  reference only.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | marketing site / home | https://becoin.net/ | hero, stats bar, first signals table with Investing / Day Trading tabs, full nav and footer map |
| 2 | pricing page | https://becoin.net/tariff-plan | 4 plans, gating by market; API plans sold separately |
| 3 | forecast hub | https://becoin.net/forecast-hub | the main table: columns, filters, column picker, pagination, movers, outlook |
| 4 | crypto asset forecast | https://becoin.net/forecast/bitcoin | the full per-asset template, 23 sections, crypto extras (halving, ATH, DCA) |
| 5 | forex asset forecast | https://becoin.net/forecast-forex/eurusd | same template, forex variant (sessions, log scale, candles, cross-check) |
| 6 | stock asset forecast | https://becoin.net/forecast-stock/aapl | same template, stock variant (quote header, "About" block) |
| 7 | live price page | https://becoin.net/live-price/bitcoin | live candles, stats, converter, market pulse, "Pro" teaser |
| 8 | market signals directory | https://becoin.net/markets/crypto/signals | asset grid (36 crypto cards), section tabs per market |
| 9 | tools catalog | https://becoin.net/tools | out of slice; listed for reference |
| 10 | sign up | https://becoin.net/register | name, email, password x2, terms checkbox, Google OAuth |
| 11 | sign in | https://becoin.net/login | email + password, Google OAuth, forgot password link |
| 12 | about | https://becoin.net/about | team, positioning; no methodology or data providers named |
| 13 | terms of use | https://becoin.net/terms-of-use | IP and competitor clauses quoted above |
| 14 | app stores | (search, none found) | no BeCoin app on the App Store or Google Play |
| 15 | Trustpilot | https://www.trustpilot.com/review/becoin.net | not read here; input for /replica-entrepreneur |

Not reachable as a guest (inferred only): `/watchlist-live`, `/alerts`, the
account dashboard, checkout, forgot-password, and the per-asset signal detail
page.

## Core loop

A trader opens the forecast table, filters for strong signals in a market
they pay for, drills into an asset's forecast page, and watchlists it or sets
an alert so they come back when the signal changes.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Home | `/` | pitch + first signals table | hero, stats bar, Investing/Day Trading tabs, signals table, filters, CTA | loading ("Loading live signals...") |
| S02 | Forecast hub | `/forecast-hub`, nav "Forecasts" | the main product: every asset's forecast in one table | market switcher, signal-strength + volatility filters, search, category chips, data table, pagination, movers, outlook, unlock box | filled, loading (outlook "Building today's outlook...") |
| S03 | Customize columns | modal from S02/S01 table | show/hide table columns | modal, per-column toggles, Reset All, Done | open |
| S04 | Market overview | `/markets/{market}` (7 markets) | entry per market | breadcrumb, section tabs (Overview, Live Price, Forecast, Signals, Price History, Converter) | filled |
| S05 | Market asset directory | `/markets/{market}/signals`, `/forecast-{market}` | pick an asset in a market | asset card grid ("Open ->"), snapshot-age note | filled |
| S06 | Asset forecast page | `/forecast/{slug}`, `/forecast-{market}/{slug}` | everything about one asset's outlook | price banner, stat cards, history/forecast chart w/ band, technical pulse, 14-day + 4-week tables, scenario calculator, range levels, technical summary, long-term fan chart, yearly + monthly tables, year cards, contributions/DCA calculator, methodology, FAQ, related assets | filled, loading, "Unavailable" timeframes (insufficient candles), data-quality notice (quarantined record) |
| S07 | Asset live price | `/live-price/{slug}`, `/markets/{market}/live-price/{slug}` | live quote + chart | live candle chart, range buttons, "why is it moving" panel, stats, mini converter, market pulse, Pro teaser | filled, loading, dashes for missing feed fields |
| S08 | Asset signals detail | per-asset Signals tab | timeframe verdicts + indicator breakdown | technical pulse cards, MA table, oscillator table | **inferred**: page not observed; same data as S06 section 6 |
| S09 | Pricing | `/tariff-plan`, nav "Pricing", every "Get full access" CTA | choose a plan | 4 plan cards, yearly / monthly toggle, feature comparison table, API plan table, cancellation note | filled |
| S10 | Sign in | `/login`, header, gated icons redirect here | log in | tabs (Sign In / Create Account), Google button, email, password + show, forgot link | default |
| S11 | Sign up | `/register` | create account | Google button, name, email, password x2 + show, terms checkbox | default |
| S12 | Forgot password | link on S10 | reset password | email field (inferred) | **inferred** |
| S13 | Watchlist | `/watchlist-live`, header icon | the user's assets with live prices/signals | table of saved assets (inferred) | logged-out -> redirect to S10; rest **inferred** |
| S14 | Alerts | `/alerts`, header icon | manage alerts | alert list, create form (inferred) | logged-out -> redirect to S10; rest **inferred** |
| S15 | Account dashboard | after sign-up ("account dashboard") | plan, billing, profile | **inferred** | **inferred** |
| S16 | Checkout | from S09 (S11 is titled "Start Secure Checkout") | pay | **inferred**: crypto payments mentioned, cancellation via live chat | **inferred** |
| S17 | Legal / disclaimer | `/terms-of-use`, `/privacy-policy`, `/cookie-policy`, `/disclaimer` | legal | text pages | filled |

Mobile app (new, no original): M01 Signals feed (S01/S02 as a card list),
M02 Asset (S06 condensed), M03 Watchlist (S13), M04 Alerts (S14) + push
permission, M05 Paywall (S09), M06 Auth (S10/S11), M07 Settings/account (S15).

## Flows

```
F01 Guest finds a strong signal
    S01 -> S02 (market chip) -> filter "Strong Buy" -> S06
    happy path clicks: 3
    edge: market has 0 rows for the filter; table still loading; asset locked for guest/plan
```
```
F02 Read an asset's outlook and size a position
    S06 -> pick chart horizon (1D/1W/1M) -> scenario calculator: amount, horizon, Calculate
    happy path clicks: 3 (+ typing the amount)
    edge: timeframe "Unavailable" (too few candles); quote stale vs cross-check; non-numeric amount
```
```
F03 Sign up and subscribe
    S09 (yearly/monthly toggle, pick plan) -> S11 (or Google) -> S16 checkout -> S15
    happy path clicks: ~5
    edge: email already registered; Google account w/o name; payment fails; crypto payment pending; upgrade/downgrade mid-period
```
```
F04 Watchlist an asset
    S06 -> watchlist (star) -> [S10 if logged out, then back] -> S13
    happy path clicks: 1 logged in, ~4 logged out
    edge: plan does not include the asset's market (Day Trader has no watchlist at all); duplicate add; asset delisted
```
```
F05 Set an alert and get notified
    S06 or S14 -> new alert: asset, condition (price crosses X / signal changes to Strong Buy), channel -> save
    -> email / push fires -> deep link to S06
    happy path clicks: ~4
    edge: condition already true at creation; alert flaps around threshold; push permission denied (mobile); plan downgraded with active alerts
```
```
F06 Day trader checks an intraday signal
    S01 -> Day Trading tab -> pick timeframe -> S06 technical pulse (5m/30m/1h/1d/1w) -> indicator tables
    happy path clicks: 3
    edge: intraday timeframe unavailable for forex/stocks outside session hours
```
```
F07 Hit the paywall
    S02 -> pick Forex while on Starter -> locked rows / "Unlock all 198 assets" -> S09 -> upgrade
    happy path clicks: 2 to reach pricing
    edge: guest vs logged-in free vs lower plan show different prompts
```
```
F08 Customize the forecast table
    S02 -> Customize Columns (S03) -> toggle columns -> Done (persists)
    happy path clicks: 3+
    edge: hide all columns; Reset All; preference per device vs per account; mobile width
```
```
F09 (mobile, new) Alert push -> asset
    push notification -> M02 asset -> M03 add to watchlist
    happy path clicks: 1
    edge: app cold start from push; logged out session; subscription bought on web vs in-app
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Header / mega nav | desktop dropdowns, mobile drawer | default, open, logged-in, logged-out | all |
| Icon button (watchlist, alerts, simulator) | header, inline on asset | default, active (saved), requires-login | all, S06 |
| Breadcrumb + section tabs | market tabs, asset tabs | active tab | S04-S08 |
| Market switcher / category chips | Mix + 7 markets | selected, locked (plan) | S01, S02 |
| Tabs | Investing / Day Trading; Sign In / Create | selected | S01, S02, S10 |
| Select filter | signal strength, volatility | default, applied | S01, S02 |
| Search input | table search | empty, typing, no results | S02 |
| Data table | forecast table, indicator table, forecast-range tables | loading, filled, empty, locked rows, sorted | S01, S02, S06, S08 |
| Column picker | modal with toggles | open, reset | S03 |
| Pagination | rows-per-page 10/20/50/100, prev/next, numbered | first, middle, last page | S02 |
| Asset cell | logo + name + ticker, linked | default | S02, S05, S13 |
| Price + change | value, +/- % colored | up, down, flat, stale | everywhere |
| Signal badge | Strong Buy, Buy, Neutral, Sell, Strong Sell | five colors | S01, S02, S06, S08 |
| Trend pill | MACD bullish/bearish, Golden/Death Cross, 200-MA up/down (% from MA), volatility High/Moderate/Low | colored | S02, S06 |
| Price chart | line, candlestick; linear/log; range buttons (1D-All); History/Forecast toggle; forecast band + midpoint overlay | loading, filled, insufficient data | S06, S07 |
| Scenario fan chart | bear/base/bull paths to 2030/2036 | filled | S06 |
| Technical pulse card | per timeframe verdict (5 cards) | Buy/Neutral/Sell, Unavailable, selected | S06, S08 |
| Stat card | market cap, volume, ATH, range, next halving | value, unavailable | S06, S07 |
| Calculator form | scenario (amount + horizon), contributions/DCA (monthly + years), converter | empty, computed, invalid input | S06, S07 |
| Year outlook card | year, theme, bear/base/bull | filled | S06 |
| Movers list | top gainers/losers + horizon toggle | filled | S02 |
| FAQ accordion | short-term, long-term groups | collapsed, expanded | S02, S06 |
| Asset grid card | name, ticker, "Open ->" | default | S05 |
| Byline / data-provenance strip | author, reviewer, quote-check timestamp, source | fresh, stale | S06, S07 |
| Pricing card + billing toggle | 4 plans, "Most popular" badge, yearly/monthly | selected, current plan | S09 |
| Feature comparison table | check / cross per plan | - | S09 |
| Paywall / unlock box | inline banner, locked row overlay | guest, under-plan | S02, S07 |
| Auth form | sign in, sign up, Google button, show-password | default, error, submitting | S10, S11, S12 |
| Disclaimer / risk banner | footer, inline | - | all |
| Modal | generic | open, closing | S03 |
| Toast | success, error | - | **inferred** (watchlist add, alert saved) |
| Skeleton / loading text | table, panel | - | everywhere |

## Inferred data model

```
User          id, name, email, password_hash?, google_sub?, created_at, locale
              evidence: S10, S11 (name, email, password x2, Google OAuth)
              confidence: high
Plan          id, code (day_trader|starter|pro|unlimited), price_monthly, price_yearly,
              markets_included[], has_investing_tab, has_watchlist_alerts
              evidence: S09 comparison table
              confidence: high
Subscription  id, user_id, plan_id, interval (month|year), status, current_period_end,
              provider (card|crypto|app_store|play), cancel_at_period_end
              evidence: S09 ("cancel anytime... access until end of period", crypto payments)
              confidence: medium
Market        id, code (crypto|forex|stocks|commodities|indices|etfs|bonds), name
              evidence: S02 switcher, S04
              confidence: high
Asset         id, market_id, slug, ticker, name, logo, quote_unit, base/quote (forex),
              data_source, cross_check_source, is_active
              evidence: S02 asset cell, S05 grid (198 total; 36 crypto), S06 provenance strip
              confidence: high
PriceBar      asset_id, timeframe (5m|30m|1h|1d|1w), ts, open, high, low, close, volume,
              source, quarantined (bool)
              evidence: S06/S07 candles, "quarantined 2012 record", "11,557 daily observations"
              confidence: high
Quote         asset_id, price, change_24h_pct, observed_at, checked_at, source, spread_vs_crosscheck
              evidence: S06 price banner, S07, methodology "spread thresholds, 60-second refresh"
              confidence: high
Forecast      id, asset_id, generated_at, model_version, horizon (1d|7d|1m|1y|5y|10y),
              low, mid, high, direction_prob
              evidence: S02 columns, S06 band ("model-implied 80% band"), signal thresholds (>=65%)
              confidence: medium (prob field inferred from Strong Buy >= 65% legend)
ForecastPath  forecast_run_id, granularity (day|week|month|year), period, low, mid/avg, high, change_pct
              evidence: S06 14-day, 4-week, 12-month, 2026-2036 tables
              confidence: high
Scenario      asset_id, year, bear, base, bull, avg_roi, narrative, drivers[]
              evidence: S06 yearly bands, year cards, scenario drivers
              confidence: high
SignalSnapshot asset_id, timeframe, computed_at, verdict (strong_buy..strong_sell),
              ma_votes {buy,neutral,sell}, osc_votes {buy,neutral,sell}
              evidence: S06 technical pulse ("20 rules: 10 MAs, 10 oscillators")
              confidence: high
IndicatorValue snapshot_id, kind (ma|oscillator), name, value, signal
              evidence: S06 MA and oscillator tables
              confidence: high
AssetMetrics  asset_id, as_of, macd_signal, ma_cross (golden|death), ma200_trend, pct_from_ma200,
              volatility_label, volatility_pct, sharpe, dividend_yield, range_20d/90d hi/lo
              evidence: S02 columns, S06 range levels
              confidence: high
WatchlistItem user_id, asset_id, added_at, sort
              evidence: header icon, /watchlist-live
              confidence: medium
Alert         id, user_id, asset_id, condition_type (price_above|price_below|signal_change|
              forecast_move), threshold, timeframe, channels[], active, last_fired_at
              evidence: /alerts exists, "intraday signals, alerts" in unlock box
              confidence: guess (no alert UI visible to guests)
AlertEvent    alert_id, fired_at, payload, delivered_via
              confidence: guess
TablePreference user_id, visible_columns[], rows_per_page
              evidence: S03 column picker
              confidence: medium (could be localStorage only)
DeviceToken   user_id, platform, token  (clone only, for push)
              confidence: n/a (new)
```

Relationships: Market 1-n Asset; Asset 1-n PriceBar, Quote, Forecast,
SignalSnapshot, Scenario, AssetMetrics; Forecast 1-n ForecastPath;
SignalSnapshot 1-n IndicatorValue; User 1-1 Subscription n-1 Plan;
Plan n-n Market (entitlement); User 1-n WatchlistItem, Alert, DeviceToken;
Alert 1-n AlertEvent.

## Feature matrix

See `features.csv`. Must: 25, should: 18, could: 10, skip: 10.

## Out of scope (cannot or should not be cloned)

- **BeCoin's forecasts, signals, tables, text, FAQ and methodology write-ups.**
  Their terms claim them, and a clone built on them is the "substitute
  product from BeCoin content" they prohibit. The clone needs its own model.
- **The accuracy claim ("68-72%", "~72%").** It isn't substantiated anywhere
  on the site, and the hub's FAQ gives different numbers. The clone can only
  state accuracy it measures itself, out of sample, with a public track record.
- **Market data rights.** Crypto prices are freely available (exchange APIs).
  Real-time stocks, indices, ETFs and some forex need licensed feeds, with
  display or redistribution fees per user. Budget this, or launch crypto-first.
- **Broker affiliate deals** (Pocket Option, Quotex, etc.) and their referral
  links. Those are partner contracts, not product. Many of those brokers are
  binary-options platforms that are restricted or banned in the EU, UK and US.
- **Testimonials, team bios and track-record claims.** These belong to people.
- **Regulation.** Selling buy/sell signals can count as investment advice in
  some jurisdictions (UK FCA, EU MiFID). The US publisher exemption needs
  impersonal, non-tailored advice. Get advice before charging money.
- **App-store billing.** Selling the subscription inside the iOS/Android app
  means using IAP and paying the stores' cut, unless you take the
  reader-app or external-link route.
- **Out of the chosen slice** (`skip` rows): the 27-tool catalog, simulator,
  trading journal, Forecast API, broker reviews, blog, and 12 locales.

## Size

Screens: 17 web (5 of them inferred) plus 7 mobile. Flows: 9. Entities: 17.

Hard parts:

1. **The forecasting and signal engine, with honest accuracy tracking.**
   That's 198 assets across 6 horizons, refreshed hourly. It's the product,
   and nothing on BeCoin can be reused for it. This repo's `trading-desk/`
   (backtest discipline, `core/`) is the right base: publish the
   out-of-sample hit rate per horizon instead of a headline number.
2. **Market data ingest across 7 markets.** That means 60-second quotes, a
   cross-check source, candle history, data-quality quarantine, and the
   licensing above.
3. **Alerts plus mobile push, with plan entitlements.** Evaluating conditions
   on every refresh, debouncing flapping alerts, delivering by email and APNs
   or FCM, and gating by market per plan, kept in sync across web, App Store
   and Play billing.

Also non-trivial: the long, data-dense asset page (23 sections) on a phone,
and chart overlays (forecast bands, scenario fans).

Size: **L** (a quarter). It drops to **M** for a crypto-only v1 (free data,
about 36 assets, web plus mobile shell), which is the recommended first cut.
