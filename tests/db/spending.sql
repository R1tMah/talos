-- Spending: saved trimmed, checked, editable and deletable with Undo, owner only.

select pg_temp.put('s', public.log_spending('2099-10-20', 14.50, '  chipotle bowl  ', 'Food & drink')::text);
select pg_temp.put('s_id', (pg_temp.get('s'))::jsonb->'row'->>'id');
select pg_temp.ok('a purchase is saved with trimmed text',
  exists (select 1 from public.spending where id = pg_temp.get('s_id')::uuid and what = 'chipotle bowl' and amount = 14.50 and category = 'Food & drink'));
select pg_temp.ok('no category means Other',
  (public.log_spending('2099-10-20', 3, 'gum', null)->'row'->>'category') = 'Other');
select pg_temp.ok('zero or negative amounts are rejected',
  pg_temp.err($$select public.log_spending('2099-10-20', 0, 'nothing')$$) = '23514'
  and pg_temp.err($$select public.log_spending('2099-10-20', -5, 'refund')$$) = '23514');
select pg_temp.ok('a category outside the list is rejected',
  pg_temp.err($$select public.log_spending('2099-10-20', 5, 'thing', 'Car stuff')$$) = '23514');
select pg_temp.ok('a blank description is rejected',
  pg_temp.err($$select public.log_spending('2099-10-20', 5, '   ')$$) = '23514');

select pg_temp.put('edit', public.update_spending(pg_temp.get('s_id')::uuid, '2099-10-21', 16, 'chipotle bowl + chips', 'Food & drink', 'with guac')->>'action_id');
select pg_temp.ok('editing replaces the fields',
  exists (select 1 from public.spending where id = pg_temp.get('s_id')::uuid and amount = 16 and note = 'with guac' and logical_date = '2099-10-21'));
select public.undo_action(pg_temp.get('edit')::uuid);
select pg_temp.ok('undoing the edit restores it',
  exists (select 1 from public.spending where id = pg_temp.get('s_id')::uuid and amount = 14.50 and note is null));

select pg_temp.put('del', public.delete_spending(pg_temp.get('s_id')::uuid)->>'action_id');
select pg_temp.ok('deleting is a soft delete',
  exists (select 1 from public.spending where id = pg_temp.get('s_id')::uuid and deleted_at is not null));
select public.undo_action(pg_temp.get('del')::uuid);
select pg_temp.ok('undoing the delete brings it back',
  exists (select 1 from public.spending where id = pg_temp.get('s_id')::uuid and deleted_at is null));

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table _other as select count(*) n from public.spending;
select pg_temp.put('other_write', pg_temp.err($$select public.log_spending('2099-10-20', 1, 'sneaky')$$));
select set_config('request.jwt.claims', '{"sub":"440421a2-aa8b-4990-875e-f1433dd8be01","role":"authenticated"}', true);
select pg_temp.ok('another signed-in user sees no spending', (select n from _other) = 0);
select pg_temp.ok('another signed-in user cannot log spending', pg_temp.get('other_write') = '42501');
