-- Reminders to apply: a posting the owner saw but hasn't applied to yet.
-- Shown at the top of the Applications tab and as a banner on Tabs. Checking one
-- off creates the application; dismissing one soft-deletes it. Reminders are not
-- applications and never count toward any application number.

create table public.application_reminders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  noted_date date not null,            -- logical date the owner noted it
  company text not null check (btrim(company) <> ''),
  position text not null check (btrim(position) <> ''),
  application_id uuid references public.applications(id),  -- set when applied
  deleted_at timestamptz               -- dismissed
);

alter table public.application_reminders enable row level security;
grant select, insert, update on public.application_reminders to authenticated;
create policy owner_all on public.application_reminders for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- Open = not dismissed, and not (yet, or any longer) backed by a live application.
-- Undoing the application therefore brings the reminder back by itself.
create view public.open_application_reminders with (security_invoker = true) as
select r.id, r.created_at, r.noted_date, r.company, r.position
from public.application_reminders r
left join public.applications a on a.id = r.application_id and a.deleted_at is null
where r.deleted_at is null and a.id is null
order by r.created_at;

grant select on public.open_application_reminders to authenticated;

-- Undo can revert reminder adds and dismissals.
create or replace function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes', 'applications', 'foods', 'application_reminders'])
$$;

-- An open reminder for the same company and position is returned as a conflict.
create function public.add_application_reminder(p_company text, p_position text, p_date date, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_existing record;
  v_row public.application_reminders;
  v_action uuid;
begin
  select * into v_existing from public.open_application_reminders
  where lower(company) = lower(btrim(p_company)) and lower(position) = lower(btrim(p_position));
  if found then
    return jsonb_build_object('status', 'conflict', 'existing', to_jsonb(v_existing));
  end if;

  insert into public.application_reminders (noted_date, company, position)
  values (p_date, btrim(p_company), btrim(p_position))
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'application_reminders', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Dismiss without applying: soft delete.
create function public.dismiss_application_reminder(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.application_reminders;
  v_row public.application_reminders;
  v_action uuid;
begin
  select * into v_before from public.application_reminders where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.application_reminders set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'application_reminders', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Applied: creates the application (status Applied) and links the reminder, in one
-- transaction. The returned action is the application insert, so Undo removes the
-- application and the reminder reappears (see the view above).
create function public.apply_application_reminder(p_id uuid, p_date date, p_resume_name text default null, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_rem public.application_reminders;
  v_app public.applications;
  v_action uuid;
begin
  select r.* into v_rem
  from public.application_reminders r
  left join public.applications a on a.id = r.application_id and a.deleted_at is null
  where r.id = p_id and r.deleted_at is null and a.id is null
  for update of r;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  insert into public.applications (company, position, applied_date, status, resume_name)
  values (v_rem.company, v_rem.position, p_date, 'Applied', nullif(btrim(p_resume_name), ''))
  returning * into v_app;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'applications', v_app.id, null, to_jsonb(v_app))
  returning id into v_action;

  -- The link itself is bookkeeping; it's what "open" is computed from, so no separate action.
  update public.application_reminders set application_id = v_app.id where id = p_id;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_app), 'action_id', v_action);
end;
$$;

revoke execute on function
  public.add_application_reminder(text, text, date, text),
  public.dismiss_application_reminder(uuid, text),
  public.apply_application_reminder(uuid, date, text, text)
from public, anon;

grant execute on function
  public.add_application_reminder(text, text, date, text),
  public.dismiss_application_reminder(uuid, text),
  public.apply_application_reminder(uuid, date, text, text)
to authenticated;
