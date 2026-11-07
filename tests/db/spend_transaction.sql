-- Adding a checking transaction to Spending: linked, once, and freed again on delete.

select pg_temp.put('t', (public.log_transaction('2099-03-01', -14.50, 'CHIPOTLE 1234', 'Food and drink', null))->'row'->>'id');

select pg_temp.put('s', public.spend_transaction(pg_temp.get('t')::uuid, '2099-03-01', 14.50, 'Chipotle', 'Food & drink')::text);
select pg_temp.ok('adding a transaction to spending saves a linked entry',
  exists (select 1 from public.spending where finance_transaction_id = pg_temp.get('t')::uuid and what = 'Chipotle' and amount = 14.50 and deleted_at is null));

select pg_temp.ok('the same transaction can''t be added twice',
  (public.spend_transaction(pg_temp.get('t')::uuid, '2099-03-01', 14.50, 'Chipotle again', 'Food & drink')->>'status') = 'conflict'
  and (select count(*) from public.spending where finance_transaction_id = pg_temp.get('t')::uuid) = 1);

select public.delete_spending(((pg_temp.get('s'))::jsonb->'row'->>'id')::uuid);
select pg_temp.ok('once its entry is deleted, it can be added again',
  (public.spend_transaction(pg_temp.get('t')::uuid, '2099-03-01', 14.50, 'Chipotle', 'Food & drink')->>'status') = 'saved');

select pg_temp.ok('a transaction that doesn''t exist is not_found',
  (public.spend_transaction(gen_random_uuid(), '2099-03-01', 5, 'x')->>'status') = 'not_found');
