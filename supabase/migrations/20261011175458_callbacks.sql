-- Callbacks slice: write functions and counts.
--
-- Every OA and interview is its own row. The debrief is the owner's own text,
-- stored exactly as given: no trimming, no rewriting, nothing derived from it.
-- A callback links to an application with the same company name when exactly
-- one exists; nothing else is linked or changed automatically.
--
-- Same conventions as the other slices: security invoker (RLS applies), every
-- write also logs an actions row, and each returns jsonb
-- { status: 'saved', row, action_id, has_application } | { status: 'not_found' }.

-- The single live application for a company (case-insensitive), or null if none or several.
create function public.application_for(p_company text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case when count(*) = 1 then min(id::text)::uuid end
  from public.applications
  where lower(company) = lower(trim(p_company)) and deleted_at is null
$$;

create function public.log_callback(
  p_date date, p_company text, p_kind text,
  p_score text default null, p_outcome text default null, p_debrief text default null,
  p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.callbacks;
  v_action uuid;
begin
  insert into public.callbacks (logical_date, company, application_id, kind, score, outcome, debrief)
  values (p_date, trim(p_company), public.application_for(p_company), p_kind, p_score, p_outcome, p_debrief)
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'callbacks', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action,
    'has_application', exists (select 1 from public.applications where lower(company) = lower(trim(p_company)) and deleted_at is null));
end;
$$;

-- Details only (date, company, kind, score, outcome). The debrief has its own function.
create function public.update_callback(
  p_id uuid, p_date date, p_company text, p_kind text, p_score text, p_outcome text,
  p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.callbacks;
  v_row public.callbacks;
  v_action uuid;
begin
  select * into v_before from public.callbacks where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.callbacks
  set logical_date = p_date,
      company = trim(p_company),
      -- Re-link only when the company changed; a manual link is otherwise left alone.
      application_id = case when lower(trim(p_company)) = lower(v_before.company) then v_before.application_id
                            else public.application_for(p_company) end,
      kind = p_kind, score = p_score, outcome = p_outcome
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'callbacks', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Saves the debrief byte for byte. Unchanged text is a no-op (no actions row).
create function public.set_debrief(p_id uuid, p_debrief text, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.callbacks;
  v_row public.callbacks;
  v_action uuid;
begin
  select * into v_before from public.callbacks where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_before.debrief is not distinct from p_debrief then
    return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_before), 'action_id', null);
  end if;

  update public.callbacks set debrief = p_debrief where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'callbacks', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_callback(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.callbacks;
  v_row public.callbacks;
  v_action uuid;
begin
  select * into v_before from public.callbacks where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.callbacks set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'callbacks', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Count per kind ('OA', 'Interview', ...). Interviews and OAs are shown separately.
create view public.callback_counts with (security_invoker = true) as
select kind, count(*)::int as n
from public.callbacks
where deleted_at is null
group by kind;

-- ---- Access ----------------------------------------------------------------------

grant select on public.callback_counts to authenticated;

revoke execute on function
  public.application_for(text),
  public.log_callback(date, text, text, text, text, text, text),
  public.update_callback(uuid, date, text, text, text, text, text),
  public.set_debrief(uuid, text, text),
  public.delete_callback(uuid, text)
from public, anon;

grant execute on function
  public.application_for(text),
  public.log_callback(date, text, text, text, text, text, text),
  public.update_callback(uuid, date, text, text, text, text, text),
  public.set_debrief(uuid, text, text),
  public.delete_callback(uuid, text)
to authenticated;

-- ---- One-time link for callbacks that existed before this migration ---------------
-- Only where exactly one application matches the company; ambiguous ones stay null.
update public.callbacks
set application_id = public.application_for(company)
where application_id is null and deleted_at is null and public.application_for(company) is not null;
