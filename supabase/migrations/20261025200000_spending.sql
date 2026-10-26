-- Spending: every time the owner spends money, logged by hand or from chat, out of
-- curiosity about where it goes. Not tied to the bank (that's finance_transactions);
-- amounts are what the owner typed. One fixed category per entry so a month can be
-- broken down. Kept out of the weekly review like the rest of Finances.
--
-- Same conventions as the other slices: security invoker, actions row per write,
-- jsonb { status, row, action_id } results, soft delete.

create table public.spending (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logical_date date not null,
  amount numeric(10, 2) not null check (amount > 0),
  what text not null check (btrim(what) <> ''),
  category text not null default 'Other'
    check (category in ('Food & drink', 'Groceries', 'Transport', 'Shopping', 'Entertainment', 'School', 'Health', 'Other')),
  note text,
  deleted_at timestamptz
);

create index spending_date_idx on public.spending (logical_date desc, created_at desc) where deleted_at is null;

alter table public.spending enable row level security;
grant select, insert, update on public.spending to authenticated;
create policy owner_all on public.spending for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

create function public.log_spending(
  p_date date, p_amount numeric, p_what text, p_category text default 'Other', p_note text default null, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.spending;
  v_action uuid;
begin
  insert into public.spending (logical_date, amount, what, category, note)
  values (p_date, p_amount, btrim(p_what), coalesce(p_category, 'Other'), nullif(btrim(p_note), ''))
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'spending', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.update_spending(
  p_id uuid, p_date date, p_amount numeric, p_what text, p_category text, p_note text, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.spending;
  v_row public.spending;
  v_action uuid;
begin
  select * into v_before from public.spending where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.spending
  set logical_date = p_date, amount = p_amount, what = btrim(p_what), category = coalesce(p_category, 'Other'), note = nullif(btrim(p_note), '')
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'spending', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_spending(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.spending;
  v_row public.spending;
  v_action uuid;
begin
  select * into v_before from public.spending where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.spending set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'spending', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- Full list: start from the latest definition when changing it (20261025190500_phase_writes).
create or replace function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes',
                              'applications', 'foods', 'workouts', 'sets', 'exercises', 'application_reminders', 'runs',
                              'reminders', 'finance_transactions', 'checking_balances', 'vanguard_holdings', 'subscriptions',
                              'seasons', 'season_notes', 'phases', 'spending'])
$$;

revoke execute on function
  public.log_spending(date, numeric, text, text, text, text),
  public.update_spending(uuid, date, numeric, text, text, text, text),
  public.delete_spending(uuid, text)
from public, anon;

grant execute on function
  public.log_spending(date, numeric, text, text, text, text),
  public.update_spending(uuid, date, numeric, text, text, text, text),
  public.delete_spending(uuid, text)
to authenticated;
