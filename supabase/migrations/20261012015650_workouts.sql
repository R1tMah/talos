-- Workouts on Supabase: the owner's exercises and plans, write functions for a
-- live workout, and per-day lift numbers for the progression chart.
--
-- Same conventions as the other slices: security invoker (RLS applies), every
-- write also logs an actions row (so Undo works), and each returns jsonb
-- { status: 'saved', row, action_id } | { status: 'conflict' | 'not_found' }.

-- ---- Exercises and plans (only if not seeded yet) ---------------------------------

do $$
begin
  if exists (select 1 from public.exercises) or exists (select 1 from public.plans) then
    return;
  end if;

  insert into public.exercises (name, aliases) values
    ('Incline dumbbell bench (strict)', array['bench', 'incline bench', 'incline dumbbell bench', 'incline db bench', 'db bench']),
    ('Chest fly',                       array['fly', 'flys', 'flies', 'cable fly', 'cable chest fly', 'machine chest fly', 'machine fly', 'pec fly']),
    ('Shoulder press',                  array['shoulder presses', 'ohp', 'overhead press']),
    ('Lateral raise',                   array['lateral raises', 'lat raise', 'lat raises', 'laterals', 'side raises']),
    ('Tricep pushdown',                 array['tricep pushdowns', 'triceps pushdown', 'pushdown', 'pushdowns']),
    ('Lat pulldown',                    array['lat pulldowns', 'pulldown', 'pulldowns']),
    ('T-bar row',                       array['t bar row', 'tbar row', 't-bar rows', 't bar rows']),
    ('Row',                             array['rows', 'cable row', 'machine row', 'seated row']),
    ('Rear delt fly (one arm, isolated)', array['rear delt fly', 'rear delt flys', 'rear delts', 'reverse fly']),
    ('Hammer curl',                     array['hammer curls']),
    ('Bicep curl',                      array['bicep curls', 'biceps curl', 'curl', 'curls']),
    ('Hack squat',                      array['hack squats']),
    ('Calf extension',                  array['calf extensions', 'calf raise', 'calf raises', 'calves']),
    ('Leg curl',                        array['leg curls', 'hamstring curl', 'hamstring curls']),
    ('Leg extension',                   array['leg extensions']),
    ('Hanging leg raise',               array['hanging leg raises', 'leg raise', 'leg raises']),
    ('Machine crunch',                  array['machine crunches', 'crunch', 'crunches', 'ab crunch']);

  insert into public.plans (name) values ('Push'), ('Pull'), ('Legs + abs');

  insert into public.plan_exercises (plan_id, exercise_id, position)
  select p.id, e.id, x.pos
  from (values
    ('Push', 'Incline dumbbell bench (strict)', 1), ('Push', 'Chest fly', 2), ('Push', 'Shoulder press', 3),
    ('Push', 'Lateral raise', 4), ('Push', 'Tricep pushdown', 5),
    ('Pull', 'Lat pulldown', 1), ('Pull', 'T-bar row', 2), ('Pull', 'Row', 3),
    ('Pull', 'Rear delt fly (one arm, isolated)', 4), ('Pull', 'Hammer curl', 5), ('Pull', 'Bicep curl', 6),
    ('Legs + abs', 'Hack squat', 1), ('Legs + abs', 'Calf extension', 2), ('Legs + abs', 'Leg curl', 3),
    ('Legs + abs', 'Leg extension', 4), ('Legs + abs', 'Hanging leg raise', 5), ('Legs + abs', 'Machine crunch', 6)
  ) as x(plan, exercise, pos)
  join public.plans p on p.name = x.plan
  join public.exercises e on e.name = x.exercise;
end $$;

-- ---- Writes ------------------------------------------------------------------------

