-- The research assistant: conversations, every message exactly as sent and received (thinking and tool calls
-- included, append-only, so a conversation can be continued), and spend per day against the owner's cap.
create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  last_note text,                       -- why the last answer stopped early, if it did
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ai_conversations (user_id, updated_at desc);
alter table ai_conversations enable row level security;

create table ai_messages (
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  seq int not null,
  role text not null check (role in ('user','assistant')),
  content jsonb not null,               -- the API's content blocks, unchanged
  model text,
  created_at timestamptz not null default now(),
  primary key (conversation_id, seq)
);
alter table ai_messages enable row level security;

create table ai_usage (
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  requests int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd double precision not null default 0,
  primary key (user_id, day)
);
alter table ai_usage enable row level security;

-- Research notes, one per asset.
create table asset_notes (
  user_id uuid not null references users(id) on delete cascade,
  slug text not null,
  body text not null check (length(body) <= 10000),
  updated_at timestamptz not null default now(),
  primary key (user_id, slug)
);
alter table asset_notes enable row level security;

-- Exits for a holding: trailing stops and one-cancels-the-other (target plus stop) sells.
alter table trade_log drop constraint trade_log_order_type_check;
alter table trade_log add constraint trade_log_order_type_check check (order_type in ('market','limit','trailing','oco'));
alter table trade_log add column trail_pct double precision;
