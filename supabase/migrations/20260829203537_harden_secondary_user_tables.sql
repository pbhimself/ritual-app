alter table public.weekly_insights enable row level security;
alter table public.notifications enable row level security;
alter table public.coach_summaries enable row level security;
alter table public.coach_nudges enable row level security;

revoke all on table public.weekly_insights from anon, authenticated;
revoke all on table public.notifications from anon, authenticated;
revoke all on table public.coach_summaries from anon, authenticated;
revoke all on table public.coach_nudges from anon, authenticated;

grant select, insert, update, delete on table public.weekly_insights to authenticated;
grant select, insert, update, delete on table public.notifications to authenticated;
grant select on table public.coach_summaries to authenticated;
grant select, update on table public.coach_nudges to authenticated;
grant select, insert, update, delete on table public.weekly_insights to service_role;
grant select, insert, update, delete on table public.notifications to service_role;
grant select, insert, update, delete on table public.coach_summaries to service_role;
grant select, insert, update, delete on table public.coach_nudges to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'coach_nudges_habit_owner_fk'
      and conrelid = 'public.coach_nudges'::regclass
  ) then
    alter table public.coach_nudges
      add constraint coach_nudges_habit_owner_fk
      foreign key (habit_id, user_id)
      references public.habits (id, user_id)
      on delete cascade
      not valid;
  end if;
end $$;

drop policy if exists "weekly insights are owned by auth user" on public.weekly_insights;
drop policy if exists weekly_insights_select_own on public.weekly_insights;
drop policy if exists weekly_insights_insert_own on public.weekly_insights;
drop policy if exists weekly_insights_update_own on public.weekly_insights;
drop policy if exists weekly_insights_delete_own on public.weekly_insights;

create policy weekly_insights_select_own
  on public.weekly_insights
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy weekly_insights_insert_own
  on public.weekly_insights
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy weekly_insights_update_own
  on public.weekly_insights
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy weekly_insights_delete_own
  on public.weekly_insights
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "notifications are owned by auth user" on public.notifications;
drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_insert_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_delete_own on public.notifications;

create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy notifications_insert_own
  on public.notifications
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy notifications_update_own
  on public.notifications
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy notifications_delete_own
  on public.notifications
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "coach summaries are owned by auth user" on public.coach_summaries;
drop policy if exists coach_summaries_select_own on public.coach_summaries;

create policy coach_summaries_select_own
  on public.coach_summaries
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "coach nudges are owned by auth user" on public.coach_nudges;
drop policy if exists coach_nudges_select_own on public.coach_nudges;
drop policy if exists coach_nudges_update_own on public.coach_nudges;

create policy coach_nudges_select_own
  on public.coach_nudges
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy coach_nudges_update_own
  on public.coach_nudges
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke execute on function public.set_updated_at() from public, anon, authenticated;
