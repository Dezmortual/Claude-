-- The backtest lab: saved strategies (every edit kept as a version) and stored runs.
create table strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  notes text not null default '' check (length(notes) <= 2000),
  spec jsonb not null,                  -- the lab form: rules, params, side, stops, costs, default asset
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index on strategies (user_id, lower(name));
alter table strategies enable row level security;

create table strategy_versions (
  strategy_id uuid not null references strategies(id) on delete cascade,
  version int not null,
  spec jsonb not null,
  created_at timestamptz not null default now(),
  primary key (strategy_id, version)
);
alter table strategy_versions enable row level security;

create table backtest_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  strategy_id uuid references strategies(id) on delete set null,
  name text not null,
  family text not null,                 -- runs of the same idea, whose tries are counted together
  kind text not null check (kind in ('run','sweep')),
  slug text not null,
  timeframe text not null check (timeframe in ('1d','1w')),
  spec jsonb not null,
  summary jsonb not null,               -- metrics, the luck test, tries so far
  equity jsonb not null,                -- thinned curves: strategy and buy-and-hold
  trades jsonb not null,
  sweep jsonb,                          -- best rows, walk-forward folds, out-of-sample curve
  trials int not null check (trials > 0),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index on backtest_runs (user_id, pinned desc, created_at desc);
create index on backtest_runs (user_id, family);
alter table backtest_runs enable row level security;
