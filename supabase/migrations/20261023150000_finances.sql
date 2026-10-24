-- Finances: PNC checking (balance + transactions), Vanguard (holdings), and a daily
-- net worth snapshot TALOS saves itself. Loans are out of scope (handled elsewhere).
--
-- Everything is entered by hand; no bank connections. The checking balance is the
-- latest balance entered (transactions don't add up to it: there's no opening
-- balance). The Vanguard total is the sum of its holdings' values.
--
-- Kept out of chat and the weekly review: no chat tools, and nothing here is read by
-- the agent. Same conventions as the other slices: security invoker, actions row per
-- write, jsonb { status, row, action_id } results, soft delete.

-- ---- Tables ------------------------------------------------------------------------

-- Money in or out of PNC checking. Negative = spent, positive = deposited.
create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logical_date date not null,
  amount numeric(12, 2) not null check (amount <> 0),
  description text not null check (btrim(description) <> ''),
  category text,
  note text,
  deleted_at timestamptz
);

-- The PNC checking balance as read off the bank app on a date. Latest live row = current.
create table public.checking_balances (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logical_date date not null,
  balance numeric(12, 2) not null,
  deleted_at timestamptz
);

-- One row per fund held at Vanguard, edited in place when the numbers change.
create table public.vanguard_holdings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fund text not null check (btrim(fund) <> ''),
  shares numeric(14, 4) not null check (shares >= 0),
  value numeric(12, 2) not null check (value >= 0),
  deleted_at timestamptz
);

-- One row per logical day, written by public.finance_snapshot() (pg_cron). Read-only
-- to the app. A null side means there was nothing entered for that account yet.
create table public.net_worth_snapshots (
  snapshot_date date primary key,
  created_at timestamptz not null default now(),
  checking numeric(12, 2),
  vanguard numeric(12, 2),
  total numeric(12, 2) not null
);

create index finance_transactions_date_idx on public.finance_transactions (logical_date desc, created_at desc) where deleted_at is null;

alter table public.finance_transactions enable row level security;
alter table public.checking_balances enable row level security;
alter table public.vanguard_holdings enable row level security;
alter table public.net_worth_snapshots enable row level security;

grant select, insert, update on public.finance_transactions, public.checking_balances, public.vanguard_holdings to authenticated;
grant select on public.net_worth_snapshots to authenticated;

create policy owner_all on public.finance_transactions for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.checking_balances for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_all on public.vanguard_holdings for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy owner_read on public.net_worth_snapshots for select to authenticated
  using ((select public.is_owner()));

-- ---- Transactions ------------------------------------------------------------------

