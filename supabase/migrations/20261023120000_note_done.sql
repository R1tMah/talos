-- Notes can be marked done (used by Talos Improvements: struck through, kept on the list).
-- Toggling logs an actions row like every other write, so Undo works.
alter table public.notes add column done_at timestamptz;

create function public.set_note_done(p_id uuid, p_done boolean, p_tool text default 'manual')
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
  if (v_before.done_at is not null) = p_done then
    return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_before), 'action_id', null);
  end if;

  update public.notes set done_at = case when p_done then now() end where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'notes', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

revoke execute on function public.set_note_done(uuid, boolean, text) from public, anon;
grant execute on function public.set_note_done(uuid, boolean, text) to authenticated;
