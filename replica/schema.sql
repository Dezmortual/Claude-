-- Chart Desk schema (SQLite). Single user: no owner columns, access is checked
-- once at the edge (DESK_TOKEN) in server.py. Times are integer epoch
-- milliseconds, UTC. Prices are REAL: this is a charting tool, not a ledger.
pragma foreign_keys = on;
pragma journal_mode = wal;

create table symbols (
  id          text primary key,                 -- 'binance:SOLUSDT', 'alpaca:SPY'
  feed        text not null check (feed in ('binance','alpaca','gemini')),
  ticker      text not null,
  asset_class text not null check (asset_class in ('crypto','stock','etf','index')),
  tick_size   real not null default 0.01,
  timezone    text not null default 'UTC',      -- exchange tz, for daily bars and sessions
  session     text,                             -- '0930-1600' for US stocks, null = 24/7
  created_at  integer not null default (cast((julianday('now') - 2440587.5) * 86400000 as integer)),
  unique (feed, ticker)
);

-- A cache, rebuilt from the feeds at any time. Never filled from TradingView.
create table bars (
  symbol_id text not null references symbols(id) on delete cascade,
  interval  text not null check (interval in ('1m','5m','15m','1h','4h','1d','1w')),
  t         integer not null,                   -- bar open time, ms UTC
  o real not null, h real not null, l real not null, c real not null,
  v real not null default 0,
  closed    integer not null default 1 check (closed in (0,1)),
  primary key (symbol_id, interval, t)
) without rowid;

create table layouts (
  id         text primary key,
  name       text not null unique,
  grid       text not null default '1x1' check (grid in ('1x1','1x2','2x1','2x2','3x3','4x4')),
  sync       text not null default '{"symbol":false,"interval":false,"crosshair":true,"time":false}',
  autosave   integer not null default 1,
  created_at integer not null default (cast((julianday('now') - 2440587.5) * 86400000 as integer)),
  updated_at integer not null default (cast((julianday('now') - 2440587.5) * 86400000 as integer))
);

create table charts (
  id          text primary key,
  layout_id   text not null references layouts(id) on delete cascade,
  position    integer not null,
  symbol_id   text not null references symbols(id) on delete restrict,
  interval    text not null default '1h',
  chart_type  text not null default 'candles'
              check (chart_type in ('candles','hollow','heikin_ashi','bars','line','area')),
  scale_mode  text not null default 'linear' check (scale_mode in ('linear','log','percent')),
  style       text not null default '{}',
  unique (layout_id, position)
);
create index charts_symbol on charts(symbol_id);

create table studies (
  id                text primary key,
  chart_id          text not null references charts(id) on delete cascade,
  indicator_key     text not null,              -- 'sma', 'rsi', 'donchian', 'sweep'
  inputs            text not null default '{}',
  style             text not null default '{}',
  pane              integer not null default 0, -- 0 = on price
  visible_intervals text,                       -- null = all
  created_at        integer not null default (cast((julianday('now') - 2440587.5) * 86400000 as integer))
);
create index studies_chart on studies(chart_id);

-- Drawings belong to a symbol, so they follow it across charts and layouts.
create table drawings (
  id                text primary key,
  symbol_id         text not null references symbols(id) on delete cascade,
  layout_id         text references layouts(id) on delete cascade,  -- null = every layout
  tool              text not null check (tool in ('hline','trendline','ray','rect','fib','text')),
  points            text not null,              -- json [{t, price}], 1..3 points
  style             text not null default '{}',
  locked            integer not null default 0,
  hidden            integer not null default 0,
  visible_intervals text,
  created_at        integer not null default (cast((julianday('now') - 2440587.5) * 86400000 as integer)),
  updated_at        integer not null default (cast((julianday('now') - 2440587.5) * 86400000 as integer))
);
create index drawings_symbol on drawings(symbol_id, layout_id);

create table watchlists (
  id         text primary key,
  name       text not null unique,
  created_at integer not null default (cast((julianday('now') - 2440587.5) * 86400000 as integer))
);
create table watchlist_symbols (
  watchlist_id text not null references watchlists(id) on delete cascade,
  symbol_id    text not null references symbols(id) on delete cascade,
  position     integer not null,
  flag         text,
  primary key (watchlist_id, symbol_id)
) without rowid;
create index watchlist_symbols_symbol on watchlist_symbols(symbol_id);

create table alerts (
  id               text primary key,
  name             text not null,
  symbol_id        text references symbols(id) on delete cascade,
  watchlist_id     text references watchlists(id) on delete cascade,
  interval         text not null default '1h',
  -- json array, 1..5, all must hold (AND):
  -- {source:'price'|'study'|'drawing', ref:<study or drawing id>, field:'plot_0',
  --  op:'crossing'|'crossing_up'|'crossing_down'|'greater'|'less'|
  --     'entering_channel'|'exiting_channel', value:<number> | {ref, field}}
  conditions       text not null,
  trigger          text not null default 'once_per_bar_close'
                   check (trigger in ('only_once','once_per_bar','once_per_bar_close','once_per_minute')),
  expires_at       integer,                     -- null = open-ended
  message_template text not null default '{{ticker}} {{close}}',
  notify           text not null default '{"toast":true,"sound":true}',  -- + webhook_url, telegram
  status           text not null default 'active'
                   check (status in ('active','stopped','triggered','expired')),
  last_fired_bar   integer,                     -- dedupe key for once-per-bar triggers
  last_fired_at    integer,
  created_at       integer not null default (cast((julianday('now') - 2440587.5) * 86400000 as integer)),
  updated_at       integer not null default (cast((julianday('now') - 2440587.5) * 86400000 as integer)),
  check ((symbol_id is null) <> (watchlist_id is null))
);
create index alerts_active on alerts(status, symbol_id);
create index alerts_watchlist on alerts(watchlist_id);

create table alert_events (
  id             text primary key,
  alert_id       text not null references alerts(id) on delete cascade,
  symbol_id      text not null references symbols(id) on delete cascade,
  bar_t          integer not null,
  fired_at       integer not null,
  price          real not null,
  message        text not null,
  webhook_status integer,                       -- http status, null = not sent
  -- the worker may evaluate the same closed bar twice after a restart
  unique (alert_id, symbol_id, bar_t)
);
create index alert_events_time on alert_events(fired_at desc);
