-- Your own indicators: formulas for up to three plotted lines and optional buy and sell rules (src/lib/indicators).
create table user_indicators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  lines text[] not null check (cardinality(lines) between 1 and 3),
  display text not null check (display in ('overlay','pane')),
  buy_rule text check (char_length(buy_rule) <= 300),
  sell_rule text check (char_length(sell_rule) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on user_indicators (user_id);
alter table user_indicators enable row level security;

-- Alerts can fire when one of your indicators gives a buy or sell signal.
alter table alerts add column indicator_id uuid references user_indicators(id) on delete cascade;
create index on alerts (indicator_id) where indicator_id is not null;
alter table alerts drop constraint alerts_condition_check;
alter table alerts add constraint alerts_condition_check
  check (condition in ('price_above','price_below','signal_becomes','forecast_move_above','indicator_signal'));
alter table alerts drop constraint alerts_check;
alter table alerts add constraint alerts_check check (
  (condition in ('price_above','price_below','forecast_move_above') and threshold is not null and threshold > 0)
  or (condition = 'signal_becomes' and signal is not null and timeframe is not null)
  or (condition = 'indicator_signal' and indicator_id is not null and signal in ('buy','sell') and timeframe is not null)
);
