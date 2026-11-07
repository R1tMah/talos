-- Long-term reminders: off the banner list until their "show from" day, always on their own list.

select pg_temp.put('far', public.add_reminder('renew passport', '2099-12-01', '2099-01-01', 'manual', '2099-11-01')::text);
select pg_temp.put('due', public.add_reminder('file taxes early', null, '2000-01-01', 'manual', '2000-02-01')::text);
select pg_temp.put('plain', public.add_reminder('call the landlord', null, '2099-01-02')::text);

select pg_temp.ok('a long-term reminder keeps its show-from date',
  (select surface_date from public.reminders where id = ((pg_temp.get('far'))::jsonb->'row'->>'id')::uuid) = '2099-11-01');

select pg_temp.ok('a long-term reminder whose day has not come stays off the banner list',
  not exists (select 1 from public.open_reminders where body = 'renew passport'));
select pg_temp.ok('a long-term reminder whose day has come is on the banner list',
  exists (select 1 from public.open_reminders where body = 'file taxes early'));
select pg_temp.ok('an ordinary reminder is still on the banner list',
  exists (select 1 from public.open_reminders where body = 'call the landlord'));

select pg_temp.ok('the long-term list has both long-term reminders, soonest show-from first, and not the ordinary one',
  (select array_agg(body) from (select body from public.open_long_term_reminders where body in ('renew passport', 'file taxes early', 'call the landlord')) x)
  = array['file taxes early', 'renew passport']);
select pg_temp.ok('the long-term list says which ones are on TALOS now',
  (select surfaced from public.open_long_term_reminders where body = 'file taxes early')
  and not (select surfaced from public.open_long_term_reminders where body = 'renew passport'));

select pg_temp.ok('show-from after the due date is rejected',
  pg_temp.err($$select public.add_reminder('backwards', '2099-01-01', '2099-01-01', 'manual', '2099-02-01')$$) = '23514');

-- Moving the show-from day to the past puts it on the banner; Undo moves it back.
select pg_temp.put('edit', public.update_reminder(((pg_temp.get('far'))::jsonb->'row'->>'id')::uuid, 'renew passport', '2099-12-01', 'manual', '2000-01-01')->>'action_id');
select pg_temp.ok('moving the show-from day to the past puts it on the banner list',
  exists (select 1 from public.open_reminders where body = 'renew passport'));
select public.undo_action(pg_temp.get('edit')::uuid);
select pg_temp.ok('undoing the edit takes it back off the banner list',
  not exists (select 1 from public.open_reminders where body = 'renew passport')
  and (select surface_date from public.reminders where id = ((pg_temp.get('far'))::jsonb->'row'->>'id')::uuid) = '2099-11-01');

-- Done takes it off both lists.
select public.complete_reminder(((pg_temp.get('due'))::jsonb->'row'->>'id')::uuid);
select pg_temp.ok('done takes a long-term reminder off both lists',
  not exists (select 1 from public.open_reminders where body = 'file taxes early')
  and not exists (select 1 from public.open_long_term_reminders where body = 'file taxes early'));
