-- Accommodate both the original migration and the previously provisioned live schema.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_reports' and column_name = 'window_start') then
    alter table public.ai_reports rename column window_start to report_start;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_reports' and column_name = 'window_end') then
    alter table public.ai_reports rename column window_end to report_end;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ritual_checkins' and column_name = 'planned_closing_time' and data_type = 'timestamp with time zone') then
    alter table public.ritual_checkins alter column planned_closing_time type time using (planned_closing_time at time zone 'UTC')::time;
  end if;
end $$;

create unique index if not exists ai_reports_user_window_idx
  on public.ai_reports (user_id, report_start, report_end, interval_days);
