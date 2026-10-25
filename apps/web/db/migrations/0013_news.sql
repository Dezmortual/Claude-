-- News: stories from Alpaca's news API and RSS feeds, a word-list mood, keyword monitors and their matches.
create table news_feeds (                 -- feeds an owner added; the built-in ones live in code
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  url text not null check (length(url) <= 500),
  last_status text,                       -- 'ok', or what went wrong last time
  last_polled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);
alter table news_feeds enable row level security;

create table news_articles (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid references news_feeds(id) on delete cascade, -- null: a built-in source everyone sees
  source text not null,
  url text not null,
  title text not null,
  summary text not null default '',
  published_at timestamptz not null,
  slugs text[] not null default '{}',
  sentiment real not null default 0,
  mood text not null default 'neutral' check (mood in ('positive','neutral','negative')),
  mood_words text[] not null default '{}',
  fetched_at timestamptz not null default now()
);
create unique index on news_articles (url, coalesce(feed_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index on news_articles (published_at desc);
create index on news_articles using gin (slugs);
alter table news_articles enable row level security;

create table news_monitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  label text not null check (length(label) between 1 and 60),
  keywords text[] not null check (cardinality(keywords) between 1 and 10),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index on news_monitors (user_id);
alter table news_monitors enable row level security;

create table news_hits (
  monitor_id uuid not null references news_monitors(id) on delete cascade,
  article_id uuid not null references news_articles(id) on delete cascade,
  matched text[] not null,
  pushed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (monitor_id, article_id)
);
create index on news_hits (created_at desc);
alter table news_hits enable row level security;
