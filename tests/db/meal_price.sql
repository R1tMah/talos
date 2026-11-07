-- Meal prices: logging a priced saved meal also logs its spending, and the two stay in
-- step through portion edits, day moves, delete, and undo/redo.

select pg_temp.put('meal', public.save_meal(p_name => 'ZZ priced bowl', p_aliases => '{}', p_portion_unit => 'bowl',
  p_calories => 700, p_protein_g => 50, p_price => 12.45)->'row'->>'id');
select pg_temp.ok('a meal saves with its price',
  (select price from public.saved_meals where id = pg_temp.get('meal')::uuid) = 12.45);

select pg_temp.put('log', public.log_saved_meal(p_date => '2099-05-05', p_meal_id => pg_temp.get('meal')::uuid, p_portions => 2)::text);
select pg_temp.put('entry', pg_temp.get('log')::jsonb->'row'->>'id');
select pg_temp.put('spend', pg_temp.get('log')::jsonb->'spending'->>'id');
select pg_temp.ok('logging it also logs Food & drink spending for price × portions',
  exists (select 1 from public.spending where id = pg_temp.get('spend')::uuid and amount = 24.90 and what = 'ZZ priced bowl'
          and category = 'Food & drink' and logical_date = '2099-05-05' and food_log_id = pg_temp.get('entry')::uuid));
select pg_temp.ok('the spending has its own undo action',
  (pg_temp.get('log')::jsonb->>'spending_action_id') is not null);

select public.set_food_portions(pg_temp.get('entry')::uuid, '2099-05-06', 1);
select pg_temp.ok('new portions and day carry over to the spending',
  exists (select 1 from public.spending where id = pg_temp.get('spend')::uuid and amount = 12.45 and logical_date = '2099-05-06'));

select pg_temp.put('del', public.delete_food_entry(pg_temp.get('entry')::uuid)->>'action_id');
select pg_temp.ok('deleting the entry deletes its spending',
  exists (select 1 from public.spending where id = pg_temp.get('spend')::uuid and deleted_at is not null));
select public.undo_action(pg_temp.get('del')::uuid);
select pg_temp.ok('undoing the delete brings the spending back',
  exists (select 1 from public.spending where id = pg_temp.get('spend')::uuid and deleted_at is null));

select pg_temp.put('log2', public.log_saved_meal(p_date => '2099-05-05', p_meal_id => pg_temp.get('meal')::uuid)::text);
select pg_temp.put('undo2', public.undo_action((pg_temp.get('log2')::jsonb->>'action_id')::uuid)->>'redo_id');
select pg_temp.ok('undoing the log removes its spending',
  exists (select 1 from public.spending where id = (pg_temp.get('log2')::jsonb->'spending'->>'id')::uuid and deleted_at is not null));
select public.undo_action(pg_temp.get('undo2')::uuid);
select pg_temp.ok('redoing the log brings its spending back',
  exists (select 1 from public.spending where id = (pg_temp.get('log2')::jsonb->'spending'->>'id')::uuid and deleted_at is null));

select pg_temp.put('quiet', public.log_saved_meal(p_date => '2099-05-07', p_meal_id => pg_temp.get('meal')::uuid, p_spend => false)::text);
select pg_temp.ok('p_spend false logs the food only',
  (pg_temp.get('quiet')::jsonb->'spending') = 'null'::jsonb
  and not exists (select 1 from public.spending where food_log_id = (pg_temp.get('quiet')::jsonb->'row'->>'id')::uuid));

select public.update_meal(pg_temp.get('meal')::uuid, 'ZZ priced bowl', '{}', 'bowl', 700, 50, null, null);
select pg_temp.ok('an edit that leaves out the price keeps it',
  (select price from public.saved_meals where id = pg_temp.get('meal')::uuid) = 12.45);
select public.update_meal(pg_temp.get('meal')::uuid, 'ZZ priced bowl', '{}', 'bowl', 700, 50, null, null, 'manual', null);
select pg_temp.ok('a null price clears it',
  (select price from public.saved_meals where id = pg_temp.get('meal')::uuid) is null);

select pg_temp.put('free', public.log_saved_meal(p_date => '2099-05-08', p_meal_id => pg_temp.get('meal')::uuid)::text);
select pg_temp.ok('a meal with no price logs no spending',
  (pg_temp.get('free')::jsonb->'spending') = 'null'::jsonb);
