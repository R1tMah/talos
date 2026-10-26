-- System Design Prep: a temporary study plan on Watch (kind 'prep'). Nothing is
-- fetched; the curriculum lives in the source's config ({ start, days: [{ title,
-- tasks, links }] }), one day per calendar day from start. Delete the source when done.
alter table public.watch_sources drop constraint watch_sources_kind_check;
alter table public.watch_sources add constraint watch_sources_kind_check
  check (kind in ('espn_team', 'espn_news', 'headlines', 'jobs', 'weather', 'transit', 'newsletter', 'calendar', 'prep'));

-- The card, empty until the curriculum is loaded.
insert into public.watch_sources (kind, title, config, every_minutes, position)
select 'prep', 'System Design Prep', '{"start": "", "days": []}'::jsonb, 1440, coalesce(max(position), 0) + 1
from public.watch_sources;

-- Sunday mornings: a reminder for the mock interview with an AI (same list as other
-- reminders; not stacked if last week's is still open). 13:00 UTC is 9am in Boston
-- during daylight time, 8am in winter. Unschedule when the prep is over:
--   select cron.unschedule('sunday-sysdesign-mock');
select cron.schedule('sunday-sysdesign-mock', '0 13 * * 0',
  $$select public.add_scheduled_reminder('System design mock today. Paste the summary into System Design Mocks after.')$$);
