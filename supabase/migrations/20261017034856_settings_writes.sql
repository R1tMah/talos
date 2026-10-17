-- Settings writes.
--
-- Targets: a day's targets come from the phase covering it (targets_for), with the
-- settings row as the fallback. So changing targets from p_date on ends the current
-- phase the day before and starts a new phase at p_date with the new numbers (or
-- just updates the phase if it starts that very day), and updates the fallback.
-- Past days keep the targets they had. These span several rows, so they're logged
-- (row_id null) but not picked up by Undo; the app confirms before calling.

create function public.set_targets(p_date date, p_calories int, p_protein_g int, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_now record;
  v_phase public.phases;
  v_new public.phases;
  v_before jsonb;
  v_after jsonb;
begin
  if p_calories is null or p_calories <= 0 or p_protein_g is null or p_protein_g < 0 then
    raise exception 'targets must be positive';
  end if;

  select * into v_now from public.targets_for(p_date);
  if v_now.calorie_target = p_calories and v_now.protein_target_g = p_protein_g then
    return jsonb_build_object('status', 'unchanged');
  end if;

  select * into v_phase from public.phases
  where deleted_at is null and start_date <= p_date and (end_date is null or end_date >= p_date)
  order by start_date desc limit 1
  for update;

  v_before := jsonb_build_object('calorie_target', v_now.calorie_target, 'protein_target_g', v_now.protein_target_g,
                                 'phase', case when v_phase.id is null then null else to_jsonb(v_phase) end);

  if v_phase.id is not null and v_phase.start_date = p_date then
    update public.phases set calorie_target = p_calories, protein_target_g = p_protein_g
    where id = v_phase.id returning * into v_new;
  else
    if v_phase.id is not null then
      update public.phases set end_date = p_date - 1 where id = v_phase.id;
    end if;
    insert into public.phases (start_date, end_date, calorie_target, protein_target_g)
    values (p_date, v_phase.end_date, p_calories, p_protein_g)
    returning * into v_new;
  end if;

  update public.settings set calorie_target = p_calories, protein_target_g = p_protein_g where id = 1;

  v_after := jsonb_build_object('calorie_target', p_calories, 'protein_target_g', p_protein_g, 'phase', to_jsonb(v_new));
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'settings', null, v_before, v_after);

  return jsonb_build_object('status', 'saved', 'row', v_after, 'action_id', null);
end;
$$;

-- The other settings. Keys left out of p_changes stay as they are.
-- Allowed: rest_seconds (10-900), context_blurb (text, '' clears),
-- confidence_threshold (0.5-0.99), timezone (an IANA name Postgres knows).
create function public.update_settings(p_changes jsonb, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.settings;
  v_row public.settings;
  v_key text;
begin
  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in ('rest_seconds', 'context_blurb', 'confidence_threshold', 'timezone') then
      raise exception 'unknown setting %', v_key;
    end if;
  end loop;
  if p_changes ? 'rest_seconds' and ((p_changes->>'rest_seconds')::int not between 10 and 900) then
    raise exception 'rest_seconds must be 10-900';
  end if;
  if p_changes ? 'confidence_threshold' and ((p_changes->>'confidence_threshold')::numeric not between 0.5 and 0.99) then
    raise exception 'confidence_threshold must be 0.5-0.99';
  end if;
  if p_changes ? 'timezone' and not exists (select 1 from pg_timezone_names where name = p_changes->>'timezone') then
    return jsonb_build_object('status', 'invalid', 'detail', 'Unknown timezone');
  end if;

  select * into v_before from public.settings where id = 1 for update;

  update public.settings set
    rest_seconds = coalesce((p_changes->>'rest_seconds')::int, rest_seconds),
    context_blurb = case when p_changes ? 'context_blurb' then nullif(p_changes->>'context_blurb', '') else context_blurb end,
    confidence_threshold = coalesce((p_changes->>'confidence_threshold')::numeric, confidence_threshold),
    timezone = coalesce(p_changes->>'timezone', timezone)
  where id = 1
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'settings', null, to_jsonb(v_before), to_jsonb(v_row));

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', null);
end;
$$;

revoke execute on function public.set_targets(date, int, int, text), public.update_settings(jsonb, text) from public, anon;
grant execute on function public.set_targets(date, int, int, text), public.update_settings(jsonb, text) to authenticated;
