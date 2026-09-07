alter table public.profiles
  add column if not exists report_interval_days integer not null default 7;

alter table public.profiles
  drop constraint if exists profiles_report_interval_days_check;

alter table public.profiles
  add constraint profiles_report_interval_days_check
  check (report_interval_days in (1, 7, 10, 15, 30));

alter table public.ritual_checkins
  add column if not exists task_category text,
  add column if not exists planned_closing_time timestamptz,
  add column if not exists reminder_time timestamptz,
  add column if not exists actual_response_time timestamptz,
  add column if not exists completion_status text,
  add column if not exists completed_late boolean not null default false,
  add column if not exists ai_reason_category text,
  add column if not exists ai_reason_summary text,
  add column if not exists ai_advice text;

alter table public.ritual_checkins
  drop constraint if exists ritual_checkins_ai_reason_category_check;

alter table public.ritual_checkins
  add constraint ritual_checkins_ai_reason_category_check
  check (ai_reason_category is null or ai_reason_category in ('valid_reason', 'avoidable_distraction', 'unclear_reason'));

alter table public.ritual_checkins
  drop constraint if exists ritual_checkins_completion_status_check;

alter table public.ritual_checkins
  add constraint ritual_checkins_completion_status_check
  check (completion_status is null or completion_status in ('completed_late', 'not_completed', 'completed_on_time'));

create index if not exists ritual_checkins_user_response_idx
  on public.ritual_checkins (user_id, actual_response_time desc);

create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start date not null,
  window_end date not null,
  interval_days integer not null check (interval_days in (1, 7, 10, 15, 30)),
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, window_start, window_end, interval_days)
);

alter table public.ai_reports enable row level security;
revoke all on table public.ai_reports from anon;
grant select, insert, update, delete on table public.ai_reports to authenticated;
grant select, insert, update, delete on table public.ai_reports to service_role;

drop policy if exists ai_reports_select_own on public.ai_reports;
create policy ai_reports_select_own on public.ai_reports
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists ai_reports_insert_own on public.ai_reports;
create policy ai_reports_insert_own on public.ai_reports
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists ai_reports_update_own on public.ai_reports;
create policy ai_reports_update_own on public.ai_reports
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists ai_reports_delete_own on public.ai_reports;
create policy ai_reports_delete_own on public.ai_reports
  for delete to authenticated using ((select auth.uid()) = user_id);
