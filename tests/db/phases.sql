-- Phases from the Weight tab: add closes the open phase, overlaps are refused, Undo.

-- Start clean for the test years (the transaction is rolled back).
update public.phases set deleted_at = now() where deleted_at is null;

select pg_temp.put('a', public.add_phase('2099-01-01', null, 'Cut', 2000, 160, 'eating 2000')::text);
select pg_temp.ok('a phase is saved with its fields, description verbatim',
  (select name = 'Cut' and calorie_target = 2000 and protein_target_g = 160 and description = 'eating 2000' and end_date is null
   from public.phases where id = ((pg_temp.get('a'))::jsonb->'row'->>'id')::uuid));

select pg_temp.put('b', public.add_phase('2099-03-01', null, 'Maintain', 2300, null, null)::text);
select pg_temp.ok('a new phase after the open one closes it the day before',
  (select end_date = '2099-02-28' from public.phases where id = ((pg_temp.get('a'))::jsonb->'row'->>'id')::uuid));
select pg_temp.ok('targets follow the phase covering the date',
  (select calorie_target from public.targets_for('2099-02-15')) = 2000
  and (select calorie_target from public.targets_for('2099-03-15')) = 2300);

select pg_temp.ok('a phase inside a closed phase is refused, nothing changes',
  public.add_phase('2099-02-01', '2099-02-10', 'Trip', null, null, null)->>'status' = 'overlap'
  and (select count(*) from public.phases where deleted_at is null and start_date >= '2099-01-01') = 2);
select pg_temp.ok('editing into another phase is refused',
  public.update_phase(((pg_temp.get('b'))::jsonb->'row'->>'id')::uuid, '2099-02-20', null, 'Maintain', 2300, null, null)->>'status' = 'overlap');
select pg_temp.ok('end before start is invalid',
  public.add_phase('2099-06-10', '2099-06-01', null, null, null, null)->>'status' = 'invalid');
select pg_temp.ok('out-of-range calories are invalid',
  public.add_phase('2099-06-10', null, null, 99999, null, null)->>'status' = 'invalid');

select pg_temp.put('del', public.delete_phase(((pg_temp.get('b'))::jsonb->'row'->>'id')::uuid)->>'action_id');
select pg_temp.ok('delete is soft', exists (select 1 from public.phases where name = 'Maintain' and start_date = '2099-03-01' and deleted_at is not null));
select public.undo_action(pg_temp.get('del')::uuid);
select pg_temp.ok('undo brings a deleted phase back', exists (select 1 from public.phases where name = 'Maintain' and start_date = '2099-03-01' and deleted_at is null));
