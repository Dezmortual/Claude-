-- 0001_init: the forecast app's database. Plain Postgres 15+ (Supabase, Neon or self-hosted).
-- Adapted from replica/schema.sql for a private, single-owner build:
--   * users and sessions live here (no dependency on a hosted auth service)
--   * every table has RLS enabled and NO policies: the app connects as the table owner and authorises each query
--     in the data layer (src/lib/data/live.ts). On Supabase this also closes the auto-generated REST API to anon users.
-- Times are timestamptz (UTC). Money is integer cents.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------- users and auth

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and position('@' in email) > 1),
  name text not null check (length(name) between 1 and 80),
  password_hash text not null,                 -- scrypt$N$salt$hash
  email_verified_at timestamptz,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,             -- sha256 of the cookie value; the raw token is never stored
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index on sessions (user_id);
create index on sessions (expires_at);

create table email_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null check (purpose in ('verify', 'reset')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on email_tokens (user_id, purpose);

-- Fixed-window counters for sign-in, sign-up and anything that sends email.
create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
create index on rate_limits (window_start);

-- ---------------------------------------------------------------- catalogue

create table markets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('crypto','forex','stocks','commodities','indices','etfs','bonds')),
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete restrict,
  slug text not null unique,
  ticker text not null,
  name text not null,
  source text not null check (source in ('binance','frankfurter','alpaca','demo')),
  source_symbol text,                           -- 'BTCUSDT', 'EUR/USD', 'AAPL'
  is_public boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on assets (market_id);
create index assets_search on assets using gin ((name || ' ' || ticker) gin_trgm_ops);

-- Kept for a future paid build; the private build grants the owner everything without a subscription.
create table plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_month_cents int not null check (price_month_cents >= 0),
  price_year_cents int not null check (price_year_cents >= 0),
  currency text not null default 'usd',
  rank int not null,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  plan_id uuid not null references plans(id) on delete restrict,
  provider text not null check (provider in ('stripe','app_store','play_store','manual')),
  provider_ref text not null,
  interval text not null check (interval in ('month','year')),
  status text not null check (status in ('trialing','active','past_due','canceled','expired','incomplete')),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index on subscriptions (user_id, status);

-- ---------------------------------------------------------------- market data

create table price_bars (
  asset_id uuid not null references assets(id) on delete cascade,
  timeframe text not null check (timeframe in ('5m','30m','1h','1d','1w')),
  ts timestamptz not null,                      -- bar OPEN time, UTC
  open double precision not null, high double precision not null,
  low double precision not null, close double precision not null,
  volume double precision,
  quarantined boolean not null default false,
  primary key (asset_id, timeframe, ts),
  check (high >= low and open > 0 and close > 0)
);

-- When each series was last fetched, so reads know whether to refresh the tail.
create table bar_fetches (
  asset_id uuid not null references assets(id) on delete cascade,
  timeframe text not null,
  fetched_at timestamptz not null,
  primary key (asset_id, timeframe)
);

-- Second-source price for the cross-check shown on asset pages.
create table crosschecks (
  asset_id uuid primary key references assets(id) on delete cascade,
  price double precision not null,
  source text not null,
  checked_at timestamptz not null
);

-- ---------------------------------------------------------------- published forecasts and their scores

create table forecast_runs (
  id uuid primary key default gen_random_uuid(),
  model_version text not null,
  started_at timestamptz not null default now(),
  published_at timestamptz,
  status text not null default 'running' check (status in ('running','published','failed')),
  notes text
);
create unique index one_running_run on forecast_runs ((true)) where status = 'running';

create table forecasts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references forecast_runs(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  horizon text not null check (horizon in ('1d','7d','1m')),
  base_price double precision not null,
  generated_at timestamptz not null,
  target_at timestamptz not null,
  low double precision not null, mid double precision not null, high double precision not null,
  p_up double precision not null check (p_up between 0 and 1),
  signal text not null check (signal in ('strong_buy','buy','neutral','sell','strong_sell')),
  unique (run_id, asset_id, horizon),
  check (low <= mid and mid <= high),
  check (target_at > generated_at)
);
create index on forecasts (target_at);
create index on forecasts (asset_id, horizon);

create table forecast_outcomes (
  forecast_id uuid primary key references forecasts(id) on delete cascade,
  realized_price double precision not null,
  realized_at timestamptz not null,
  direction_hit boolean not null,
  inside_band boolean not null,
  abs_pct_error double precision not null,
  scored_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- user-owned

create table watchlist_items (
  user_id uuid not null references users(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, asset_id)
);
create index on watchlist_items (asset_id);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  condition text not null check (condition in ('price_above','price_below','signal_becomes','forecast_move_above')),
  threshold double precision,
  signal text check (signal in ('strong_buy','buy','neutral','sell','strong_sell')),
  timeframe text check (timeframe in ('5m','30m','1h','1d','1w')),
  channels text[] not null default '{email}' check (channels <@ array['email','push'] and cardinality(channels) > 0),
  is_active boolean not null default true,
  armed boolean not null default true,          -- re-arms only after the condition is false again
  cooldown_minutes int not null default 60 check (cooldown_minutes >= 5),
  last_fired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (condition in ('price_above','price_below','forecast_move_above') and threshold is not null and threshold > 0)
    or (condition = 'signal_becomes' and signal is not null and timeframe is not null)
  )
);
create index on alerts (user_id);
create index on alerts (asset_id) where is_active;

create table alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references alerts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  fired_at timestamptz not null default now(),
  message text not null,
  email_status text not null default 'pending' check (email_status in ('pending','sent','failed','skipped')),
  attempts int not null default 0,
  last_error text,
  dedupe_key text not null unique
);
create index on alert_events (user_id, fired_at desc);
create index on alert_events (email_status) where email_status in ('pending','failed');

create table table_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  visible_columns text[] not null,
  rows_per_page int not null default 20 check (rows_per_page in (10,20,50,100)),
  default_tab text not null default 'investing' check (default_tab in ('investing','day_trading')),
  updated_at timestamptz not null default now()
);

create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  platform text not null check (platform in ('ios','android')),
  expo_token text not null unique,
  last_seen_at timestamptz not null default now()
);
create index on device_tokens (user_id);

-- Every scheduled job run; failures stay here as the dead-letter log.
create table job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','ok','failed')),
  detail jsonb not null default '{}'
);
create index on job_runs (job, started_at desc);

-- ---------------------------------------------------------------- triggers, RLS

create trigger users_updated before update on users for each row execute function set_updated_at();
create trigger assets_updated before update on assets for each row execute function set_updated_at();
create trigger subscriptions_updated before update on subscriptions for each row execute function set_updated_at();
create trigger alerts_updated before update on alerts for each row execute function set_updated_at();

do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
  -- Supabase's API roles get nothing, even if a policy is added by mistake later.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
  end if;
end $$;

insert into markets (code, name, sort) values
  ('crypto','Crypto',1),('forex','Forex',2),('stocks','Stocks',3),('commodities','Commodities',4),
  ('indices','Indices',5),('etfs','ETFs',6),('bonds','Bonds & yields',7);
