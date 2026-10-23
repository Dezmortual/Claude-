-- Push notifications when an asset enters the home page's top buys or sells.
alter table users add column top_signal_push boolean not null default true;

-- When each asset and side was last announced, so one flickering in and out of the list isn't announced again
-- within a day.
create table top_signal_notices (
  slug text not null,
  side text not null check (side in ('buy','sell')),
  last_notified_at timestamptz not null default now(),
  primary key (slug, side)
);
