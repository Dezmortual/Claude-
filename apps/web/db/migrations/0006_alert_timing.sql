-- When the price or bar an alert was judged on was observed, and when each channel delivered it, so lateness shows.
alter table alert_events add column observed_at timestamptz;
alter table alert_events add column email_sent_at timestamptz;
alter table alert_events add column push_sent_at timestamptz;
