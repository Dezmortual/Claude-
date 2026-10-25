-- Economic series (FRED, World Bank) and prediction-market odds (Polymarket), cached so pages don't refetch them.
create table macro_cache (
  key text primary key,                 -- e.g. fred:UNRATE, wb:FP.CPI.TOTL.ZG, polymarket:top
  fetched_at timestamptz not null default now(),
  data jsonb not null
);
alter table macro_cache enable row level security;

alter table users add column macro_pins text[] not null default '{}';
