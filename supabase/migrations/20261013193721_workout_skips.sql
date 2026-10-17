-- Skipping a plan exercise for one workout ("not doing calves today"). The plan is
-- untouched; the skip lives on that day's workout, so it survives a reload and Undo
-- puts it back (workouts is undoable).
alter table public.workouts add column skipped_exercise_ids uuid[] not null default '{}';

-- Skips (p_skipped true) or brings back (false) one exercise in a workout. An exercise
-- with sets already logged in this workout can't be skipped: { status: 'has_sets' }.
create function public.set_exercise_skipped(p_workout_id uuid, p_exercise_id uuid, p_skipped boolean, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.workouts;
  v_row public.workouts;
  v_action uuid;
begin
  select * into v_before from public.workouts where id = p_workout_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if p_skipped and exists (
    select 1 from public.sets where workout_id = p_workout_id and exercise_id = p_exercise_id and deleted_at is null
  ) then
    return jsonb_build_object('status', 'has_sets');
  end if;

  update public.workouts
  set skipped_exercise_ids = case
    when p_skipped then array(select distinct x from unnest(skipped_exercise_ids || p_exercise_id) as x)
    else array_remove(skipped_exercise_ids, p_exercise_id)
  end
  where id = p_workout_id
  returning * into v_row;

  if v_row.skipped_exercise_ids = v_before.skipped_exercise_ids then
    return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', null);
  end if;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'workouts', p_workout_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

revoke execute on function public.set_exercise_skipped(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.set_exercise_skipped(uuid, uuid, boolean, text) to authenticated;
