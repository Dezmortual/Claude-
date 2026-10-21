# Architecture: your forecast-signals app (a rebuild of BeCoin's core features)

Reads `replica/recon.md` and `replica/features.csv`. Screen IDs (S01-S17,
M01-M07) and flow IDs (F01-F09) refer to the recon map. The schema lives in
`replica/schema.sql`. It was applied to Postgres 16 and its entitlement,
alert-limit and RLS rules were tested; see "Verified" at the end.

v1 scope is **crypto only** (about 36 assets on free exchange data, so the
data budget is zero at launch). The schema and plans already model all
7 markets, so adding forex or stocks later is an ingest adapter plus a
`plan_markets` row, not a migration.

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | Next.js (App Router) + TypeScript | asset and forecast pages are SEO landing pages, so they need server rendering with ISR; route handlers double as the mobile API |
| styling | Tailwind + tokens from /replica-design | one token file shared with the mobile app via NativeWind |
| mobile | Expo (React Native) + expo-router + NativeWind | one TypeScript codebase for iOS and Android, Expo push, and EAS builds |
| charts | TradingView Lightweight Charts (web) / react-native-wagmi-charts (mobile) | open source, built for candles + overlays (forecast band, scenario fan) |
| database | Postgres on Supabase | one database for users, billing and market data; RLS; pg_trgm search |
| ORM | Drizzle | typed SQL, migrations as plain SQL files (`schema.sql` is migration 0001) |
| auth | Supabase Auth: email + password, Google, Sign in with Apple | the recon shows email and Google; Apple sign-in is required on iOS whenever Google is offered |
| payments (web) | Stripe Checkout + Billing + Customer Portal | yearly and monthly prices, cancel at period end, card + Stripe's crypto payments |
| payments (mobile) | RevenueCat over App Store / Play billing | in-app subscriptions are mandatory for digital goods; RevenueCat normalises both stores into one webhook |
| email | Resend | transactional + alert emails, React Email templates |
| push | Expo Push Service | one API for APNs + FCM, token per device |
| forecast + data worker | Python 3.11 on Fly.io (one machine, APScheduler) | reuses `trading-desk/core` (`binance_data.candles`, `features`, `metrics`); pandas, which doesn't belong in a serverless function |
| jobs | APScheduler inside the worker; Vercel Cron only for web housekeeping | the heavy jobs need pandas and long runs; one scheduler, one place to look |
| files | Supabase Storage | asset icons (own/licensed set) and OG images |
| hosting | Vercel (web) + Fly.io (worker) + Supabase | all managed, all free or cheap at zero users |
| monitoring | Sentry (web, mobile, worker) + a `/healthz` freshness check | a stale-quote page is the main failure mode, so measure data age |

One database, one web app, one worker. No microservices, no message queue:
the worker writes rows, the web app reads them.

## Schema

Tables: **22**. Access rules: **RLS on every table**, in two layers:

- **User-owned tables** (`profiles`, `subscriptions` read-only, `watchlist_items`,
  `alerts`, `alert_events` read-only, `table_preferences`, `device_tokens`):
  owner-only policies on `auth.uid()`. The mobile app and browser can talk to
  these through the Supabase client directly.
- **Market data** (`price_bars`, `quotes`, `asset_metrics`, `forecast_runs`,
  `forecasts`, `forecast_paths`, `scenarios`, `forecast_outcomes`,
  `signal_snapshots`, `indicator_values`) and `webhook_events`: RLS on with
  **no policies**, so clients get nothing. The worker writes with the service
  role. The Next.js data layer reads with the service role and runs **one
  entitlement check per query**: `can_see_market(user, market)` or
  `assets.is_public`. Paid data is filtered on the server and never sent
  to the client hidden or blurred.
- **Catalogue** (`markets`, `assets`, `plans`, `plan_markets`): public read.

Table groups:

| group | tables |
| --- | --- |
| catalogue | markets, assets |
| billing | plans, plan_markets, profiles, subscriptions, webhook_events |
| market data | price_bars, quotes, asset_metrics |
| forecasts | forecast_runs, forecasts, forecast_paths, scenarios, forecast_outcomes |
| signals | signal_snapshots, indicator_values |
| user | watchlist_items, alerts, alert_events, table_preferences, device_tokens |

Constraints the recon calls for, enforced in the database rather than the UI:

