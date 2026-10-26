-- "To apply" reminders close when the application is added any way, and come back if
-- that application is undone.

select public.add_application_reminder('Zz Test Co', 'Backend Engineer', '2099-10-01');
select pg_temp.ok('the reminder is open',
  exists (select 1 from public.open_application_reminders where company = 'Zz Test Co'));

-- Added from the Applications tab (not through the reminder).
select pg_temp.put('app', public.save_application('Zz Test Co', 'Backend Engineer', '2099-10-02', 'Applied', null)::text);
select pg_temp.ok('adding the application closes it',
  not exists (select 1 from public.open_application_reminders where company = 'Zz Test Co'));

select public.undo_action(((pg_temp.get('app'))::jsonb->>'action_id')::uuid);
select pg_temp.ok('undoing the application brings it back',
  exists (select 1 from public.open_application_reminders where company = 'Zz Test Co'));

-- Two open reminders at one company: only the matching position closes.
select public.add_application_reminder('Zz Two Co', 'Frontend Engineer', '2099-10-01');
select public.add_application_reminder('Zz Two Co', 'Data Engineer', '2099-10-01');
select public.save_application('Zz Two Co', 'Data Engineer', '2099-10-02', 'Applied', null);
select pg_temp.ok('with two open at a company, only the matching position closes',
  (select array_agg(position) = array['Frontend Engineer'] from public.open_application_reminders where company = 'Zz Two Co'));
