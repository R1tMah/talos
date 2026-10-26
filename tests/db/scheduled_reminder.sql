-- The Friday work-journal reminder: added once, not stacked while it's still open.
-- The function is only for pg_cron (not callable by the app), so this runs as the owner role.
reset role;

select pg_temp.ok('the scheduled reminder is added, due today',
  (select public.add_scheduled_reminder('zz test: update your work journal')->>'status' = 'saved'));
select pg_temp.ok('it is due on the day it was added',
  (select due_date = noted_date from public.reminders where body = 'zz test: update your work journal'));
select pg_temp.ok('while it is still open, the next run adds no second copy',
  (select public.add_scheduled_reminder('zz test: update your work journal')->>'status' = 'skipped'));
update public.reminders set done_at = now() where body = 'zz test: update your work journal';
select pg_temp.ok('once done, the next week adds a fresh one',
  (select public.add_scheduled_reminder('zz test: update your work journal')->>'status' = 'saved'));
select pg_temp.ok('the app cannot call it',
  (select not has_function_privilege('authenticated', 'public.add_scheduled_reminder(text)', 'execute')));
