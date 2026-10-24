-- Finances > Subscriptions: recurring things the owner pays for, entered by hand or
-- from chat ("bought Spotify", "cancelled Netflix").
--
-- The one part of Finances chat can reach: the add_subscription and cancel_subscription
-- tools read and write this table only, through these functions. Transactions,
-- balances and holdings stay out of chat. Same conventions as the other slices:
-- security invoker, actions row per write, jsonb { status, row, action_id }, soft delete.

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (btrim(name) <> ''),
  amount numeric(10, 2) not null check (amount > 0),
  cadence text not null check (cadence in ('weekly', 'monthly', 'yearly')),
  started_on date not null,
  -- Set when it's cancelled: it stops counting toward spend but stays as history.
  cancelled_on date,
  note text,
  deleted_at timestamptz
);

create index subscriptions_live_idx on public.subscriptions (name) where deleted_at is null;

alter table public.subscriptions enable row level security;
grant select, insert, update on public.subscriptions to authenticated;
create policy owner_all on public.subscriptions for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- ---- Writes ------------------------------------------------------------------------

create function public.add_subscription(
  p_name text, p_amount numeric, p_cadence text, p_date date, p_note text default null, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.subscriptions;
  v_action uuid;
begin
  insert into public.subscriptions (name, amount, cadence, started_on, note)
  values (btrim(p_name), p_amount, p_cadence, p_date, nullif(btrim(p_note), ''))
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'subscriptions', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.update_subscription(
  p_id uuid, p_name text, p_amount numeric, p_cadence text, p_date date, p_note text, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.subscriptions;
  v_row public.subscriptions;
  v_action uuid;
begin
  select * into v_before from public.subscriptions where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.subscriptions
  set name = btrim(p_name), amount = p_amount, cadence = p_cadence, started_on = p_date, note = nullif(btrim(p_note), '')
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'subscriptions', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Cancels (p_date) or resumes (null) a subscription.
create function public.set_subscription_cancelled(p_id uuid, p_date date, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.subscriptions;
  v_row public.subscriptions;
  v_action uuid;
begin
  select * into v_before from public.subscriptions where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.subscriptions set cancelled_on = p_date where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'subscriptions', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_subscription(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.subscriptions;
  v_row public.subscriptions;
  v_action uuid;
begin
  select * into v_before from public.subscriptions where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.subscriptions set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'subscriptions', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- Undo --------------------------------------------------------------------------

-- Full list: start from the latest definition when changing it (20261023150000_finances).
create or replace function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes',
                              'applications', 'foods', 'workouts', 'sets', 'exercises', 'application_reminders', 'runs',
                              'reminders', 'finance_transactions', 'checking_balances', 'vanguard_holdings', 'subscriptions'])
$$;

-- ---- Grants ------------------------------------------------------------------------

revoke execute on function
  public.add_subscription(text, numeric, text, date, text, text),
  public.update_subscription(uuid, text, numeric, text, date, text, text),
  public.set_subscription_cancelled(uuid, date, text),
  public.delete_subscription(uuid, text)
from public, anon;

grant execute on function
  public.add_subscription(text, numeric, text, date, text, text),
  public.update_subscription(uuid, text, numeric, text, date, text, text),
  public.set_subscription_cancelled(uuid, date, text),
  public.delete_subscription(uuid, text)
to authenticated;