- **Entitlements in one place.** The `user_entitlements` view picks the
  highest-ranked active subscription, so a user who pays on both web and iOS
  gets the better plan. Stripe and the stores both write to `subscriptions`,
  with `unique (provider, provider_ref)`.
- **Alert limits** (`max_alerts`, `has_watchlist_alerts`, market in plan)
  live in a `before insert` trigger, so a modified client can't get around
  them.
- **Watchlist inserts** need a plan with watchlists (an RLS `with check`)
  and are `unique (user_id, asset_id)` (F04 duplicate add).
- **Forecasts are append-only.** `unique (run_id, asset_id, horizon)`, plus
  `low <= mid <= high` and `target_at > generated_at` checks. A partial
  unique index allows only one `running` forecast run at a time. Readers
  only see the latest `published` run.
- **Track record.** `forecast_outcomes` scores every matured forecast:
  `direction_hit`, `inside_band`, `abs_pct_error`. This is the
  differentiator the recon found: publish your measured accuracy, not a
  slogan.
- **Signals** are `unique (asset_id, timeframe, bar_ts)` and computed only
  from closed bars.
- **Alert deliveries** are `unique (dedupe_key)`, which is alert id plus the
  timestamp of the triggering quote or bar, so one cross can't send twice.
- **Long horizons are scenarios.** For 1y, 5y and 10y,
  `kind = 'scenario'` and `p_up` is null. The UI labels them scenarios with
  the assumptions shown, never as predictions.
- **Money and time.** Prices are `price_month_cents` / `price_year_cents`
  plus `currency`. All times are `timestamptz`. `price_bars.ts` is the bar's
  open time in UTC, matching `trading-desk/core/binance_data.py`.
- **GDPR delete cascades.** Every user table references
  `profiles(id) on delete cascade`, and `profiles` references
  `auth.users on delete cascade`. Plans, markets and assets use
  `on delete restrict` where a user row or subscription depends on them.

## API

All JSON routes are `/api/v1/*` Next.js route handlers. The web app calls
them, and so does the mobile app with its Supabase JWT as the bearer token.
Asset pages are also server-rendered from the same data-layer functions, so
there's one code path. "who": `anyone` (guest), `user` (signed in), `plan`
(entitlement checked for the asset's market), `service` (worker or webhook
secret).

### F01 / F06 / F07 / F08: forecast table (S01, S02, S03)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET /api/v1/markets | markets + which the caller can see | anyone | - | `[{code,name,locked}]` | F01 F07 |
| GET /api/v1/forecasts | the forecast table from the latest published run | anyone (rows outside entitlement come back `locked:true` with no numbers) | `market, tab=investing\|day_trading, signal, volatility, q, sort, dir, page, per_page` | `{rows:[asset, price, h1d..h10y, macd, ma_cross, ma200, vol, sharpe, div], page, pages, run_at}` | F01 F06 F07 |
| GET /api/v1/movers | top 7 gainers/losers | anyone (entitled markets only) | `horizon=1d\|7d\|1m\|1y` | `{gainers[], losers[]}` | S02 |
| GET /api/v1/outlook | count of markets up/down + strongest move | anyone | `horizon` | `{up, down, strongest}` | S02 |
| GET /api/v1/me/preferences | saved columns / rows per page / tab | user | - | `table_preferences` | F08 |
| PUT /api/v1/me/preferences | save them | user | `{visible_columns[], rows_per_page, default_tab}` | 200 | F08 |

### F02: asset page (S06, S07, S08)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET /api/v1/assets/:slug | header, quote, stats, provenance, freshness | anyone | - | `{asset, quote, stats, sources, checked_at, status}` | F02 |
| GET /api/v1/assets/:slug/bars | candles for the chart | anyone for 1d+, plan for intraday | `tf, from, to` | `[{ts,o,h,l,c,v}]` | F02 |
| GET /api/v1/assets/:slug/forecast | horizons + band + 14-day/4-week/12-month paths | plan, or `is_public` asset | - | `{run_at, horizons[], paths{day,week,month}}` | F02 |
| GET /api/v1/assets/:slug/signals | technical pulse + indicator tables | plan (1d free on public assets) | `tf` | `{verdict, votes, indicators[]}` | F02 F06 |
| GET /api/v1/assets/:slug/scenarios | yearly bear/base/bull + assumptions | anyone | - | `{years[], assumptions}` | F02 |
| GET /api/v1/track-record | measured hit rate / band coverage / error by horizon | anyone | `market, horizon, window=90d` | `{n, hit_rate, coverage, mape}` | trust |

