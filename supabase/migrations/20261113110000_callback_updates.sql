-- Callback updates: a comment thread under each callback. The callback (with its
-- debrief) is the post; updates hang off it, and any update can be replied to, so
-- a thread nests like a comment tree. Bodies are the owner's own text, stored
-- exactly as typed.
--
-- Same conventions as the other slices: security invoker, actions row per write (so
-- Undo works), jsonb { status, row, action_id } results, soft delete. Deleting an
-- update leaves its replies in place; the app shows it as "[deleted]" while it has any.

create table public.callback_updates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  callback_id uuid not null references public.callbacks (id),
  parent_id uuid references public.callback_updates (id),
  body text not null check (btrim(body) <> ''),
  deleted_at timestamptz
);

create index callback_updates_thread on public.callback_updates (callback_id, created_at);

alter table public.callback_updates enable row level security;
grant select, insert, update on public.callback_updates to authenticated;
create policy owner_all on public.callback_updates for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- A reply must be to an update in the same callback's thread.
create function public.add_callback_update(
  p_callback_id uuid, p_body text, p_parent_id uuid default null, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.callback_updates;
  v_action uuid;
begin
  if not exists (select 1 from public.callbacks where id = p_callback_id and deleted_at is null) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_parent_id is not null and not exists (
    select 1 from public.callback_updates where id = p_parent_id and callback_id = p_callback_id
  ) then
    return jsonb_build_object('status', 'not_found');
  end if;

  insert into public.callback_updates (callback_id, parent_id, body)
  values (p_callback_id, p_parent_id, p_body)
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'callback_updates', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Unchanged text is a no-op (no actions row).
create function public.edit_callback_update(p_id uuid, p_body text, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.callback_updates;
  v_row public.callback_updates;
  v_action uuid;
begin
  select * into v_before from public.callback_updates where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_before.body = p_body then
    return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_before), 'action_id', null);
  end if;

  update public.callback_updates set body = p_body, edited_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'callback_updates', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_callback_update(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.callback_updates;
  v_row public.callback_updates;
  v_action uuid;
begin
  select * into v_before from public.callback_updates where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.callback_updates set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'callback_updates', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

revoke execute on function
  public.add_callback_update(uuid, text, uuid, text),
  public.edit_callback_update(uuid, text, text),
  public.delete_callback_update(uuid, text)
from public, anon;

grant execute on function
  public.add_callback_update(uuid, text, uuid, text),
  public.edit_callback_update(uuid, text, text),
  public.delete_callback_update(uuid, text)
to authenticated;

-- Full list: start from the latest definition when changing it (20261108100000_eod_custom).
create or replace function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes',
                              'applications', 'foods', 'workouts', 'sets', 'exercises', 'application_reminders', 'runs',
                              'reminders', 'finance_transactions', 'checking_balances', 'vanguard_holdings', 'subscriptions',
                              'seasons', 'season_notes', 'phases', 'spending', 'life_experiences', 'eod_answers',
                              'callback_updates'])
$$;
