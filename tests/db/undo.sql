-- Undo and redo (#120-#125), soft delete (#127), message dedupe (#128).

-- #120 Undo of an insert soft-deletes the row.
select pg_temp.put('ins', public.save_weight('2099-08-01', 170.0)::text);
select public.undo_action(((pg_temp.get('ins'))::jsonb->>'action_id')::uuid);
select pg_temp.ok('#120 undo of an insert soft-deletes the row',
  (select deleted_at is not null from public.weights where id = ((pg_temp.get('ins'))::jsonb->'row'->>'id')::uuid));

-- #121 Undo of an update restores the before values.
select pg_temp.put('w', public.save_weight('2099-08-02', 170.0)->'row'->>'id');
select pg_temp.put('upd', public.update_weight(pg_temp.get('w')::uuid, '2099-08-02', 175.0, 'later note')->>'action_id');
select public.undo_action(pg_temp.get('upd')::uuid);
select pg_temp.ok('#121 undo of an update restores the before values',
  exists (select 1 from public.weights where id = pg_temp.get('w')::uuid and weight_lb = 170.0 and note is null));

-- #122 Undo of a delete restores the row.
select pg_temp.put('del', public.delete_weight(pg_temp.get('w')::uuid)->>'action_id');
select public.undo_action(pg_temp.get('del')::uuid);
select pg_temp.ok('#122 undo of a delete restores the row',
  (select deleted_at is null from public.weights where id = pg_temp.get('w')::uuid));

-- #123 A row edited since returns a conflict and changes nothing.
select pg_temp.put('w2', public.save_weight('2099-08-03', 170.0)::text);
update public.weights set weight_lb = 171.0 where id = ((pg_temp.get('w2'))::jsonb->'row'->>'id')::uuid;
select pg_temp.ok('#123 undo of a row edited since returns conflict',
  public.undo_action(((pg_temp.get('w2'))::jsonb->>'action_id')::uuid)->>'status' = 'conflict');
select pg_temp.ok('#123 ...and changes nothing',
  exists (select 1 from public.weights where id = ((pg_temp.get('w2'))::jsonb->'row'->>'id')::uuid and weight_lb = 171.0 and deleted_at is null));

-- #124 Undoing an already-undone action is a no-op.
select pg_temp.ok('#124 undoing an already-undone action is a no-op',
  public.undo_action(pg_temp.get('upd')::uuid)->>'status' = 'not_found'
  and exists (select 1 from public.weights where id = pg_temp.get('w')::uuid and weight_lb = 170.0));

-- #125 With no id, undo takes the latest action that isn't undone. Every action in a
-- transaction shares now(), so the test spaces two out explicitly.
select pg_temp.put('a', public.save_weight('2099-08-04', 170.0)::text);
select pg_temp.put('b', public.save_weight('2099-08-05', 171.0)::text);
update public.actions set created_at = now() + interval '1 minute' where id = ((pg_temp.get('a'))::jsonb->>'action_id')::uuid;
update public.actions set created_at = now() + interval '2 minutes' where id = ((pg_temp.get('b'))::jsonb->>'action_id')::uuid;
select public.undo_action();
select pg_temp.ok('#125 undo with no id undoes the latest not-yet-undone action',
  (select deleted_at is not null from public.weights where logical_date = '2099-08-05' and id = ((pg_temp.get('b'))::jsonb->'row'->>'id')::uuid)
  and (select deleted_at is null from public.weights where id = ((pg_temp.get('a'))::jsonb->'row'->>'id')::uuid));

-- Redo restores what the undo removed.
select pg_temp.put('redo', public.undo_action(((pg_temp.get('a'))::jsonb->>'action_id')::uuid)->>'redo_id');
select public.undo_action(pg_temp.get('redo')::uuid);
select pg_temp.ok('#120 redo brings an undone insert back',
  (select deleted_at is null from public.weights where id = ((pg_temp.get('a'))::jsonb->'row'->>'id')::uuid));

-- #127 A soft-deleted row disappears from views and counts.
select pg_temp.put('food', public.log_food(p_date => '2099-08-06', p_description => 'x', p_calories => 100, p_protein_g => 10)->'row'->>'id');
select pg_temp.put('cbs', (select coalesce(sum(n), 0) from public.callback_counts)::text);
select pg_temp.put('cb', public.log_callback('2099-08-06', 'ZZ Co', 'OA', null, null, null)->'row'->>'id');
select pg_temp.put('lc', public.log_leetcode(p_date => '2099-08-06', p_title => 'ZZ Problem', p_redo => true)->'row'->>'id');
select public.delete_food_entry(pg_temp.get('food')::uuid);
select public.delete_callback(pg_temp.get('cb')::uuid);
select public.delete_leetcode(pg_temp.get('lc')::uuid);
select pg_temp.ok('#127 a deleted food entry is gone from daily totals',
  not exists (select 1 from public.daily_totals where logical_date = '2099-08-06'));
select pg_temp.ok('#127 a deleted callback is gone from the counts',
  (select coalesce(sum(n), 0) from public.callback_counts)::text = pg_temp.get('cbs'));
select pg_temp.ok('#127 a deleted LeetCode attempt is gone from the redo queue',
  not exists (select 1 from public.redo_queue where title = 'ZZ Problem'));

-- #128 The same client_msg_id can only be logged once.
insert into public.message_log (client_msg_id, text) values ('zz-test-msg', 'hi');
select pg_temp.ok('#128 a repeated client_msg_id is rejected by the database',
  pg_temp.err($$insert into public.message_log (client_msg_id, text) values ('zz-test-msg', 'hi')$$) = '23505');