-- Starts a workout from a plan, or an empty one (p_plan_id null). Only one can be
-- active (the one_active_workout index); a second start returns the active one.
create function public.start_workout(p_plan_id uuid, p_date date, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_active public.workouts;
  v_row public.workouts;
  v_action uuid;
begin
  select * into v_active from public.workouts where status = 'active' and deleted_at is null;
  if found then
    return jsonb_build_object('status', 'conflict', 'existing', to_jsonb(v_active));
  end if;

  insert into public.workouts (plan_id, logical_date, started_at, status)
  values (p_plan_id, p_date, now(), 'active')
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'workouts', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Appends a set; its number is the next one for that exercise in this workout.
-- Exercises outside the plan are fine.
create function public.log_set(
  p_workout_id uuid, p_exercise_id uuid, p_reps int, p_weight_lb numeric default null,
  p_variant text default null, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.sets;
  v_action uuid;
begin
  if not exists (select 1 from public.workouts where id = p_workout_id and deleted_at is null) then
    return jsonb_build_object('status', 'not_found');
  end if;

  insert into public.sets (workout_id, exercise_id, set_number, reps, weight_lb, variant)
  values (
    p_workout_id, p_exercise_id,
    coalesce((select max(set_number) from public.sets where workout_id = p_workout_id and exercise_id = p_exercise_id and deleted_at is null), 0) + 1,
    p_reps, p_weight_lb, p_variant
  )
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'sets', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.update_set(p_id uuid, p_reps int, p_weight_lb numeric, p_variant text, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.sets;
  v_row public.sets;
  v_action uuid;
begin
  select * into v_before from public.sets where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.sets set reps = p_reps, weight_lb = p_weight_lb, variant = p_variant where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'sets', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_set(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.sets;
  v_row public.sets;
  v_action uuid;
begin
  select * into v_before from public.sets where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.sets set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'sets', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Done: sets ended_at and status. Also edits a finished workout's date and times
-- (when the owner forgot to tap Done).
create function public.update_workout(
  p_id uuid, p_date date, p_started_at timestamptz, p_ended_at timestamptz, p_status text, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.workouts;
  v_row public.workouts;
  v_action uuid;
begin
  select * into v_before from public.workouts where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.workouts
  set logical_date = p_date, started_at = p_started_at, ended_at = p_ended_at, status = p_status
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'workouts', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Soft delete (also how an active workout is discarded). Its sets drop out of every
-- view because the views join through live workouts.
create function public.delete_workout(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.workouts;
  v_row public.workouts;
  v_action uuid;
begin
  select * into v_before from public.workouts where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.workouts set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'workouts', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- A new exercise (diverging from the plan). An existing name returns that exercise.
create function public.add_exercise(p_name text, p_aliases text[] default '{}', p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.exercises;
  v_row public.exercises;
  v_action uuid;
begin
  select * into v_existing from public.exercises where lower(name) = lower(trim(p_name)) and deleted_at is null;
  if found then
    return jsonb_build_object('status', 'conflict', 'existing', to_jsonb(v_existing));
  end if;

  insert into public.exercises (name, aliases) values (trim(p_name), coalesce(p_aliases, '{}')) returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'exercises', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- Reads -------------------------------------------------------------------------

-- One row per exercise per workout day. e1rm is the Epley estimate,
-- weight x (1 + reps / 30), from that day's best set (a single rep is the weight
-- itself). Bodyweight sets (no weight) have no e1rm; max_reps covers them.
create view public.lift_daily with (security_invoker = true) as
with s as (
  select s.exercise_id, w.logical_date, s.weight_lb, s.reps,
         case when s.weight_lb is null or s.weight_lb = 0 then null
              when s.reps = 1 then s.weight_lb
              else s.weight_lb * (1 + s.reps / 30.0) end as e1rm
  from public.sets s
  join public.workouts w on w.id = s.workout_id
  where s.deleted_at is null and w.deleted_at is null
)
select exercise_id, logical_date,
       count(*)::int as sets,
       round(max(e1rm), 1) as e1rm,
       (array_agg(weight_lb order by e1rm desc nulls last, weight_lb desc nulls last, reps desc))[1] as best_weight,
       (array_agg(reps order by e1rm desc nulls last, weight_lb desc nulls last, reps desc))[1] as best_reps,
       max(reps) as max_reps,
       round(sum(coalesce(weight_lb, 0) * reps), 1) as volume
from s
group by exercise_id, logical_date;

-- Past and active workouts with their plan name, set count and duration.
create view public.workout_history with (security_invoker = true) as
select w.id, w.logical_date, w.started_at, w.ended_at, w.status, w.plan_id, p.name as plan_name,
       (select count(*) from public.sets s where s.workout_id = w.id and s.deleted_at is null)::int as sets,
       case when w.ended_at is not null then round(extract(epoch from w.ended_at - w.started_at) / 60)::int end as minutes
from public.workouts w
left join public.plans p on p.id = w.plan_id
where w.deleted_at is null;

-- ---- Undo can now reach workout rows -------------------------------------------------

create or replace function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes',
                              'applications', 'foods', 'workouts', 'sets', 'exercises'])
$$;

-- ---- Access ----------------------------------------------------------------------------

grant select on public.lift_daily, public.workout_history to authenticated;

revoke execute on function
  public.start_workout(uuid, date, text),
  public.log_set(uuid, uuid, int, numeric, text, text),
  public.update_set(uuid, int, numeric, text, text),
  public.delete_set(uuid, text),
  public.update_workout(uuid, date, timestamptz, timestamptz, text, text),
  public.delete_workout(uuid, text),
  public.add_exercise(text, text[], text)
from public, anon;

grant execute on function
  public.start_workout(uuid, date, text),
  public.log_set(uuid, uuid, int, numeric, text, text),
  public.update_set(uuid, int, numeric, text, text),
  public.delete_set(uuid, text),
  public.update_workout(uuid, date, timestamptz, timestamptz, text, text),
  public.delete_workout(uuid, text),
  public.add_exercise(text, text[], text)
to authenticated;
