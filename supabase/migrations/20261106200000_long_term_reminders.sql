-- Long-term reminders: ordinary reminders with a "show from" date (surface_date), picked
-- by the owner. They live on their own tab (Long-Term Reminders) and stay off the
-- Reminders banner on TALOS, and out of the Sunday email, until that date arrives in
-- the owner's timezone (4am rule). From then on they sit in the banner like any other
-- reminder, and done/dismiss/Undo work the same. surface_date null = an ordinary reminder.

alter table public.reminders add column surface_date date;
alter table public.reminders add constraint reminders_surface_before_due
  check (surface_date is null or due_date is null or surface_date <= due_date);

-- Today's logical date in the owner's timezone (4am rule), as add_scheduled_reminder works it out.
create function public.owner_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone s.timezone - interval '4 hours')::date from public.settings s where s.id = 1
$$;

revoke execute on function public.owner_today() from public, anon;
grant execute on function public.owner_today() to authenticated;

-- The banner's list: ordinary reminders plus long-term ones whose day has come.
-- surface_date is appended so `create or replace` keeps the existing columns as they are.
create or replace view public.open_reminders with (security_invoker = true) as
select id, created_at, noted_date, body, due_date, surface_date
from public.reminders
where deleted_at is null and done_at is null
  and (surface_date is null or surface_date <= public.owner_today())
order by due_date nulls last, created_at;

-- The Long-Term Reminders tab: every open long-term reminder, shown on TALOS yet or not,
-- soonest "show from" first.
create view public.open_long_term_reminders with (security_invoker = true) as
select id, created_at, noted_date, body, due_date, surface_date, surface_date <= public.owner_today() as surfaced
from public.reminders
where deleted_at is null and done_at is null and surface_date is not null
order by surface_date, due_date nulls last, created_at;

grant select on public.open_long_term_reminders to authenticated;

-- ---- Writes take the "show from" date (last, defaulting to null, so existing callers keep working) ----

drop function public.add_reminder(text, date, date, text);
drop function public.update_reminder(uuid, text, date, text);

create function public.add_reminder(p_body text, p_due date, p_date date, p_tool text default 'manual', p_surface date default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.reminders;
  v_action uuid;
begin
  insert into public.reminders (noted_date, body, due_date, surface_date) values (p_date, p_body, p_due, p_surface) returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'reminders', v_row.id, null, to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Text, due date and "show from" date, all as given: null "show from" makes it an ordinary reminder.
create function public.update_reminder(p_id uuid, p_body text, p_due date, p_tool text default 'manual', p_surface date default null)
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
  update public.reminders set body = p_body, due_date = p_due, surface_date = p_surface where id = p_id returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'reminders', p_id, to_jsonb(v_before), to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

revoke execute on function
  public.add_reminder(text, date, date, text, date),
  public.update_reminder(uuid, text, date, text, date)
from public, anon;

grant execute on function
  public.add_reminder(text, date, date, text, date),
  public.update_reminder(uuid, text, date, text, date)
to authenticated;
