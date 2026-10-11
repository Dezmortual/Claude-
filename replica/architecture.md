# Architecture: Chart Desk (a rebuild of TradingView's charts and alerts)

For one person. It sits next to `trading-desk/` and reuses its data loaders,
its Python indicator ports and its Oracle Cloud deploy. The stack follows what
the repo already runs instead of the default Next.js + Supabase stack: there are
no users to sign up, no payments and no team, and `dashboard/server.py` already
proves a server with no pip installs works here.

Two front ends, one plan:

- **Chart Desk app** (`trading-desk/chartdesk/`): the full clone, self-hosted,
  alerts evaluated 24/7 by a worker. This is what the build order below
  delivers.
- **Chart Desk artifact** (published on claude.ai): a dashboard you can open
  today. Live crypto candles come from your Gemini connector, alerts are stored
  in the artifact's database, and they are checked while the page is open. It
  doubles as the vertical slice's UI prototype.

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | one static page: vanilla JS + TradingView Lightweight Charts 4.2 (Apache 2.0, attribution kept) | the chart engine is the hard 80% and it is free and open source; no build step, same as `dashboard/index.html` |
| server | Python 3.11 standard library `http.server`, JSON routes + Server-Sent Events | the pattern `dashboard/server.py` already uses; runs in the existing python:3.11-slim image |
| database | SQLite in WAL mode, `state/chartdesk.db` (`replica/schema.sql`) | one user, one machine; a file you can back up with `cp` |
| data | Binance public klines (`core/binance_data.py`, no key) and Alpaca bars (`core/data.py`, keys in `.env`) | already in the repo; TradingView's data is display-only and not used |
| indicators | Python, one module per indicator in `chartdesk/indicators/`, wrapping `core/features.py` and the Donchian and Sweep ports | the same code computes the chart overlays and the alert conditions, so a chart and its alert never disagree |
| auth | none on localhost; one `DESK_TOKEN` bearer token when deployed | single user; a login system would be the biggest file in the project |
| payments | none | personal use |
| notifications | in-app toast + sound over SSE, a generic webhook, Telegram Bot API (your bot token) | Telegram is the cheapest phone push for one person |
| jobs | `chartdesk/worker.py`, one long-running process: polls closed bars every 15 s, evaluates alerts | stdlib has no websocket client; 15 s polling of public REST is well inside rate limits and makes "once per bar close" exact |
| hosting | the Oracle Cloud VM in `deploy/`, as two more services in `docker-compose.yml` | already provisioned and paid for (free tier) |

## Schema

Tables: 10 (`symbols`, `bars`, `layouts`, `charts`, `studies`, `drawings`,
`watchlists`, `watchlist_symbols`, `alerts`, `alert_events`). Full SQL in
`replica/schema.sql`. Access rules: one check at the edge, since there is one
user: every route except `/healthz` requires `Authorization: Bearer
$DESK_TOKEN` when `DESK_TOKEN` is set. No row-level rules.

Deviations from the skill's defaults, on purpose: SQLite instead of Postgres,
text ids (`uuid4().hex`) instead of `gen_random_uuid()`, epoch milliseconds
instead of `timestamptz` (still UTC, and what both feeds and Lightweight Charts
speak), no owner columns.

Hard constraints the recon found, enforced in the database:

- an alert targets a symbol **or** a watchlist, never both (`check`)
- one event per alert per symbol per bar (`unique (alert_id, symbol_id,
  bar_t)`), so a worker restart cannot fire the same bar twice
- drawings belong to a symbol and cascade with it; deleting a drawing that an
  alert references stops that alert (done in the data layer, since the
  reference lives inside `conditions` json)

## API

All JSON. `who` is always "you" (token when deployed).