create function public.log_transaction(
  p_date date, p_amount numeric, p_description text, p_category text default null, p_note text default null,
  p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.finance_transactions;
  v_action uuid;
begin
  insert into public.finance_transactions (logical_date, amount, description, category, note)
  values (p_date, p_amount, btrim(p_description), nullif(btrim(p_category), ''), nullif(btrim(p_note), ''))
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'finance_transactions', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.update_transaction(
  p_id uuid, p_date date, p_amount numeric, p_description text, p_category text, p_note text, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.finance_transactions;
  v_row public.finance_transactions;
  v_action uuid;
begin
  select * into v_before from public.finance_transactions where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.finance_transactions
  set logical_date = p_date, amount = p_amount, description = btrim(p_description),
      category = nullif(btrim(p_category), ''), note = nullif(btrim(p_note), '')
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'finance_transactions', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_transaction(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.finance_transactions;
  v_row public.finance_transactions;
  v_action uuid;
begin
  select * into v_before from public.finance_transactions where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.finance_transactions set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'finance_transactions', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- Checking balance --------------------------------------------------------------

-- A new reading; the old ones stay as history. Delete removes a mistaken reading.
create function public.set_checking_balance(p_date date, p_balance numeric, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.checking_balances;
  v_action uuid;
begin
  insert into public.checking_balances (logical_date, balance) values (p_date, p_balance) returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'checking_balances', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_checking_balance(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.checking_balances;
  v_row public.checking_balances;
  v_action uuid;
begin
  select * into v_before from public.checking_balances where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.checking_balances set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'checking_balances', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- Vanguard holdings -------------------------------------------------------------

create function public.add_holding(p_fund text, p_shares numeric, p_value numeric, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.vanguard_holdings;
  v_action uuid;
begin
  insert into public.vanguard_holdings (fund, shares, value) values (btrim(p_fund), p_shares, p_value) returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'vanguard_holdings', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.update_holding(p_id uuid, p_fund text, p_shares numeric, p_value numeric, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.vanguard_holdings;
  v_row public.vanguard_holdings;
  v_action uuid;
begin
  select * into v_before from public.vanguard_holdings where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.vanguard_holdings
  set fund = btrim(p_fund), shares = p_shares, value = p_value, updated_at = now()
  where id = p_id
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'vanguard_holdings', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

create function public.delete_holding(p_id uuid, p_tool text default 'manual')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.vanguard_holdings;
  v_row public.vanguard_holdings;
  v_action uuid;
begin
  select * into v_before from public.vanguard_holdings where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.vanguard_holdings set deleted_at = now() where id = p_id returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'vanguard_holdings', p_id, to_jsonb(v_before), to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

-- ---- Net worth snapshot ------------------------------------------------------------

-- Saves today's net worth: the latest checking balance plus the Vanguard total, for
-- the current logical day in the owner's timezone (4am rule). Running it again the
-- same day replaces that day's row. Nothing entered yet = no row.
-- Runs as its owner from pg_cron, so it isn't granted to app users.
create function public.finance_snapshot()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date;
  v_checking numeric;
  v_vanguard numeric;
begin
  select (now() at time zone s.timezone - interval '4 hours')::date into v_day from public.settings s where s.id = 1;

  select balance into v_checking from public.checking_balances
  where deleted_at is null order by logical_date desc, created_at desc limit 1;

  select sum(value) into v_vanguard from public.vanguard_holdings where deleted_at is null;

  if v_checking is null and v_vanguard is null then
    return;
  end if;

  insert into public.net_worth_snapshots (snapshot_date, checking, vanguard, total)
  values (v_day, v_checking, v_vanguard, coalesce(v_checking, 0) + coalesce(v_vanguard, 0))
  on conflict (snapshot_date) do update
  set checking = excluded.checking, vanguard = excluded.vanguard, total = excluded.total, created_at = now();
end;
$$;

revoke execute on function public.finance_snapshot() from public, anon, authenticated;

-- 07:30 UTC is 3:30am in Boston (2:30 in winter): before the 4am rollover, so each
-- snapshot closes out the logical day it's dated.
select cron.schedule('finance-snapshot', '30 7 * * *', 'select public.finance_snapshot()');

-- ---- Undo --------------------------------------------------------------------------

-- Full list: start from the latest definition when changing it (20261023041619_reminders).
create or replace function public.undoable_table(p_table text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_table = any (array['weights', 'breaks', 'food_log', 'saved_meals', 'leetcode_log', 'callbacks', 'notes',
                              'applications', 'foods', 'workouts', 'sets', 'exercises', 'application_reminders', 'runs',
                              'reminders', 'finance_transactions', 'checking_balances', 'vanguard_holdings'])
$$;

-- ---- Grants ------------------------------------------------------------------------

revoke execute on function
  public.log_transaction(date, numeric, text, text, text, text),
  public.update_transaction(uuid, date, numeric, text, text, text, text),
  public.delete_transaction(uuid, text),
  public.set_checking_balance(date, numeric, text),
  public.delete_checking_balance(uuid, text),
  public.add_holding(text, numeric, numeric, text),
  public.update_holding(uuid, text, numeric, numeric, text),
  public.delete_holding(uuid, text)
from public, anon;

grant execute on function
  public.log_transaction(date, numeric, text, text, text, text),
  public.update_transaction(uuid, date, numeric, text, text, text, text),
  public.delete_transaction(uuid, text),
  public.set_checking_balance(date, numeric, text),
  public.delete_checking_balance(uuid, text),
  public.add_holding(text, numeric, numeric, text),
  public.update_holding(uuid, text, numeric, numeric, text),
  public.delete_holding(uuid, text)
to authenticated;
