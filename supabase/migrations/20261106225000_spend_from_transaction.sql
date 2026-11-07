-- Add a checking transaction to Spending with one button on Finances > Accounts. The
-- spending entry remembers which transaction it came from (spending.finance_transaction_id),
-- so the row shows "In spending" afterwards and the same transaction can't be added twice
-- while its entry is live. Deleting or undoing the entry frees the transaction again.
-- The entry is an ordinary spending row: editable and deletable in Spending like any other.

alter table public.spending add column finance_transaction_id uuid references public.finance_transactions(id);
create unique index spending_finance_txn_idx on public.spending (finance_transaction_id)
  where finance_transaction_id is not null and deleted_at is null;

create function public.spend_transaction(
  p_transaction_id uuid, p_date date, p_amount numeric, p_what text, p_category text default 'Other',
  p_note text default null, p_tool text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.spending;
  v_action uuid;
begin
  if not exists (select 1 from public.finance_transactions where id = p_transaction_id and deleted_at is null) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if exists (select 1 from public.spending where finance_transaction_id = p_transaction_id and deleted_at is null) then
    return jsonb_build_object('status', 'conflict');
  end if;

  insert into public.spending (logical_date, amount, what, category, note, finance_transaction_id)
  values (p_date, p_amount, btrim(p_what), coalesce(p_category, 'Other'), nullif(btrim(p_note), ''), p_transaction_id)
  returning * into v_row;

  insert into public.actions (tool, table_name, row_id, before, after)
  values (p_tool, 'spending', v_row.id, null, to_jsonb(v_row))
  returning id into v_action;

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_row), 'action_id', v_action);
end;
$$;

revoke execute on function public.spend_transaction(uuid, date, numeric, text, text, text, text) from public, anon;
grant execute on function public.spend_transaction(uuid, date, numeric, text, text, text, text) to authenticated;
