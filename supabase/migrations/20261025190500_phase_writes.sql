-- Phases from the Weight tab: add, edit, delete. A phase is a dated span with an
-- optional short name (the chart band), optional calorie/protein targets (Nutrition
-- uses them for its dates, through targets_for) and the owner's description, verbatim.
--
-- Phases don't overlap. A new phase starting inside the open-ended current phase closes
-- that one the day before (as set_targets does); any other overlap is refused with the
-- phase in the way, so history is never changed silently.

create function public.phase_overlap(p_start date, p_end date, p_except uuid)
returns public.phases
language sql
stable
set search_path = ''
as $$
  select * from public.phases ph
  where ph.deleted_at is null and ph.id is distinct from p_except
    and ph.start_date <= coalesce(p_end, 'infinity'::date)
    and coalesce(ph.end_date, 'infinity'::date) >= p_start
    -- the open-ended phase this one starts after is closed instead, not an overlap
    and not (ph.end_date is null and ph.start_date < p_start)
  order by ph.start_date
  limit 1
$$;

create function public.check_phase(p_start date, p_end date, p_calories int, p_protein int)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_start is null then 'Start date is required.'
    when p_end is not null and p_end < p_start then 'End date is before start date.'
    when p_calories is not null and p_calories not between 800 and 6000 then 'Calories must be 800-6000.'
    when p_protein is not null and p_protein not between 0 and 500 then 'Protein must be 0-500 g.'
  end
$$;

create function public.add_phase(
  p_start date, p_end date, p_name text, p_calories int, p_protein int, p_description text, p_tool text default 'manual'
)
returns jsonb language plpgsql set search_path = '' as $$
declare v_bad text; v_clash public.phases; v_open public.phases; v_row public.phases; v_action uuid;
begin
  v_bad := public.check_phase(p_start, p_end, p_calories, p_protein);
  if v_bad is not null then return jsonb_build_object('status', 'invalid', 'detail', v_bad); end if;
  v_clash := public.phase_overlap(p_start, p_end, null);
  if v_clash.id is not null then return jsonb_build_object('status', 'overlap', 'existing', to_jsonb(v_clash)); end if;

  -- Close the open-ended phase this one starts after.
  select * into v_open from public.phases
  where deleted_at is null and end_date is null and start_date < p_start for update;
  if found then
    update public.phases set end_date = p_start - 1 where id = v_open.id;
    insert into public.actions (tool, table_name, row_id, before, after)
    select p_tool, 'phases', v_open.id, to_jsonb(v_open), to_jsonb(ph) from public.phases ph where ph.id = v_open.id;
  end if;

  insert into public.phases (start_date, end_date, name, calorie_target, protein_target_g, description)
  values (p_start, p_end, nullif(btrim(p_name), ''), p_calories, p_protein, nullif(p_description, ''))
  returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'phases', v_row.id, null, to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end; $$;

create function public.update_phase(
  p_id uuid, p_start date, p_end date, p_name text, p_calories int, p_protein int, p_description text, p_tool text default 'manual'
)
returns jsonb language plpgsql set search_path = '' as $$
declare v_bad text; v_clash public.phases; v_before public.phases; v_row public.phases; v_action uuid;
begin
  select * into v_before from public.phases where id = p_id and deleted_at is null for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  v_bad := public.check_phase(p_start, p_end, p_calories, p_protein);
  if v_bad is not null then return jsonb_build_object('status', 'invalid', 'detail', v_bad); end if;
  -- Editing never closes another phase: any overlap is refused.
  select * into v_clash from public.phases ph
  where ph.deleted_at is null and ph.id <> p_id
    and ph.start_date <= coalesce(p_end, 'infinity'::date) and coalesce(ph.end_date, 'infinity'::date) >= p_start
  order by ph.start_date limit 1;
  if found then return jsonb_build_object('status', 'overlap', 'existing', to_jsonb(v_clash)); end if;

  update public.phases set start_date = p_start, end_date = p_end, name = nullif(btrim(p_name), ''),
    calorie_target = p_calories, protein_target_g = p_protein, description = nullif(p_description, '')
  where id = p_id returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'phases', p_id, to_jsonb(v_before), to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end; $$;

create function public.delete_phase(p_id uuid, p_tool text default 'manual')
returns jsonb language plpgsql set search_path = '' as $$
declare v_before public.phases; v_row public.phases; v_action uuid;
begin
  select * into v_before from public.phases where id = p_id and deleted_at is null for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  update public.phases set deleted_at = now() where id = p_id returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'phases', p_id, to_jsonb(v_before), to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end; $$;

-- ---- Undo --------------------------------------------------------------------------

-- Full list: start from the latest definition when changing it (20261025160000_seasons).
create or replace function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes',
                              'applications', 'foods', 'workouts', 'sets', 'exercises', 'application_reminders', 'runs',
                              'reminders', 'finance_transactions', 'checking_balances', 'vanguard_holdings', 'subscriptions',
                              'seasons', 'season_notes', 'phases'])
$$;

revoke execute on function
  public.phase_overlap(date, date, uuid), public.check_phase(date, date, int, int),
  public.add_phase(date, date, text, int, int, text, text),
  public.update_phase(uuid, date, date, text, int, int, text, text),
  public.delete_phase(uuid, text)
from public, anon;
-- The helpers too: add_phase and update_phase run as the caller (security invoker).
grant execute on function
  public.phase_overlap(date, date, uuid), public.check_phase(date, date, int, int),
  public.add_phase(date, date, text, int, int, text, text),
  public.update_phase(uuid, date, date, text, int, int, text, text),
  public.delete_phase(uuid, text)
to authenticated;
