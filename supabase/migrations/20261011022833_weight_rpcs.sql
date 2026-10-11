-- Weight slice: phase labels plus the write functions for weights and breaks.
--
-- Every write goes through one of these functions so the row change and its
-- actions entry (for Undo) commit together. They run as the caller (security
-- invoker), so the owner-only RLS policies still apply.
--
-- Each returns jsonb: { status, row, action_id } on success, or
-- { status: 'conflict', existing } / { status: 'not_found' } for the caller to handle.
-- p_tool records who wrote it: 'manual' for the table forms, the tool name for chat.

-- Short label for the chart band (e.g. 'Cut'). Description stays the long verbatim text.
alter table public.phases add column name text;

-- ---- Weights ---------------------------------------------------------------

-- One weight per logical day: a second save for the same day returns the
-- existing row instead of inserting, so the app can ask "Update to X?".
create function public.save_weight(p_date date, p_weight_lb numeric, p_note text default null, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.weights;
  v_row public.weights;
  v_action uuid;
begin
  select * into v_existing from public.weights where logical_date = p_date and deleted_at is null;
  if found then
    return jsonb_build_object('status', 'conflict', 'existing', to_jsonb(v_existing));
  end if;

  insert into public.weights (logical_date, weight_lb, note)
  values (p_date, p_weight_lb, p_note)
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'weights', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Replaces the editable fields. Moving to a date that already has a weight is a conflict.
create function public.update_weight(p_id uuid, p_date date, p_weight_lb numeric, p_note text, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.weights;
  v_existing public.weights;
  v_row public.weights;
  v_action uuid;
begin
  select * into v_before from public.weights where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into v_existing from public.weights where logical_date = p_date and deleted_at is null and id <> p_id;
  if found then
    return jsonb_build_object('status', 'conflict', 'existing', to_jsonb(v_existing));
  end if;

  update public.weights
  set logical_date = p_date, weight_lb = p_weight_lb, note = p_note
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'weights', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Soft delete: sets deleted_at, the row stays.
create function public.delete_weight(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.weights;
  v_row public.weights;
  v_action uuid;
begin
  select * into v_before from public.weights where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.weights set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'weights', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- Breaks ----------------------------------------------------------------

create function public.save_break(p_start date, p_end date, p_label text, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.breaks;
  v_action uuid;
begin
  insert into public.breaks (start_date, end_date, label)
  values (p_start, p_end, p_label)
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'breaks', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.update_break(p_id uuid, p_start date, p_end date, p_label text, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.breaks;
  v_row public.breaks;
  v_action uuid;
begin
  select * into v_before from public.breaks where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.breaks
  set start_date = p_start, end_date = p_end, label = p_label
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'breaks', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_break(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.breaks;
  v_row public.breaks;
  v_action uuid;
begin
  select * into v_before from public.breaks where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.breaks set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'breaks', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- Access ----------------------------------------------------------------

-- Functions are executable by everyone by default; limit them to the logged-in role.
revoke execute on function
  public.save_weight(date, numeric, text, text),
  public.update_weight(uuid, date, numeric, text, text),
  public.delete_weight(uuid, text),
  public.save_break(date, date, text, text),
  public.update_break(uuid, date, date, text, text),
  public.delete_break(uuid, text)
from public, anon;

grant execute on function
  public.save_weight(date, numeric, text, text),
  public.update_weight(uuid, date, numeric, text, text),
  public.delete_weight(uuid, text),
  public.save_break(date, date, text, text),
  public.update_break(uuid, date, date, text, text),
  public.delete_break(uuid, text)
to authenticated;
