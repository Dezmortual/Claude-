-- Web push: one row per browser or installed app that turned notifications on. Alert events track push delivery
-- separately from email, since an alert can use either channel or both.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index on push_subscriptions (user_id);
alter table push_subscriptions enable row level security;

alter table alert_events add column push_status text not null default 'skipped'
  check (push_status in ('pending','sent','failed','skipped'));
create index on alert_events (push_status) where push_status = 'pending';