The calculators (scenario, DCA/contributions, converter) are pure client
functions over data already on the page. There's no route for them, and
they can't leak anything.

### F03: auth and billing (S09-S12, S15, S16, M05, M06)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| (Supabase Auth SDK) | sign up, sign in, Google, Apple, reset | anyone | - | session | F03 |
| GET /auth/callback | OAuth / magic-link / reset return | anyone | `code` | redirect | F03 |
| GET /api/v1/plans | plans + prices + feature matrix | anyone | - | `[plan]` | F03 |
| GET /api/v1/me/entitlements | current plan + markets | user | - | `{plan, markets[], period_end}` | F03 F07 |
| POST /api/v1/billing/checkout | Stripe Checkout session | user | `{plan_code, interval}` | `{url}` | F03 |
| POST /api/v1/billing/portal | Stripe Customer Portal (cancel, card, invoices) | user | - | `{url}` | F03 |
| DELETE /api/v1/me | delete account (cancels Stripe sub, deletes auth user, cascades) | user | `{confirm}` | 204 | GDPR |

### F04 / F05 / F09: watchlist, alerts, devices (S13, S14, M03, M04)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET /api/v1/me/watchlist | watchlist with live quote + signal | user (rows outside plan come back locked) | - | `[{asset, quote, signal}]` | F04 |
| POST /api/v1/me/watchlist | add | user + plan with watchlists | `{asset_id}` | 201 / 409 dup | F04 |
| DELETE /api/v1/me/watchlist/:asset_id | remove | user | - | 204 | F04 |
| GET /api/v1/me/alerts | list | user | - | `[alert]` | F05 |
| POST /api/v1/me/alerts | create (DB trigger enforces limit + market) | user + plan | `{asset_id, condition, threshold?, signal?, timeframe?, channels[]}` | 201 / 402 / 422 | F05 |
| PATCH /api/v1/me/alerts/:id | pause / edit | user | partial alert | 200 | F05 |
| DELETE /api/v1/me/alerts/:id | delete | user | - | 204 | F05 |
| GET /api/v1/me/alert-events | alert history | user | `before` cursor | `[event]` | F05 F09 |
| POST /api/v1/me/devices | register Expo push token | user | `{platform, expo_token}` | 201 (upsert) | F09 |
| DELETE /api/v1/me/devices/:token | unregister on logout | user | - | 204 | F09 |

That's **29 routes** (27 handlers plus the Supabase Auth SDK and the
callback), not counting webhooks.

**Webhooks in:**
- `POST /api/webhooks/stripe`: `checkout.session.completed`,
  `customer.subscription.created|updated|deleted`, `invoice.payment_failed`.
  The handler verifies the signature, inserts into `webhook_events`
  (ignoring conflicts), upserts `subscriptions`, then sets `processed_at`.
- `POST /api/webhooks/revenuecat`: `INITIAL_PURCHASE`, `RENEWAL`,
  `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`. It checks the shared-secret
  header, then follows the same insert-once, upsert-subscription steps as
  the Stripe handler.

**Webhooks out:** none in v1. A user-defined webhook as an alert channel is
a could-have for later.

**Jobs** (Python worker on Fly, APScheduler, UTC). Every job is idempotent
and safe to rerun:

