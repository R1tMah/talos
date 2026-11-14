-- Saved spendings: saved once, logged as ordinary spending entries (saved amount × count,
-- or a one-off price), names unique among live ones, and every write undoable.

select pg_temp.put('latte', public.save_saved_spend('ZZ Iced latte', array['zz latte'], 6.25, 'Food & drink')->'row'->>'id');
select pg_temp.ok('a saved spending saves', pg_temp.get('latte') is not null);
select pg_temp.ok('the same name again is a conflict, any case',
  public.save_saved_spend('zz iced LATTE', '{}', 5, 'Other')->>'status' = 'conflict');

select pg_temp.put('log', public.log_saved_spend('2099-03-03', pg_temp.get('latte')::uuid, 2)::text);
select pg_temp.ok('logging it adds a spending entry for the saved amount × count, with its name and category',
  exists (select 1 from public.spending where id = (pg_temp.get('log')::jsonb->'row'->>'id')::uuid
          and amount = 12.50 and what = 'ZZ Iced latte' and category = 'Food & drink' and logical_date = '2099-03-03'));
select pg_temp.ok('a one-off price replaces the saved one',
  (public.log_saved_spend('2099-03-03', pg_temp.get('latte')::uuid, 1, 7)->'row'->>'amount')::numeric = 7);

select pg_temp.put('gas', public.save_saved_spend('ZZ Gas', '{}', null, 'Transport')->'row'->>'id');
select pg_temp.ok('with no saved amount, logging needs one',
  public.log_saved_spend('2099-03-03', pg_temp.get('gas')::uuid)->>'status' = 'missing_amount');
select pg_temp.ok('and works with one given',
  public.log_saved_spend('2099-03-03', pg_temp.get('gas')::uuid, 1, 40)->>'status' = 'saved');

select pg_temp.put('del', public.delete_saved_spend(pg_temp.get('latte')::uuid)->>'action_id');
select pg_temp.ok('deleting it hides it',
  exists (select 1 from public.saved_spends where id = pg_temp.get('latte')::uuid and deleted_at is not null));
select pg_temp.ok('a deleted one cannot be logged',
  public.log_saved_spend('2099-03-03', pg_temp.get('latte')::uuid)->>'status' = 'not_found');
select public.undo_action(pg_temp.get('del')::uuid);
select pg_temp.ok('undo brings it back',
  exists (select 1 from public.saved_spends where id = pg_temp.get('latte')::uuid and deleted_at is null));
