-- Finances: transactions, checking balance, Vanguard holdings, Undo, the nightly
-- snapshot, and owner-only access.

-- Transactions: saved trimmed, zero and blank rejected, edit and delete with Undo.
select pg_temp.put('t', public.log_transaction('2099-10-20', -12.50, '  Chipotle  ', ' Food ', '')::text);
select pg_temp.ok('a transaction is saved with trimmed text and an empty note as null',
  exists (select 1 from public.finance_transactions where description = 'Chipotle' and category = 'Food' and note is null
          and amount = -12.50 and logical_date = '2099-10-20'));
select pg_temp.ok('a zero amount is rejected',
  pg_temp.err($$select public.log_transaction('2099-10-20', 0, 'nothing')$$) = '23514');
select pg_temp.ok('a blank description is rejected',
  pg_temp.err($$select public.log_transaction('2099-10-20', -5, '   ')$$) = '23514');

select pg_temp.put('t_id', (pg_temp.get('t'))::jsonb->'row'->>'id');
select pg_temp.put('edit', public.update_transaction(pg_temp.get('t_id')::uuid, '2099-10-21', -14, 'Chipotle bowl', null, 'extra guac')->>'action_id');
select pg_temp.ok('editing replaces the fields',
  exists (select 1 from public.finance_transactions where id = pg_temp.get('t_id')::uuid
          and amount = -14 and description = 'Chipotle bowl' and category is null and note = 'extra guac'));
select public.undo_action(pg_temp.get('edit')::uuid);
select pg_temp.ok('undoing the edit restores the original',
  exists (select 1 from public.finance_transactions where id = pg_temp.get('t_id')::uuid and amount = -12.50 and description = 'Chipotle'));

select pg_temp.put('del', public.delete_transaction(pg_temp.get('t_id')::uuid)->>'action_id');
select pg_temp.ok('deleting is a soft delete',
  exists (select 1 from public.finance_transactions where id = pg_temp.get('t_id')::uuid and deleted_at is not null));
select pg_temp.ok('deleting again is not_found',
  public.delete_transaction(pg_temp.get('t_id')::uuid)->>'status' = 'not_found');
select public.undo_action(pg_temp.get('del')::uuid);
select pg_temp.ok('undoing the delete brings it back',
  exists (select 1 from public.finance_transactions where id = pg_temp.get('t_id')::uuid and deleted_at is null));

-- Checking balance: each reading is kept; the latest is current; Undo removes a reading.
select public.set_checking_balance('2099-10-19', 900);
select pg_temp.put('bal', public.set_checking_balance('2099-10-21', 1234.56)->>'action_id');
select pg_temp.ok('the latest reading is the current balance',
  (select balance from public.checking_balances where deleted_at is null and logical_date >= '2099-01-01'
   order by logical_date desc, created_at desc limit 1) = 1234.56);
select public.undo_action(pg_temp.get('bal')::uuid);
select pg_temp.ok('undoing a reading falls back to the previous one',
  (select balance from public.checking_balances where deleted_at is null and logical_date >= '2099-01-01'
   order by logical_date desc, created_at desc limit 1) = 900);

-- Holdings: add, edit (updated_at moves), negative rejected, delete with Undo.
select pg_temp.put('h', public.add_holding(' VTSAX ', 10.5, 1500)->>'row');
select pg_temp.put('h_id', (pg_temp.get('h'))::jsonb->>'id');
select pg_temp.ok('a holding is saved with a trimmed fund name',
  exists (select 1 from public.vanguard_holdings where id = pg_temp.get('h_id')::uuid and fund = 'VTSAX' and shares = 10.5 and value = 1500));
select pg_temp.ok('negative shares are rejected',
  pg_temp.err($$select public.add_holding('VTI', -1, 10)$$) = '23514');
select public.update_holding(pg_temp.get('h_id')::uuid, 'VTSAX', 11, 1650.25);
select pg_temp.ok('editing a holding updates it',
  exists (select 1 from public.vanguard_holdings where id = pg_temp.get('h_id')::uuid and shares = 11 and value = 1650.25));
select pg_temp.put('hdel', public.delete_holding(pg_temp.get('h_id')::uuid)->>'action_id');
select public.undo_action(pg_temp.get('hdel')::uuid);
select pg_temp.ok('undoing a holding delete restores it',
  exists (select 1 from public.vanguard_holdings where id = pg_temp.get('h_id')::uuid and deleted_at is null));

-- Snapshots: the app can read them but not write them, or run the snapshot itself.
select pg_temp.ok('the app cannot write snapshots',
  pg_temp.err($$insert into public.net_worth_snapshots (snapshot_date, total) values ('2099-01-01', 1)$$) = '42501');
select pg_temp.ok('the app cannot run the snapshot function',
  pg_temp.err($$select public.finance_snapshot()$$) = '42501');

-- Another signed-in user sees none of it and can't write.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table _other as select
  (select count(*) from public.finance_transactions) + (select count(*) from public.checking_balances)
  + (select count(*) from public.vanguard_holdings) + (select count(*) from public.net_worth_snapshots) as n;
select pg_temp.put('other_write', pg_temp.err($$select public.log_transaction('2099-10-20', -1, 'sneaky')$$));
select set_config('request.jwt.claims', '{"sub":"440421a2-aa8b-4990-875e-f1433dd8be01","role":"authenticated"}', true);
select pg_temp.ok('another signed-in user sees no finances', (select n from _other) = 0);
select pg_temp.ok('another signed-in user cannot add a transaction', pg_temp.get('other_write') = '42501');
