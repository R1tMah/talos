-- Saved spendings: purchases the owner makes often (a usual coffee, the gym day pass,
-- an Uber home), saved once with a name, amount and category. Logging one ("chipotle"
-- in chat, or a tap in Spending) adds an ordinary spending entry. The amount can be left
-- blank for things that vary (gas); then it's asked for when logged.
--
-- Same conventions as spending: security invoker (owner-only RLS applies), every write
-- logs an actions row so it can be undone, and each returns jsonb
-- { status, row, action_id } | { status: 'not_found' } | { status: 'conflict', existing }.

create table public.saved_spends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (btrim(name) <> ''),
  aliases text[] not null default '{}',
  amount numeric(10, 2) check (amount is null or amount > 0),  -- null: asked each time
  category text not null default 'Other'
    check (category in ('Food & drink', 'Groceries', 'Transport', 'Shopping', 'Entertainment', 'School', 'Health', 'Other')),
  deleted_at timestamptz
);

create unique index saved_spends_name_idx on public.saved_spends (lower(name)) where deleted_at is null;

alter table public.saved_spends enable row level security;
grant select, insert, update on public.saved_spends to authenticated;
create policy owner_all on public.saved_spends for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

create function public.save_saved_spend(
  p_name text, p_aliases text[], p_amount numeric, p_category text, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.saved_spends;
  v_row public.saved_spends;
  v_action uuid;
begin
  select * into v_existing from public.saved_spends where lower(name) = lower(btrim(p_name)) and deleted_at is null;
  if found then
    return jsonb_build_object('status', 'conflict', 'existing', to_jsonb(v_existing));
  end if;
  insert into public.saved_spends (name, aliases, amount, category)
  values (btrim(p_name), coalesce(p_aliases, '{}'), p_amount, coalesce(p_category, 'Other'))
  returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'saved_spends', v_row.id, null, to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.update_saved_spend(
  p_id uuid, p_name text, p_aliases text[], p_amount numeric, p_category text, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.saved_spends;
  v_existing public.saved_spends;
  v_row public.saved_spends;
  v_action uuid;
begin
  select * into v_before from public.saved_spends where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_existing from public.saved_spends where lower(name) = lower(btrim(p_name)) and deleted_at is null and id <> p_id;
  if found then
    return jsonb_build_object('status', 'conflict', 'existing', to_jsonb(v_existing));
  end if;
  update public.saved_spends
  set name = btrim(p_name), aliases = coalesce(p_aliases, '{}'), amount = p_amount, category = coalesce(p_category, 'Other')
  where id = p_id returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'saved_spends', p_id, to_jsonb(v_before), to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Soft delete: Undo brings it back. Spending already logged from it stays.
create function public.delete_saved_spend(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.saved_spends;
  v_row public.saved_spends;
  v_action uuid;
begin
  select * into v_before from public.saved_spends where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  update public.saved_spends set deleted_at = now() where id = p_id returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'saved_spends', p_id, to_jsonb(v_before), to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Logs a saved spending as an ordinary spending entry: its name, category, and the saved
-- amount × p_count, or p_amount (a one-off price) × p_count when given. 'missing_amount'
-- when there's neither (a saved spending with no fixed amount).
create function public.log_saved_spend(
  p_date date, p_id uuid, p_count numeric default 1, p_amount numeric default null, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_saved public.saved_spends;
  v_amount numeric;
  v_row public.spending;
  v_action uuid;
begin
  select * into v_saved from public.saved_spends where id = p_id and deleted_at is null;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  v_amount := coalesce(p_amount, v_saved.amount);
  if v_amount is null then
    return jsonb_build_object('status', 'missing_amount', 'saved', to_jsonb(v_saved));
  end if;
  if coalesce(p_count, 1) <= 0 or v_amount <= 0 then
    raise exception 'count and amount must be more than 0';
  end if;
  insert into public.spending (logical_date, amount, what, category)
  values (p_date, greatest(round(v_amount * coalesce(p_count, 1), 2), 0.01), v_saved.name, v_saved.category)
  returning * into v_row;
  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'spending', v_row.id, null, to_jsonb(v_row)) returning id into v_action;
  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Undo covers saved spendings. Full list: start from the latest definition when changing
-- it (20261113120000_chess_notes).
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
                              'callback_updates', 'chess_notes', 'saved_spends'])
$$;

revoke execute on function
  public.save_saved_spend(text, text[], numeric, text, text),
  public.update_saved_spend(uuid, text, text[], numeric, text, text),
  public.delete_saved_spend(uuid, text),
  public.log_saved_spend(date, uuid, numeric, numeric, text)
from public, anon;
grant execute on function
  public.save_saved_spend(text, text[], numeric, text, text),
  public.update_saved_spend(uuid, text, text[], numeric, text, text),
  public.delete_saved_spend(uuid, text),
  public.log_saved_spend(date, uuid, numeric, numeric, text)
to authenticated;
