-- F6 notification controls: mute everything, quiet hours in the owner's time zone, a daily summary email instead of
-- one email per alert, and a stop link in every alert email.
alter table users add column alerts_muted_until timestamptz;               -- nothing is sent until then
alter table users add column quiet_start smallint check (quiet_start between 0 and 23);  -- local hour, inclusive
alter table users add column quiet_end smallint check (quiet_end between 0 and 23);      -- local hour, exclusive
alter table users add column email_mode text not null default 'instant' check (email_mode in ('instant','digest'));
alter table users add column digest_hour smallint not null default 8 check (digest_hour between 0 and 23);
alter table users add column last_digest_at timestamptz;
alter table users add constraint users_quiet_hours check ((quiet_start is null and quiet_end is null) or (quiet_start is not null and quiet_end is not null and quiet_start <> quiet_end));

-- A random token per alert for the stop link in its emails (no sign-in needed to stop it, so it must be unguessable).
alter table alerts add column stop_token text not null unique
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

-- muted: not sent because of mute or quiet hours; digest: waiting for the daily summary.
alter table alert_events drop constraint alert_events_email_status_check;
alter table alert_events add constraint alert_events_email_status_check check (email_status in ('pending','sent','failed','skipped','muted','digest'));
alter table alert_events drop constraint alert_events_push_status_check;
alter table alert_events add constraint alert_events_push_status_check check (push_status in ('pending','sent','failed','skipped','muted'));
create index on alert_events (user_id) where email_status = 'digest';
