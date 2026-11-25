-- Each day keeps its own calorie and protein targets.
--
-- Before this, a day's targets were worked out live: the phase covering it, else the
-- one Settings row. Changing targets updates that row, so every past day no phase
-- covered took the new numbers. That rewrote the past.
--
-- Now a logged day's targets are stored in daily_targets once food is logged on it,
-- and targets_for returns that stored row when there is one. A change to targets
-- (Settings, or a phase added, edited, deleted or undone) re-stores only today and
-- later days. Days before today keep the targets they had.

create table public.daily_targets (
  logical_date date primary key,
  calorie_target int not null,
  protein_target_g int not null,
  updated_at timestamptz not null default now()
);

alter table public.daily_targets enable row level security;
grant select, insert, update, delete on public.daily_targets to authenticated;
create policy owner_all on public.daily_targets for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- The live rule, as targets_for worked before: the phase covering the day, falling
-- back to Settings per field.
create function public.live_targets_for(p_date date)
returns table (calorie_target int, protein_target_g int)
language sql
stable
set search_path = ''
as $$
  select coalesce(p.calorie_target, s.calorie_target), coalesce(p.protein_target_g, s.protein_target_g)
  from public.settings s
  left join lateral (
    select ph.calorie_target, ph.protein_target_g
    from public.phases ph
    where ph.deleted_at is null
      and ph.start_date <= p_date
      and (ph.end_date is null or ph.end_date >= p_date)
    order by ph.start_date desc
    limit 1
  ) p on true
  where s.id = 1
$$;

-- A day's targets: the stored row if the day has one, else the live rule.
-- Same signature as before, so daily_totals and every caller keep working.
create or replace function public.targets_for(p_date date)
returns table (calorie_target int, protein_target_g int)
language sql
stable
set search_path = ''
as $$
  select coalesce(d.calorie_target, l.calorie_target), coalesce(d.protein_target_g, l.protein_target_g)
  from public.live_targets_for(p_date) l
  left join public.daily_targets d on d.logical_date = p_date
$$;

-- Re-stores targets from p_from on, by the live rule: every logged day from then gets
-- the current targets, and stored days with no food left are dropped.
create function public.restore_targets_from(p_from date)
returns void
language sql
set search_path = ''
as $$
  delete from public.daily_targets where logical_date >= p_from;
  insert into public.daily_targets (logical_date, calorie_target, protein_target_g)
  select f.logical_date, l.calorie_target, l.protein_target_g
  from (select distinct logical_date from public.food_log where deleted_at is null and logical_date >= p_from) f
  cross join lateral public.live_targets_for(f.logical_date) l;
$$;

-- Food logged on a day stores that day's targets, if it has none yet.
create function public.food_log_store_targets()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is null then
    insert into public.daily_targets (logical_date, calorie_target, protein_target_g)
    select new.logical_date, l.calorie_target, l.protein_target_g from public.live_targets_for(new.logical_date) l
    on conflict (logical_date) do nothing;
  end if;
  return null;
end;
$$;

create trigger food_log_store_targets
after insert or update of logical_date, deleted_at on public.food_log
for each row execute function public.food_log_store_targets();

-- A change to targets applies from today on.
create function public.targets_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.restore_targets_from(public.owner_today());
  return null;
end;
$$;

create trigger phases_targets_changed
after insert or update or delete on public.phases
for each statement execute function public.targets_changed();

create trigger settings_targets_changed
after update of calorie_target, protein_target_g on public.settings
for each statement execute function public.targets_changed();

-- ---- Backfill ----------------------------------------------------------------------
-- Every logged day gets the targets it had at the time. Phases are dated, so they're
-- used as they are. Where no phase gives a field, the day used Settings. Settings has
-- been changed since, so take the value it had then: what the first set_targets change
-- dated after that day replaced (its 'before', recorded when no phase covered that
-- date, so it was Settings), else Settings as it is now.
insert into public.daily_targets (logical_date, calorie_target, protein_target_g)
select f.logical_date,
       coalesce(p.calorie_target, h.calorie_target, s.calorie_target),
       coalesce(p.protein_target_g, h.protein_target_g, s.protein_target_g)
from (select distinct logical_date from public.food_log where deleted_at is null) f
cross join public.settings s
left join lateral (
  select ph.calorie_target, ph.protein_target_g
  from public.phases ph
  where ph.deleted_at is null and ph.start_date <= f.logical_date
    and (ph.end_date is null or ph.end_date >= f.logical_date)
  order by ph.start_date desc
  limit 1
) p on true
left join lateral (
  select (a.before->>'calorie_target')::int as calorie_target, (a.before->>'protein_target_g')::int as protein_target_g
  from public.actions a
  where a.table_name = 'settings' and a.after ? 'calorie_target'
    and jsonb_typeof(a.before->'phase') = 'null'
    and coalesce((a.after->'phase'->>'start_date')::date, a.created_at::date) > f.logical_date
  order by a.created_at
  limit 1
) h on true
where s.id = 1;

-- ---- Access ------------------------------------------------------------------------
revoke execute on function
  public.live_targets_for(date), public.restore_targets_from(date),
  public.food_log_store_targets(), public.targets_changed()
from public, anon;
grant execute on function public.live_targets_for(date), public.restore_targets_from(date) to authenticated;
