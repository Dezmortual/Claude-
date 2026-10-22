-- Portfolio: what the owner holds, one row per purchase (lot). Quantity is in the asset's own unit: coins, shares,
-- or fund shares for the stand-in funds (catalogue PROXIES).
create table holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  quantity double precision not null check (quantity > 0),
  cost_price double precision check (cost_price > 0),   -- per unit, in the asset's quote currency (USD here)
  bought_on date,
  note text check (char_length(note) <= 120),
  created_at timestamptz not null default now()
);
create index on holdings (user_id);
alter table holdings enable row level security;

-- Data health: one row per problem (a price source failing, the scheduler stopping), opened when first seen and
-- closed when it clears, so the owner is told once when it starts and once when it ends.
create table health_incidents (
  id uuid primary key default gen_random_uuid(),
  key text not null,                 -- e.g. source:twelvedata, scheduler
  detail text not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index one_open_incident on health_incidents (key) where resolved_at is null;
create index on health_incidents (started_at desc);
