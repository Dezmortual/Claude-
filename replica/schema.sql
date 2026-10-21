-- replica/schema.sql : first migration for the forecast-signals clone.
-- Postgres 15+ on Supabase. All times timestamptz in UTC. Money in integer cents.
-- Access: RLS on every table. User-owned tables: owner-only policies.
-- Market-data tables: no anon/authenticated policies at all; the Next.js data
-- layer and the Python worker read/write them with the service role, and the
-- data layer runs one entitlement check per query (see architecture.md).

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create or replace function set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------- catalogue

create table markets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code in ('crypto','forex','stocks','commodities','indices','etfs','bonds')),
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete restrict,
  slug text not null unique,                 -- 'bitcoin', 'eurusd'
  ticker text not null,                      -- 'BTC', 'EUR/USD'
  name text not null,
  quote_unit text not null default 'USD',    -- 'USD per share', 'USD per EUR'
  base_ccy text, quote_ccy text,             -- forex only
  primary_source text not null,              -- 'binance:BTCUSDT'
  crosscheck_source text,                    -- 'coinpaprika:btc-bitcoin'
  logo_path text,                            -- own/licensed icon set only
  is_public boolean not null default false,  -- guest-visible SEO asset pages
  is_active boolean not null default true,
  meta jsonb not null default '{}',          -- max_supply, halving data, etc.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on assets (market_id);
create index on assets (is_active, market_id);
create index assets_search on assets using gin ((name || ' ' || ticker) gin_trgm_ops);

-- ---------------------------------------------------------------- plans & billing

