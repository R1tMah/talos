-- Runs: date, distance and time, plus a basic calories-burned estimate.
--
-- Calories: about 1 kcal per kg of body weight per km (0.73 kcal per lb per mile),
-- using the latest weigh-in on or before the run's date. Computed here when the run
-- is saved or edited, stored with the weight it used, and labelled an estimate in
-- the app. No weigh-in yet = no estimate. Never counted in nutrition totals.
--
-- Same conventions as the other slices: security invoker, actions row per write,
-- jsonb { status, row, action_id } results, soft delete.

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logical_date date not null,
  distance_mi numeric not null check (distance_mi > 0),
  duration_sec int not null check (duration_sec > 0),
  calories_est int check (calories_est >= 0),
  weight_lb_used numeric,
  note text,
  deleted_at timestamptz
);

alter table public.runs enable row level security;
grant select, insert, update on public.runs to authenticated;
create policy owner_all on public.runs for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- The estimate for a run on p_date: { weight_lb, calories } (both null without a weigh-in).
create function public.run_calories(p_date date, p_distance_mi numeric)
returns table (weight_lb numeric, calories int)
language sql
stable
set search_path = ''
as $$
  select w.weight_lb, round(0.73 * w.weight_lb * p_distance_mi)::int
  from (select weight_lb from public.weights
        where deleted_at is null and logical_date <= p_date
        order by logical_date desc, created_at desc limit 1) w
$$;

create function public.log_run(
  p_date date, p_distance_mi numeric, p_duration_sec int, p_note text default null, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_est record;
  v_row public.runs;
  v_action uuid;
begin
  select * into v_est from public.run_calories(p_date, p_distance_mi);

  insert into public.runs (logical_date, distance_mi, duration_sec, calories_est, weight_lb_used, note)
  values (p_date, p_distance_mi, p_duration_sec, v_est.calories, v_est.weight_lb, nullif(btrim(p_note), ''))
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'runs', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Replaces the editable fields; the estimate is recomputed for the new date and distance.
create function public.update_run(
  p_id uuid, p_date date, p_distance_mi numeric, p_duration_sec int, p_note text, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.runs;
  v_est record;
  v_row public.runs;
  v_action uuid;
begin
  select * into v_before from public.runs where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into v_est from public.run_calories(p_date, p_distance_mi);

  update public.runs
  set logical_date = p_date, distance_mi = p_distance_mi, duration_sec = p_duration_sec,
      calories_est = v_est.calories, weight_lb_used = v_est.weight_lb, note = nullif(btrim(p_note), '')
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'runs', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_run(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.runs;
  v_row public.runs;
  v_action uuid;
begin
  select * into v_before from public.runs where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.runs set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'runs', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Undo can revert runs. Full list: start from the latest definition when changing it
-- (20261013193755_undoable_tables_fix).
create or replace function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes',
                              'applications', 'foods', 'workouts', 'sets', 'exercises', 'application_reminders', 'runs'])
$$;

revoke execute on function
  public.run_calories(date, numeric),
  public.log_run(date, numeric, int, text, text),
  public.update_run(uuid, date, numeric, int, text, text),
  public.delete_run(uuid, text)
from public, anon;

grant execute on function
  public.run_calories(date, numeric),
  public.log_run(date, numeric, int, text, text),
  public.update_run(uuid, date, numeric, int, text, text),
  public.delete_run(uuid, text)
to authenticated;
