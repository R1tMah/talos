-- Notes: marking done and back, Undo.

select pg_temp.put('n', public.add_note('talos', '2099-10-01', 'swipe between tabs')::text);
select pg_temp.put('done', public.set_note_done(((pg_temp.get('n'))::jsonb->'row'->>'id')::uuid, true)->>'action_id');
select pg_temp.ok('marking a note done sets done_at',
  (select done_at is not null from public.notes where body = 'swipe between tabs' and logical_date = '2099-10-01'));
select pg_temp.ok('marking it done again changes nothing',
  public.set_note_done(((pg_temp.get('n'))::jsonb->'row'->>'id')::uuid, true)->'action_id' = 'null'::jsonb);
select public.undo_action(pg_temp.get('done')::uuid);
select pg_temp.ok('undoing done reopens it',
  (select done_at is null from public.notes where body = 'swipe between tabs' and logical_date = '2099-10-01'));
