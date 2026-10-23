-- General reminders ("call the landlord", "renew passport by Nov 1"), shown on the Tabs
-- page above the "To apply" application reminders. The text is the owner's own words,
-- stored exactly. Done sets done_at; dismissing soft-deletes. Undo covers all of it.

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  noted_date date not null,                 -- logical date it was added
  body text not null check (btrim(body) <> ''),
  due_date date,                            -- optional
  done_at timestamptz,
  deleted_at timestamptz                    -- dismissed
);

alter table public.reminders enable row level security;
grant select, insert, update on public.reminders to authenticated;
create policy owner_all on public.reminders for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- Open reminders: dated ones by due date first, then undated ones oldest first.
create view public.open_reminders with (security_invoker = true) as
select id, created_at, noted_date, body, due_date
from public.reminders
where deleted_at is null and done_at is null
order by due_date nulls last, created_at;

grant select on public.open_reminders to authenticated;

-- ---- Writes (each logs an actions row, so Undo works) --------------------------------

create function public.add_reminder(p_body text, p_due date, p_date date, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.reminders;
  v_action uuid;
begin
  insert into public.reminders (noted_date, body, due_date) values (p_date, p_body, p_due) returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'reminders', v_row.id, null, to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Text and due date. The text is saved exactly as given.
create function public.update_reminder(p_id uuid, p_body text, p_due date, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.reminders;
  v_row public.reminders;
  v_action uuid;
begin
  select * into v_before from public.reminders where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  update public.reminders set body = p_body, due_date = p_due where id = p_id returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'reminders', p_id, to_jsonb(v_before), to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Done: off the list, kept as done.
create function public.complete_reminder(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.reminders;
  v_row public.reminders;
  v_action uuid;
begin
  select * into v_before from public.reminders where id = p_id and deleted_at is null and done_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  update public.reminders set done_at = now() where id = p_id returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'reminders', p_id, to_jsonb(v_before), to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Dismiss: soft delete.
create function public.dismiss_reminder(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.reminders;
  v_row public.reminders;
  v_action uuid;
begin
  select * into v_before from public.reminders where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  update public.reminders set deleted_at = now() where id = p_id returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'reminders', p_id, to_jsonb(v_before), to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- Undo can reach reminders (the existing list, plus reminders) ----------------------

create or replace function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes',
                              'applications', 'foods', 'workouts', 'sets', 'exercises', 'application_reminders', 'runs',
                              'reminders'])
$$;

revoke execute on function
  public.add_reminder(text, date, date, text),
  public.update_reminder(uuid, text, date, text),
  public.complete_reminder(uuid, text),
  public.dismiss_reminder(uuid, text)
from public, anon;

grant execute on function
  public.add_reminder(text, date, date, text),
  public.update_reminder(uuid, text, date, text),
  public.complete_reminder(uuid, text),
  public.dismiss_reminder(uuid, text)
to authenticated;
