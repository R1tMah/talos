-- Lifts from Liftoff. The owner exports a CSV from the Liftoff app and pastes it into Chat;
-- code parses and checks every cell (lib/liftoff.ts), then import_liftoff() saves the sets.
-- A workout is identified by the export's Date cell, exactly as exported: Liftoff writes the
-- start time to the second, so it's unique per workout. (Its Workout Name is often empty;
-- code names it Push / Pull / Legs from its exercises.) Importing a workout again replaces
-- it, so overlapping exports never duplicate sets. Replaced rows are soft-deleted.
--
-- This replaces the in-app workout logger (workouts / sets / exercises), which is retired:
-- its tables and data are left as they are.

create table public.workout_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logical_date date not null,
  started text not null check (btrim(started) <> ''),  -- the Date cell as exported: identifies the workout
  duration text,                                       -- as exported
  workout_name text not null check (btrim(workout_name) <> ''),
  exercise text not null check (btrim(exercise) <> ''),
  set_order int not null default 0,
  weight numeric(8, 2) check (weight is null or weight >= 0),
  reps int check (reps is null or reps >= 0),
  distance numeric(10, 3),
  seconds numeric(10, 2),
  rpe numeric(4, 1),
  notes text,
  deleted_at timestamptz
);

create index workout_log_session on public.workout_log (started) where deleted_at is null;
create index workout_log_date on public.workout_log (logical_date) where deleted_at is null;

alter table public.workout_log enable row level security;
grant select on public.workout_log to authenticated;
create policy owner_all on public.workout_log for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- p_sets: [{ date, started, duration, workout, exercise, order, weight, reps, distance, seconds, rpe, notes }]
-- as lib/liftoff.ts parses them. Every workout in it (by start time) replaces the same one already saved.
-- One step: either all of it is saved or none of it.
create function public.import_liftoff(p_sets jsonb, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_sessions int;
  v_replaced int;
  v_sets int;
begin
  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) = 0 then
    return jsonb_build_object('status', 'invalid', 'detail', 'No sets to import.');
  end if;

  select count(distinct s->>'started') into v_sessions from jsonb_array_elements(p_sets) s;

  -- The sessions in the paste replace the same sessions already saved.
  with gone as (
    update public.workout_log w set deleted_at = now()
    where w.deleted_at is null
      and exists (select 1 from jsonb_array_elements(p_sets) s where s->>'started' = w.started)
    returning w.started
  )
  select count(distinct started) into v_replaced from gone;

  insert into public.workout_log (logical_date, started, duration, workout_name, exercise, set_order, weight, reps, distance, seconds, rpe, notes)
  select r.date, r.started, nullif(r.duration, ''), r.workout, r.exercise, coalesce(r."order", 0), r.weight, r.reps, r.distance, r.seconds, r.rpe, nullif(r.notes, '')
  from jsonb_to_recordset(p_sets) as r(date date, started text, duration text, workout text, exercise text, "order" int,
                                       weight numeric, reps int, distance numeric, seconds numeric, rpe numeric, notes text);
  get diagnostics v_sets = row_count;

  -- Logged for the record (row_id null: an import isn't undone from chat; paste again to fix it).
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'workout_log', null, jsonb_build_object('replaced_sessions', v_replaced),
          jsonb_build_object('sessions', v_sessions, 'sets', v_sets));

  return jsonb_build_object('status', 'saved', 'sessions', v_sessions, 'replaced', v_replaced, 'sets', v_sets);
end;
$$;

revoke execute on function public.import_liftoff(jsonb, text) from public, anon;
grant execute on function public.import_liftoff(jsonb, text) to authenticated;