create table plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- 'day_trader','starter','pro','unlimited'
  name text not null,
  price_month_cents int not null check (price_month_cents >= 0),
  price_year_cents int not null check (price_year_cents >= 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  stripe_price_month text, stripe_price_year text,
  store_product_ids jsonb not null default '{}',   -- {"ios": "...", "android": "..."}
  has_investing_tab boolean not null default false,
  has_watchlist_alerts boolean not null default false,
  max_alerts int,                            -- null = unlimited
  rank int not null,                         -- higher plan wins when several active
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table plan_markets (
  plan_id uuid not null references plans(id) on delete cascade,
  market_id uuid not null references markets(id) on delete cascade,
  primary key (plan_id, market_id)
);
create index on plan_markets (market_id);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,  -- GDPR: delete user, everything goes
  full_name text,
  timezone text not null default 'UTC',
  locale text not null default 'en',
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan_id uuid not null references plans(id) on delete restrict,
  provider text not null check (provider in ('stripe','app_store','play_store','manual')),
  provider_ref text not null,                -- stripe sub id / store original transaction id
  interval text not null check (interval in ('month','year')),
  status text not null
    check (status in ('trialing','active','past_due','canceled','expired','incomplete')),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index on subscriptions (user_id, status);
create index on subscriptions (plan_id);

-- Every inbound webhook, so a redelivery is a no-op.
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe','revenuecat')),
  event_id text not null,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- ---------------------------------------------------------------- market data (worker-written)

create table price_bars (
  asset_id uuid not null references assets(id) on delete cascade,
  timeframe text not null check (timeframe in ('5m','30m','1h','1d','1w')),
  ts timestamptz not null,                   -- bar OPEN time, UTC
  open numeric not null, high numeric not null, low numeric not null, close numeric not null,
  volume numeric,
  source text not null,
  quarantined boolean not null default false,
  quarantine_reason text,
  primary key (asset_id, timeframe, ts),
  check (high >= low)
);
-- PK covers (asset_id, timeframe, ts) lookups and range scans.

create table quotes (                        -- latest only, one row per asset
  asset_id uuid primary key references assets(id) on delete cascade,
  price numeric not null,
  change_24h_pct numeric,
  market_cap_cents bigint, volume_24h_cents bigint,
  observed_at timestamptz not null,
  checked_at timestamptz,
  crosscheck_price numeric,
  spread_pct numeric,
  status text not null default 'ok' check (status in ('ok','stale','diverged')),
  updated_at timestamptz not null default now()
);
create index on quotes (status);

create table asset_metrics (                 -- latest only, drives table columns
  asset_id uuid primary key references assets(id) on delete cascade,
  as_of timestamptz not null,
  macd_signal text check (macd_signal in ('bullish','bearish','neutral')),
  ma_cross text check (ma_cross in ('golden','death','none')),
  ma200_trend text check (ma200_trend in ('up','down','flat')),
  pct_from_ma200 numeric,
  volatility_pct numeric,
  volatility_label text check (volatility_label in ('low','medium','high')),
  sharpe numeric,
  dividend_yield_pct numeric,
  range jsonb not null default '{}',         -- {"d20":{"hi":..,"lo":..},"d90":{...}}
  updated_at timestamptz not null default now()
);
create index on asset_metrics (volatility_label);

-- ---------------------------------------------------------------- forecasts (append-only, immutable once published)

create table forecast_runs (
  id uuid primary key default gen_random_uuid(),
  model_version text not null,               -- git sha of the worker
  started_at timestamptz not null default now(),
  published_at timestamptz,                  -- null until every asset is written
  status text not null default 'running' check (status in ('running','published','failed')),
  notes text,
  created_at timestamptz not null default now()
);
create unique index one_running_run on forecast_runs ((true)) where status = 'running';
create index on forecast_runs (published_at desc) where status = 'published';

create table forecasts (                     -- one row per asset x horizon x run
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references forecast_runs(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  horizon text not null check (horizon in ('1d','7d','1m','1y','5y','10y')),
  kind text not null check (kind in ('forecast','scenario')),  -- 1y+ are scenarios, labelled as such
  base_price numeric not null,               -- price at generated_at
  generated_at timestamptz not null,
  target_at timestamptz not null,
  low numeric not null, mid numeric not null, high numeric not null,
  band_level numeric not null default 0.8,   -- nominal coverage of low..high
  p_up numeric check (p_up between 0 and 1), -- null for scenarios
  signal text check (signal in ('strong_buy','buy','neutral','sell','strong_sell')),
  created_at timestamptz not null default now(),
  unique (run_id, asset_id, horizon),
  check (low <= mid and mid <= high),
  check (target_at > generated_at)
);
create index on forecasts (asset_id, horizon, generated_at desc);
create index on forecasts (run_id, signal);
create index on forecasts (target_at) where kind = 'forecast';

create table forecast_paths (                -- the 14-day / 4-week / 12-month / yearly tables
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references forecast_runs(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  granularity text not null check (granularity in ('day','week','month','year')),
  period_start timestamptz not null,
  low numeric not null, mid numeric not null, high numeric not null,
  change_pct numeric not null,
  unique (run_id, asset_id, granularity, period_start)
);
create index on forecast_paths (asset_id, granularity, run_id);

create table scenarios (                     -- long-term bear/base/bull per year + narrative
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references forecast_runs(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  bear numeric not null, base numeric not null, bull numeric not null,
  assumptions jsonb not null,                -- CAGRs used; shown on the page
  narrative text,
  unique (run_id, asset_id, year)
);
create index on scenarios (asset_id, run_id);

-- Scoring every matured forecast against what happened: the public track record.
create table forecast_outcomes (
  forecast_id uuid primary key references forecasts(id) on delete cascade,
  realized_price numeric not null,
  realized_at timestamptz not null,
  direction_hit boolean not null,            -- sign(mid - base) == sign(realized - base)
  inside_band boolean not null,
  abs_pct_error numeric not null,
  scored_at timestamptz not null default now()
);

create table signal_snapshots (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  timeframe text not null check (timeframe in ('5m','30m','1h','1d','1w')),
  computed_at timestamptz not null,
  bar_ts timestamptz not null,               -- last closed bar used; never a forming bar
  verdict text not null check (verdict in ('strong_buy','buy','neutral','sell','strong_sell','unavailable')),
  ma_buy int not null default 0, ma_neutral int not null default 0, ma_sell int not null default 0,
  osc_buy int not null default 0, osc_neutral int not null default 0, osc_sell int not null default 0,
  unique (asset_id, timeframe, bar_ts)
);
create index on signal_snapshots (asset_id, timeframe, computed_at desc);

create table indicator_values (
  snapshot_id uuid not null references signal_snapshots(id) on delete cascade,
  kind text not null check (kind in ('ma','oscillator')),
  name text not null,                        -- 'EMA 20', 'RSI 14'
  value numeric,
  signal text not null check (signal in ('buy','neutral','sell')),
  primary key (snapshot_id, name)
);

-- ---------------------------------------------------------------- user-owned

create table watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, asset_id)
);
create index on watchlist_items (asset_id);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  condition text not null
    check (condition in ('price_above','price_below','signal_becomes','forecast_move_above')),
  threshold numeric,                         -- price, or % for forecast_move_above
  signal text check (signal in ('strong_buy','buy','neutral','sell','strong_sell')),
  timeframe text check (timeframe in ('5m','30m','1h','1d','1w','1d_h','7d_h','1m_h')),
  channels text[] not null default '{email}' check (channels <@ array['email','push']),
  is_active boolean not null default true,
  armed boolean not null default true,       -- re-arms only after the condition goes false (hysteresis)
  cooldown_minutes int not null default 60 check (cooldown_minutes >= 5),
  last_fired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (condition in ('price_above','price_below','forecast_move_above') and threshold is not null)
    or (condition = 'signal_becomes' and signal is not null and timeframe is not null)
  )
);
create index on alerts (asset_id) where is_active;
create index on alerts (user_id);

