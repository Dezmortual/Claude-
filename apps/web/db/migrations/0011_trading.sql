-- Trading through the owner's broker (Alpaca). The broker is the record of positions and fills; this is the app's
-- own log of every order it sent, kept even if the broker's history is trimmed.
create table trade_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  client_order_id uuid not null unique,     -- sent to the broker: a repeated submit can't create a second order
  broker_order_id text,
  mode text not null check (mode in ('paper','live')),
  slug text not null,
  symbol text not null,
  side text not null check (side in ('buy','sell')),
  order_type text not null check (order_type in ('market','limit')),
  notional double precision check (notional > 0),
  qty double precision check (qty > 0),
  limit_price double precision,
  stop_loss double precision,
  take_profit double precision,
  status text not null,                     -- the broker's status at submission, or 'rejected'
  error text,
  created_at timestamptz not null default now()
);
create index on trade_log (user_id, created_at desc);
alter table trade_log enable row level security;

-- The largest single order the app will send, in dollars.
alter table users add column max_order_usd double precision not null default 1000 check (max_order_usd > 0);
