-- Owner-only access for every table.
--
-- Two layers, both required:
--   1. GRANTs decide which operations the logged-in role may attempt at all.
--   2. RLS policies decide which rows it may touch (all of them, but only for the owner).
--
-- No DELETE grant anywhere: rows are soft-deleted via deleted_at, never removed.
-- The anon role gets nothing, so the public key alone can read or write no data.

-- True only for the owner's login. Used by every policy below.
create or replace function public.is_owner()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() = '440421a2-aa8b-4990-875e-f1433dd8be01'::uuid
$$;

revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- Privileges
grant select, insert, update on
  public.actions,
  public.applications,
  public.callbacks,
  public.exercises,
  public.food_log,
  public.foods,
  public.lc_catalog,
  public.leetcode_log,
  public.notes,
  public.phases,
  public.plan_exercises,
  public.plans,
  public.saved_meal_items,
  public.saved_meals,
  public.sets,
  public.settings,
  public.weights,
  public.workouts
to authenticated;

-- security_invoker view: reads go through the weights policy below.
grant select on public.weekly_weights to authenticated;

-- Policies: one per table, owner only, for every operation the grants allow.
create policy owner_all on public.actions          for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.applications     for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.callbacks        for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.exercises        for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.food_log         for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.foods            for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.lc_catalog       for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.leetcode_log     for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.notes            for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.phases           for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.plan_exercises   for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.plans            for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.saved_meal_items for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.saved_meals      for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.sets             for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.settings         for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.weights          for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.workouts         for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
