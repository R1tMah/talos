-- General reminders: verbatim text, order, done, dismiss, Undo.

select pg_temp.put('a', public.add_reminder(E'  call the landlord re: lease 😩  ', null, '2099-10-01')::text);
select pg_temp.put('b', public.add_reminder('renew passport', '2099-11-01', '2099-10-02')::text);
select pg_temp.put('c', public.add_reminder('dentist', '2099-10-15', '2099-10-03')::text);
select pg_temp.ok('a reminder is saved byte for byte',
  (select body from public.reminders where id = ((pg_temp.get('a'))::jsonb->'row'->>'id')::uuid) = E'  call the landlord re: lease 😩  ');
select pg_temp.ok('an empty reminder is rejected',
  pg_temp.err($$select public.add_reminder('   ', null, '2099-10-01')$$) = '23514');

-- Dated reminders first by due date, then undated ones oldest first.
select pg_temp.ok('open reminders list dated ones by due date, then undated ones',
  (select array_agg(body) from (select body from public.open_reminders where noted_date >= '2099-01-01') x)
  = array['dentist', 'renew passport', E'  call the landlord re: lease 😩  ']);

-- Done takes it off the list; Undo brings it back.
select pg_temp.put('done', public.complete_reminder(((pg_temp.get('c'))::jsonb->'row'->>'id')::uuid)->>'action_id');
select pg_temp.ok('done takes a reminder off the open list',
  not exists (select 1 from public.open_reminders where body = 'dentist'));
select public.undo_action(pg_temp.get('done')::uuid);
select pg_temp.ok('undoing done puts it back',
  exists (select 1 from public.open_reminders where body = 'dentist'));

-- Dismiss is a soft delete; Undo restores it.
select pg_temp.put('dis', public.dismiss_reminder(((pg_temp.get('b'))::jsonb->'row'->>'id')::uuid)->>'action_id');
select pg_temp.ok('dismissing soft-deletes the reminder',
  exists (select 1 from public.reminders where body = 'renew passport' and deleted_at is not null)
  and not exists (select 1 from public.open_reminders where body = 'renew passport'));
select public.undo_action(pg_temp.get('dis')::uuid);
select pg_temp.ok('undoing a dismiss restores it',
  exists (select 1 from public.open_reminders where body = 'renew passport'));

-- Editing keeps the new text exactly; another user sees nothing.
select public.update_reminder(((pg_temp.get('a'))::jsonb->'row'->>'id')::uuid, E'call landlord\n- lease', '2099-10-05');
select pg_temp.ok('editing saves the new text exactly and the due date',
  exists (select 1 from public.reminders where body = E'call landlord\n- lease' and due_date = '2099-10-05'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table _other as select count(*) n from public.reminders;
select set_config('request.jwt.claims', '{"sub":"440421a2-aa8b-4990-875e-f1433dd8be01","role":"authenticated"}', true);
select pg_temp.ok('another signed-in user sees no reminders', (select n from _other) = 0);