create table alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references alerts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  fired_at timestamptz not null default now(),
  payload jsonb not null,
  email_status text check (email_status in ('pending','sent','failed','skipped')),
  push_status text check (push_status in ('pending','sent','failed','skipped')),
  dedupe_key text not null unique            -- alert_id + triggering quote/bar ts
);
create index on alert_events (user_id, fired_at desc);
create index on alert_events (alert_id);
create index on alert_events (fired_at) where email_status = 'pending' or push_status = 'pending';

create table table_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  visible_columns text[] not null,
  rows_per_page int not null default 20 check (rows_per_page in (10,20,50,100)),
  default_tab text not null default 'investing' check (default_tab in ('investing','day_trading')),
  updated_at timestamptz not null default now()
);

create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null check (platform in ('ios','android')),
  expo_token text not null unique,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on device_tokens (user_id);

-- ---------------------------------------------------------------- triggers

do $$ declare t text; begin
  foreach t in array array['markets','assets','plans','profiles','subscriptions',
                           'watchlist_items','alerts'] loop
    execute format('create trigger %I_updated before update on %I
                    for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- Profile row on sign-up.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------- entitlements

-- The single source of truth for "may this user see this market".
-- Highest-ranked active subscription wins; web (Stripe) and store purchases land in one table.
create or replace view user_entitlements as
select distinct on (s.user_id)
  s.user_id, p.id as plan_id, p.code as plan_code, p.has_investing_tab,
  p.has_watchlist_alerts, p.max_alerts, s.current_period_end
from subscriptions s join plans p on p.id = s.plan_id
where s.status in ('trialing','active','past_due') and s.current_period_end > now()
order by s.user_id, p.rank desc;

create or replace function can_see_market(uid uuid, mkt uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_entitlements e join plan_markets pm on pm.plan_id = e.plan_id
    where e.user_id = uid and pm.market_id = mkt)
$$;

-- Alert limit, enforced in the database, not just the UI.
create or replace function enforce_alert_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; ok boolean;
begin
  select max_alerts, has_watchlist_alerts into lim, ok from user_entitlements where user_id = new.user_id;
  if not coalesce(ok, false) then raise exception 'plan does not include alerts'; end if;
  if not can_see_market(new.user_id, (select market_id from assets where id = new.asset_id)) then
    raise exception 'plan does not include this market';
  end if;
  if lim is not null and (select count(*) from alerts where user_id = new.user_id and is_active) >= lim then
    raise exception 'alert limit reached';
  end if;
  return new;
end $$;
create trigger alerts_limit before insert on alerts
  for each row execute function enforce_alert_limit();

-- ---------------------------------------------------------------- RLS

alter table markets enable row level security;
alter table assets enable row level security;
alter table plans enable row level security;
alter table plan_markets enable row level security;
alter table profiles enable row level security;
alter table subscriptions enable row level security;
alter table webhook_events enable row level security;
alter table price_bars enable row level security;
alter table quotes enable row level security;
alter table asset_metrics enable row level security;
alter table forecast_runs enable row level security;
alter table forecasts enable row level security;
alter table forecast_paths enable row level security;
alter table scenarios enable row level security;
alter table forecast_outcomes enable row level security;
alter table signal_snapshots enable row level security;
alter table indicator_values enable row level security;
alter table watchlist_items enable row level security;
alter table alerts enable row level security;
alter table alert_events enable row level security;
alter table table_preferences enable row level security;
alter table device_tokens enable row level security;

-- Catalogue: readable by anyone (it is the public site map).
create policy read_markets on markets for select using (true);
create policy read_assets on assets for select using (is_active);
create policy read_plans on plans for select using (is_active);
create policy read_plan_markets on plan_markets for select using (true);

-- Own rows only.
create policy own_profile on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy own_subs_read on subscriptions for select using (user_id = auth.uid());   -- writes: webhooks only
create policy own_watchlist on watchlist_items for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from user_entitlements e where e.user_id = auth.uid() and e.has_watchlist_alerts));
create policy own_alerts on alerts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_alert_events on alert_events for select using (user_id = auth.uid());
create policy own_prefs on table_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_devices on device_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Market-data tables, webhook_events, forecast_runs: no policies = no client access.
-- Service role (data layer + worker) bypasses RLS and applies can_see_market() per query.

-- ---------------------------------------------------------------- seed

insert into markets (code, name, sort) values
  ('crypto','Crypto',1),('forex','Forex',2),('stocks','Stocks',3),('commodities','Commodities',4),
  ('indices','Indices',5),('etfs','ETFs',6),('bonds','Bonds & Yields',7);
-- Plans and prices are set in /replica-launch; codes only here.