| method path | does | input | output | flow |
| --- | --- | --- | --- | --- |
| GET /api/symbols?q= | search symbols across feeds | q | [symbol] | F01 |
| GET /api/bars?symbol&interval&before&limit | history, oldest first; fetches and caches missing bars | query | [bar] | F01 |
| GET /api/stream?symbols&interval | SSE: live last bar per symbol, alert fires | query | events `bar`, `alert` | F01, F04 |
| GET /api/indicators | list of indicators with input schema | | [indicator] | F02 |
| POST /api/indicators/:key/compute | compute series for a chart | symbol, interval, inputs | {plots:{name:[t,v]}} | F02 |
| GET/PUT /api/layouts/:id | load or autosave a layout with charts and studies | layout json | layout | F07 |
| GET /api/layouts, POST /api/layouts, DELETE /api/layouts/:id | list, create, delete | | | F07 |
| GET /api/drawings?symbol&layout | drawings for a symbol | | [drawing] | F03 |
| POST /api/drawings, PATCH/DELETE /api/drawings/:id | create, move/restyle, delete | drawing | drawing | F03 |
| GET /api/watchlists, PUT /api/watchlists/:id | lists and their symbols with last price | | | F09 |
| GET /api/alerts?status | alerts manager list | | [alert] | F06 |
| POST /api/alerts | create; validates conditions against the study or drawing | alert | alert | F03, F04, F05 |
| PATCH /api/alerts/:id | edit, stop, resume (resume re-arms a triggered only-once alert) | fields | alert | F06 |
| DELETE /api/alerts/:id | delete | | 204 | F06 |
| GET /api/alerts/log?limit&before | alerts log | | [event] | F06 |
| GET /api/alerts/log.csv | export | | text/csv | F06 |
| POST /api/alerts/:id/test | send a test notification | | delivery result | F04 |
| GET /healthz | liveness | | ok | |

Webhooks in: none. Webhooks out: each alert's `webhook_url`, POST with the
rendered message as JSON `{alert, ticker, close, bar_time, message}`; Telegram
`sendMessage` with your bot token.

Jobs:

- `worker` (always on): every 15 s, for each symbol with an active alert, fetch
  bars since the last seen bar, recompute only the studies those alerts use,
  evaluate conditions, write `alert_events`, notify, push an SSE `alert` event.
- `expire` (inside the worker, every minute): mark alerts past `expires_at` as
  `expired`.
- `cache-trim` (daily): drop 1m bars older than 30 days.

## The parts that bite

- **time zones**: store UTC ms everywhere. Daily bars for US stocks are built in
  America/New_York, crypto in UTC; the chart's display timezone is a setting
  only. DST shifts the stock session open by an hour in UTC twice a year.
- **once per bar close vs intrabar**: the worker evaluates closed bars for
  `once_per_bar_close` and the forming bar (last price) for the others. An
  indicator computed on a forming bar repaints; the UI says so on any alert not
  set to bar close.
- **idempotency**: the `unique` key on `alert_events` plus `last_fired_bar` on
  the alert. Webhooks out can be delivered twice after a crash; the payload
  carries `bar_time` so the receiver can dedupe.
- **races**: the browser and the worker both write `alerts` (edit vs fire).
  Single SQLite writer with `busy_timeout`; the worker updates only `status`,
  `last_fired_*`; the UI never writes those.
- **alerts on drawings**: a moved line changes the alert's level. Conditions
  reference the drawing id, not a copied price, and the worker reads the line's
  current points each cycle. A trendline's level is interpolated at the bar's
  time.
- **gaps**: after downtime the worker backfills bars and evaluates each missed
  closed bar in order, but notifies only for the last N (default 3) so you do
  not get forty pings after a reboot.
- **rate limits**: Binance REST weight is 1200/min; 15 s polling of 50 symbols
  is 200/min. Alpaca free tier is 200 req/min: batch symbols per request.
- **realtime**: SSE from server to browser, polling from server to feeds. No
  websockets anywhere, no client library.
- **bar replay**: the replay clock lives in the browser; the server never sees
  it, so alerts cannot fire on replayed bars.

## Build order

1. **Vertical slice** (S01, S11, S12, S14; `symbols`, `bars`, `alerts`,
   `alert_events`; `/api/bars`, `/api/stream`, `/api/alerts*`, worker): one
   chart of SOLUSDT on 1h, a horizontal-line price alert, the worker fires it,
   a toast and a Telegram message arrive. The Chart Desk artifact already
   covers the UI half of this.
2. **Must-haves**: symbol search and Alpaca stocks (S02), intervals (S03),
   built-in + Donchian/Sweep indicators with settings (S05, S06), trendline and
   drawing editing (S07), indicator alerts with the trigger options, alerts log
   (S13). Tables `studies`, `drawings`.
3. **Should-haves**: watchlist (S10), 2x2 layout with sync and save (S08, S09;
   `layouts`, `charts`, `watchlists`), Heikin Ashi, log scale, more drawing
   tools, magnet, object tree, expiration, placeholders, CSV export, bar replay
   (S15), data window (S17). Then could-haves: multi-condition and watchlist
   alerts, backtest trade markers from `trading-desk/`.
4. **Fixes from replica-entrepreneur**: none yet. For personal use, run it
   only if you want to know what TradingView users complain about before
   building.