| job | schedule | what it does |
| --- | --- | --- |
| `ingest_quotes` | every 60 s | Binance price per asset, cross-checked against CoinPaprika; upserts `quotes` and sets `status=diverged` past a spread threshold or `stale` past 3 minutes; then runs `evaluate_alerts(price)` |
| `ingest_bars` | 5m bars every 5 min (+20 s); 30m, 1h and 1d on their closes; 1w on Monday 00:05 | `core.binance_data.candles` tail fetch; upserts `price_bars`; quarantines bars that fail sanity checks (zero, a gap above 50%, high < low) |
| `compute_signals` | after each bar close | 10 moving averages + 10 oscillators on closed bars → `signal_snapshots` + `indicator_values` (`unavailable` if there aren't enough bars); updates `asset_metrics`; runs `evaluate_alerts(signal)` |
| `run_forecasts` | hourly at :07 | opens a `forecast_runs` row (the partial unique index blocks overlaps), writes every asset × horizon + paths, flips it to `published` in one transaction, then runs `evaluate_alerts(forecast_move)` |
| `run_scenarios` | daily 00:30 | yearly bear/base/bull with explicit CAGR assumptions → `scenarios` |
| `score_outcomes` | hourly at :37 | for every `kind=forecast` row whose `target_at` has passed and has no outcome: takes the realised close at `target_at` from `price_bars` and writes `forecast_outcomes` |
| `deliver_notifications` | every 15 s | sends pending `alert_events` through Resend and Expo Push; marks sent/failed; prunes `DeviceNotRegistered` tokens |
| `retention` | daily 03:00 | deletes 5m bars older than 30 days and 30m bars older than 180 days, and every run older than 90 days except one per day (outcomes stay) |
| `healthz` | every 60 s | writes data age; Sentry cron monitor alerts when quotes are more than 3 minutes old |
| Vercel Cron `revalidate` | every 10 min | ISR revalidation of the hub and public asset pages after a published run |

**The forecasting engine (worker module `engine/`):** its interface is
`forecast(asset, bars) -> {horizon: (low, mid, high, p_up)}`. Build it in
`trading-desk/` like any other strategy, under its rules. It's tested
walk-forward, it's scored only on data after `generated_at`, and per
CLAUDE.md the `trading-desk-method` skill is read before any accuracy
number is published. The page shows `forecast_outcomes`, not a claim.
v1 can be deliberately simple: quantiles of historical forward returns,
conditioned on the signal composite. Only the out-of-sample record decides
whether it's worth more.

## The parts that bite

- **Time zones:** bars are stored by open time in UTC. The daily close is
  00:00 UTC for crypto, the forex daily close is 17:00 New York (it moves
  with DST), and stock sessions follow exchange calendars
  (`exchange_calendars`). Display everything in `profiles.timezone`. The
  forecast tables say "next 14 sessions" for markets that close.
- **Idempotency:** Stripe and RevenueCat retry webhooks, so `webhook_events`
  `unique (provider, event_id)` makes a redelivery do nothing. Worker jobs
  upsert on natural keys, and `alert_events.dedupe_key` stops double sends.
  Checkout requests carry an idempotency key.
- **Races:** a reader must never see a table that mixes two runs. The
  partial unique index allows one running run, publishing is a single
  transaction, and readers filter `status='published'`. Each alert fires
  with
  `update alerts set armed=false, last_fired_at=now() where id=$1 and armed returning`,
  so only one worker pass wins. Alerts re-arm only once the condition is
  false again (hysteresis) and the cooldown has passed, which stops
  flapping around a threshold (F05 edge).
- **Look-ahead and survivorship:** signals use closed bars only
  (`bar_ts` is the last *closed* bar). Forecasts can't be changed after
  publishing, and outcomes are scored from later bars. A delisted asset is
  set to `is_active=false`, never deleted, so its record stays in the
  accuracy stats.
- **Rate limits:** Binance market data has request-weight limits, so fetch
  the tail only, batch with `/ticker/price` (no symbol), and back off as
  `core/binance_data._get` already does. CoinPaprika's free tier is limited
  too, so cross-check once a minute in one batch. Our own API needs
  per-user and per-IP limits (Upstash ratelimit) and a cap on `per_page`,
  or someone scrapes your forecasts the way you're not scraping BeCoin's.
- **Search:** a `pg_trgm` GIN index on name + ticker covers about 200
  assets. No search service needed.
- **Realtime:** quotes change every 60 s, so client polling every 30 s
  through CDN-cached GETs (`s-maxage=30, stale-while-revalidate`) is enough.
  Skip websockets in v1.
- **Offline (mobile):** cache the last watchlist, signal feed and asset
  payloads (TanStack Query persisted to MMKV), and show them with the
  "as of" time when offline.
- **Email deliverability:** use a separate sending subdomain
  (`alerts.yourdomain`) with SPF, DKIM and DMARC. Batch an alert storm into
  a digest past N events per hour. Every alert email needs a one-click
  unsubscribe.
- **Multi-tenancy:** none. It's a single-tenant B2C app.
- **GDPR deletion:** `DELETE /api/v1/me` cancels the Stripe subscription,
  deletes the Stripe customer's personal data, and deletes the
  `auth.users` row, which cascades everything. Store subscriptions can't be
  cancelled by API, so tell the user to cancel in the App Store or Play.
- **Two billing systems:** a web subscription and an App Store subscription
  can both be active. The `user_entitlements` view takes the highest rank,
  and the paywall in the app hides IAP when a web plan is already active.
  App Store rules forbid linking to web checkout from the iOS app (outside
  allowed external-link entitlements). The app can still offer sign in.
- **Data licensing:** check Binance's and CoinPaprika's terms for commercial
  redistribution of displayed prices before launch. Forex and stocks need
  paid, licensed feeds with per-user display fees; price this before adding
  those markets.
- **Regulatory copy:** a "not financial advice" disclaimer on every page,
  email and push. No personalised advice, so a signal never depends on the
  user's own holdings. Get legal advice before charging money in the UK or
  EU.

## Build order

1. **Vertical slice** (proves the stack, deliberately ugly):
   - Screens: S02 (table, crypto only, no filters), S06 (header, chart,
     forecast horizons, technical pulse 1d), S10/S11 (email sign-up),
     S13 (watchlist).
   - Tables: markets, assets, profiles, price_bars, quotes,
     signal_snapshots, indicator_values, forecast_runs, forecasts,
     watchlist_items.
   - Routes: `GET /forecasts`, `GET /assets/:slug`, `/bars`, `/forecast`,
     `/signals`, `POST/GET/DELETE /me/watchlist`.
   - Worker: `ingest_quotes`, `ingest_bars` (1d + 1h), `compute_signals`,
     a placeholder `run_forecasts` (quantile baseline).
   - Done when: sign up → see BTC's forecast → star it → it's on the
     watchlist with a live price.
2. **Must-haves** (`features.csv` must rows, by area):
   - **Forecast hub:** market switcher, signal filter, search, sort,
     pagination, badges and trend pills (S01, S02;
     `asset_metrics`).
   - **Asset page:** history/forecast toggle with band, all 5 pulse
     timeframes, 14-day + 4-week tables, long-term scenarios, methodology
     (S06, S08; `forecast_paths`, `scenarios`; `run_scenarios`).
   - **Auth:** Google, Apple, forgot password (S10-S12).
   - **Billing:** plans page, Stripe checkout + portal, entitlements, locked
     rows and paywall prompts (S09, S15, S16; `plans`, `plan_markets`,
     `subscriptions`, `webhook_events`; Stripe webhook).
   - **Alerts:** price + signal alerts by email (S14; `alerts`,
     `alert_events`; `deliver_notifications`).
   - **Legal:** disclaimers on every surface (S17).
   - **Mobile shell:** M01-M04, M06 against the same API (Expo, EAS
     internal builds).
3. **Should-haves:**
   - **Hub:** Investing / Day Trading tabs, column picker with saved
     preferences (S03; `table_preferences`), volatility filter, movers,
     outlook.
   - **Asset page:** monthly table, scenario + DCA calculators, range
     levels, technical summary text, crypto halving/ATH section, FAQ,
     related assets, live price page (S07), market overview + directory
     pages (S04, S05).
   - **Mobile:** push alerts (`device_tokens`), in-app subscriptions
     (RevenueCat + webhook, M05).
   - **Data:** quarantine + stale/diverged quote states.
   - **Then could-haves,** starting with the **public track-record page**
     (`forecast_outcomes`, `GET /track-record`). It's listed as a could-have
     in the CSV, but it's the best case for moving up to must-have once
     about 30 days of scored forecasts exist.
4. **Fixes from replica-entrepreneur:** empty until `/replica-entrepreneur`
   has read the reviews (Trustpilot is source 15 in the recon map).
   Priorities from the recon itself: a measured accuracy number instead of
   "68-72%", and no binary-options broker referrals.

## Verified

`schema.sql` applied cleanly to Postgres 16, with a stub for Supabase's
`auth` schema, and created 22 tables. Checked by hand:
- a profile is created on sign-up
- a Starter subscription can see crypto but not forex
- an alert over the plan's limit is refused, and so are alerts on a market
  the plan doesn't include and alerts from a user with no plan
- a signal alert without a signal fails its check constraint
- user B sees 0 of user A's watchlist rows and 0 forecast rows
- B can't add a watchlist item without a plan (RLS); A sees their own row
- a forecast with `low > mid` is rejected
- a second running forecast run is rejected
