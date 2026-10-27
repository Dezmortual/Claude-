-- A compressed copy of each price series, so a fresh server reads one small value per series instead of every row.
-- price_bars stays the store of record; a snapshot is rebuilt from it whenever new bars arrive.
create table bar_snapshots (
  asset_id uuid not null references assets(id) on delete cascade,
  timeframe text not null,
  last_ts timestamptz not null,
  data bytea not null,                  -- gzip of the packed series (src/lib/data/barcodec.ts)
  updated_at timestamptz not null default now(),
  primary key (asset_id, timeframe)
);
alter table bar_snapshots enable row level security;
