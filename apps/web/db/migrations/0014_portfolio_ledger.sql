-- The portfolio ledger beyond purchases (which stay in holdings): sales, dividends, fees, and fills imported from
-- the broker. Plus target weights for rebalancing, limits on concentration, and the benchmark to compare against.
create table portfolio_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  kind text not null check (kind in ('buy','sell','dividend','fee')),
  quantity double precision check (quantity > 0),        -- buys and sells
  price double precision check (price > 0),              -- per unit, buys and sells
  amount double precision check (amount >= 0),           -- dividends and fees, in USD; the fee on a buy or sell
  happened_on date not null,
  note text check (char_length(note) <= 120),
  source text not null default 'manual' check (source in ('manual','alpaca')),
  external_id text,                                      -- the broker's activity id, so an import never doubles up
  created_at timestamptz not null default now(),
  check ((kind in ('buy','sell') and quantity is not null and price is not null) or (kind in ('dividend','fee') and amount is not null))
);
create index on portfolio_entries (user_id, happened_on);
create unique index on portfolio_entries (user_id, external_id) where external_id is not null;
alter table portfolio_entries enable row level security;

create table portfolio_targets (
  user_id uuid not null references users(id) on delete cascade,
  slug text not null,
  weight double precision not null check (weight > 0 and weight <= 100),
  primary key (user_id, slug)
);
alter table portfolio_targets enable row level security;

create table portfolio_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('max_holding','max_market')),
  target text not null,                                  -- a slug, 'any' for every holding, or a market code
  pct double precision not null check (pct > 0 and pct <= 100),
  created_at timestamptz not null default now()
);
create index on portfolio_limits (user_id);
alter table portfolio_limits enable row level security;

alter table users add column benchmark_slug text;
