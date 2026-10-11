-- Notepads: content ideas and the work journal (notes.kind = 'content' | 'journal').
--
-- The body is the owner's own text, stored exactly as given. No trimming,
-- rewriting or anything derived from it.
--
-- Same conventions as the other slices: security invoker (RLS applies), every
-- write also logs an actions row, and each returns jsonb
-- { status: 'saved', row, action_id } | { status: 'not_found' }.

create function public.add_note(p_kind text, p_date date, p_body text, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.notes;
  v_action uuid;
begin
  insert into public.notes (kind, logical_date, body)
  values (p_kind, p_date, p_body)
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'notes', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Replaces the body byte for byte. Unchanged text is a no-op (no actions row).
create function public.set_note_body(p_id uuid, p_body text, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.notes;
  v_row public.notes;
  v_action uuid;
begin
  select * into v_before from public.notes where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_before.body = p_body then
    return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_before), 'action_id', null);
  end if;

  update public.notes set body = p_body where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'notes', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_note(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.notes;
  v_row public.notes;
  v_action uuid;
begin
  select * into v_before from public.notes where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.notes set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'notes', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

revoke execute on function
  public.add_note(text, date, text, text),
  public.set_note_body(uuid, text, text),
  public.delete_note(uuid, text)
from public, anon;

grant execute on function
  public.add_note(text, date, text, text),
  public.set_note_body(uuid, text, text),
  public.delete_note(uuid, text)
to authenticated;
