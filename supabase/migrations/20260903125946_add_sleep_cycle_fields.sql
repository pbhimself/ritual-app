-- Recovered from the already-applied migration to keep local history in sync.
alter table public.habits
  add column if not exists sleep_bedtime time,
  add column if not exists sleep_wake_time time,
  add column if not exists sleep_actual_bedtime time,
  add column if not exists sleep_actual_wake_time time,
  add column if not exists sleep_track_actual boolean not null default false;

alter table public.profiles
  add column if not exists sleep_reminders_enabled boolean not null default true;

create index if not exists habits_user_sleep_cycle_idx
  on public.habits (user_id, sleep_bedtime, sleep_wake_time)
  where sleep_bedtime is not null or sleep_wake_time is not null;
