-- Applications slice: write functions, same contract as the weight ones.
--
-- Every write goes through one of these so the row change and its actions
-- entry (for Undo) commit together. Security invoker, so owner-only RLS applies.
-- Each returns jsonb { status, row, action_id }, or { status: 'not_found' }.
-- p_tool records who wrote it: 'manual' for the table forms, the tool name for chat.

create function public.save_application(
  p_company text, p_position text, p_applied_date date, p_status text,
  p_resume_name text default null, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.applications;
  v_action uuid;
begin
  insert into public.applications (company, position, applied_date, status, resume_name)
  values (p_company, p_position, p_applied_date, p_status, p_resume_name)
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'applications', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.update_application(
  p_id uuid, p_company text, p_position text, p_applied_date date, p_status text,
  p_resume_name text, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.applications;
  v_row public.applications;
  v_action uuid;
begin
  select * into v_before from public.applications where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.applications
  set company = p_company, position = p_position, applied_date = p_applied_date,
      status = p_status, resume_name = p_resume_name
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'applications', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Soft delete: sets deleted_at, the row stays.
create function public.delete_application(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.applications;
  v_row public.applications;
  v_action uuid;
begin
  select * into v_before from public.applications where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.applications set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'applications', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Functions are executable by everyone by default; limit them to the logged-in role.
revoke execute on function
  public.save_application(text, text, date, text, text, text),
  public.update_application(uuid, text, text, date, text, text, text),
  public.delete_application(uuid, text)
from public, anon;

grant execute on function
  public.save_application(text, text, date, text, text, text),
  public.update_application(uuid, text, text, date, text, text, text),
  public.delete_application(uuid, text)
to authenticated;
